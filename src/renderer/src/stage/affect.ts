import type { IRuntime } from '../runtime/iface'
import { createSynth, mulberry32, type Synth, type SynthFeed, type SynthPreset } from '../synth/synth'
import { composeFrame, initialFade, type CueParams, type FadeState, type StackEntry } from './compose'
import { PRESETS } from './presets'
import { driveTick, frameToLine, replayHistory } from './synthReplay'
import { createTraceBuffer, pushEngine, resetBuffer, type TraceBuffer } from './traceBuffer'

export type StageId = 'A' | 'B'
export type CueMotions = Readonly<Record<string, string>>

/** How long a panel cue preview holds before it fades back out. */
const PREVIEW_MS = 3000

export interface AffectDriver {
  /** Start a golden replay at the given seed/speed (default 1×). No-op while
   * one runs. `presets` picks a mapping preset per stage (002-D2); passing a
   * B entry runs A/B mode — stage B must have been added first. */
  play(name: string, seed: number, speed?: number, presets?: StagePresets): void
  pause(): void
  resume(): void
  setSpeed(speed: number): void
  /** Seek to scenario time tMs; main clamps/aligns and replays deterministically. */
  seek(tMs: number): void
  /** Read-only trace history for the overlay to draw from (002 step-6, decision 3). */
  buffer(stage?: StageId): TraceBuffer
  /** Register stage B once its runtime (second Hiyori) has loaded (002-D2). */
  addStage(id: StageId, runtime: IRuntime): void
  /** Panel cue preview: push a transient entry in front of the live
   * expression stack. Goes through the same compositor playback uses, so
   * what a preview shows is exactly what a scenario emote will show. */
  preview(cue: string, durationMs?: number): void
  /** Debug: back to a fresh-boot face. Pauses any run, drops the expression
   * stack / preview / in-flight fades, and releases every parameter the
   * affect layer has taken so the model's own idle motion owns them again.
   * Leaves the trace buffer alone — the overlay is history, not state. */
  reset(): void
  /** Tentatively refresh model defaults; returned closure restores driver state. */
  characterChanged(): () => void
}

/** What a stage's synth reads, plus the expression stack the compositor
 * reads — one object per feed message, so both stay in lockstep. */
type StageFeed = SynthFeed & { expressionStack?: readonly StackEntry[] }

// Per-stage state: own runtime, own synth instances, own rng stream (one
// mulberry32 per stage seeded with the SAME seed — stages never consume each
// other's random sequence), own compositor fade state, own trace buffer.
interface StageState {
  runtime: IRuntime
  /** Parameter defaults of this stage's model — the compositor's floor. */
  defaults: Record<string, number>
  /** Every id this stage has ever written — see `write()`. */
  driven: Set<string>
  feed: StageFeed
  live: Synth
  fade: FadeState
  replay: { synth: Synth; preset: SynthPreset; seed: number; lines: string[] } | null
  latest: Record<string, number> | null
  trace: TraceBuffer
  motionCue: string | null
}

/** Preview values win only for their own knobs; synth keeps driving the rest. */
export function withHeldPreview(
  frame: Readonly<Record<string, number>>,
  preview: Readonly<Record<string, number>> | null
): Record<string, number> {
  return preview === null ? { ...frame } : { ...frame, ...preview }
}

export function replaceHeldPreview(
  runtime: Pick<IRuntime, 'releaseParams'>,
  driven: ReadonlySet<string>,
  previous: Readonly<Record<string, number>> | null,
  next: Readonly<Record<string, number>> | null
): Record<string, number> | null {
  const nextIds = new Set(Object.keys(next ?? {}))
  const released = Object.keys(previous ?? {}).filter(
    (id) => !nextIds.has(id) && !driven.has(id)
  )
  if (released.length) runtime.releaseParams(released)
  return next === null ? null : { ...next }
}

/** Returns a motion only when the resolved front cue changes. */
export function nextMotionCue(
  previous: string | null,
  stack: readonly StackEntry[],
  motions: CueMotions,
  tMs: number
): { next: string | null; play: string | null } {
  let next: string | null = null
  for (const entry of stack) {
    if (typeof entry.expiryMs === 'number' && entry.expiryMs <= tMs) continue
    if (typeof entry.cueOrFreeform === 'string' && motions[entry.cueOrFreeform] !== undefined) {
      next = `${entry.cueOrFreeform}:${String(entry.expiryMs)}`
      return { next, play: next !== previous ? motions[entry.cueOrFreeform] : null }
    }
    break
  }
  return { next, play: null }
}

export function playMotionRef(runtime: Pick<IRuntime, 'playMotion'>, ref: string): void {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(ref)) {
    runtime.playMotion(ref)
    return
  }
  const [group, rawIndex] = ref.split(':', 2)
  if (!group) return
  const index = rawIndex === undefined ? undefined : Number(rawIndex)
  runtime.playMotion(group, Number.isInteger(index) && index! >= 0 ? index : undefined)
}

// Impure shell around the pure synth: owns the feed subscription, the
// live-vs-replay switch (slice SPEC §4), and presentation via
// IRuntime.setParams — now fanned out per stage (002-D2). Feed messages are
// routed by their stageId; normal mode is stage A only and behaves exactly
// as before.
//
//            clock source     rng           frame grid
//   live     performance.now  Math.random   one frame per rAF
//   replay   scenario time    mulberry32    3 frames per feed tick at exact
//                             (seed)        thirds (t + i·100/3), computed on
//                                           tick ARRIVAL — rAF only presents
//                                           the latest computed frame (002-D3)
export function createAffectDriver(
  runtime: IRuntime,
  preset: SynthPreset,
  cues: CueParams,
  motions: CueMotions = {}
): AffectDriver {
  // Rest-point feed so a Lar idles before any brain tick arrives.
  const restFeed = (): StageFeed => ({ E: { valence: 0.1, arousal: 0.25 } })
  const idlePreset = preset

  const makeStage = (rt: IRuntime): StageState => ({
    runtime: rt,
    defaults: Object.fromEntries(rt.parameters().map((p) => [p.id, p.default])),
    driven: new Set<string>(),
    feed: restFeed(),
    live: createSynth(idlePreset, Math.random),
    fade: initialFade(),
    replay: null,
    latest: null,
    trace: createTraceBuffer(),
    motionCue: null
  })

  const stages: Partial<Record<StageId, StageState>> = { A: makeStage(runtime) }

  const replaying = (): [StageId, StageState][] =>
    (Object.entries(stages) as [StageId, StageState][]).filter(([, st]) => st.replay)

  // The single composition path (compose.ts): synth output in, screen values
  // out, the stage's cross-fade state carried across frames. Every driven
  // parameter — replay, live idle, and panel preview alike — passes through
  // here exactly once per frame.
  const compose = (
    st: StageState,
    params: Record<string, number>,
    stack: readonly StackEntry[],
    tMs: number
  ): Record<string, number> => {
    const r = composeFrame(cues, params, st.defaults, stack, tMs, st.fade)
    st.fade = r.state
    return r.params
  }

  const composer =
    (st: StageState) =>
    (params: Record<string, number>, feed: StageFeed, tMs: number): Record<string, number> =>
      compose(st, params, feed.expressionStack ?? [], tMs)

  // Transient panel preview, stage A only. ponytail: ignored while a replay
  // runs — the replay's composed output must stay a pure function of the feed
  // and tick time (002-D3), and a click is neither.
  let preview: StackEntry | null = null
  let authoringPreview: Record<string, number> | null = null

  window.lares.onAuthoringPreview((value) => {
    if ('params' in value) {
      authoringPreview = replaceHeldPreview(
        stages.A!.runtime,
        stages.A!.driven,
        authoringPreview,
        value.params
      )
      return
    }
    authoringPreview = replaceHeldPreview(
      stages.A!.runtime,
      stages.A!.driven,
      authoringPreview,
      null
    )
    const params = cues[value.cue]
    if (params) {
      authoringPreview = replaceHeldPreview(
        stages.A!.runtime,
        stages.A!.driven,
        authoringPreview,
        params
      )
      return
    }
    const motion = motions[value.cue]
    if (motion) playMotionRef(stages.A!.runtime, motion)
  })
  window.lares.onAuthoringRevert(() => {
    authoringPreview = replaceHeldPreview(
      stages.A!.runtime,
      stages.A!.driven,
      authoringPreview,
      null
    )
  })

  window.lares.onAffectUpdate((f) => {
    const st = stages[f.stageId as StageId]
    if (!st) return
    st.feed = f
    const motion = nextMotionCue(st.motionCue, f.expressionStack ?? [], motions, f.tick * 100)
    st.motionCue = motion.next
    if (motion.play) playMotionRef(st.runtime, motion.play)
    if (!st.replay) return
    pushEngine(st.trace, f)
    for (const frame of driveTick(st.replay.synth, f, f.tick, composer(st))) {
      st.replay.lines.push(frameToLine(frame))
      st.trace.synth.push(frame)
      st.latest = frame.params
    }
  })

  // Seek lands here as one batch covering scenario time 0..T for every active
  // stage (main-side decision 1): per stage, rebuild the overlay buffer from
  // its own messages and re-seed + replay the synth through the same tick
  // sequence a normal run would have used, so post-seek frames stay
  // byte-identical to an unseeked run.
  window.lares.onScenarioSeeked((history) => {
    for (const [id, st] of replaying()) {
      const mine = history.filter((f) => f.stageId === id)
      const rp = st.replay!
      resetBuffer(st.trace)
      for (const f of mine) pushEngine(st.trace, f)
      // Fresh synth AND fresh compositor — both are stateful, both must
      // restart at tick 0 for the replayed frames to land byte-identical.
      st.fade = initialFade()
      const replayed = replayHistory(
        () => createSynth(rp.preset, mulberry32(rp.seed)),
        mine,
        () => composer(st)
      )
      rp.synth = replayed.synth
      rp.lines = replayed.frames.map(frameToLine)
      st.trace.synth.push(...replayed.frames)
      if (replayed.frames.length) st.latest = replayed.frames[replayed.frames.length - 1].params
      if (mine.length) st.feed = mine[mine.length - 1]
    }
  })

  window.lares.onScenarioEnd(() => {
    const active = replaying()
    if (active.length === 0) return
    const linesByStage: Record<string, string[]> = {}
    for (const [id, st] of active) {
      console.log(`[lares] replay done (stage ${id}): ${st.replay!.lines.length} synth frames traced`)
      linesByStage[id] = st.replay!.lines
      st.replay = null
      st.latest = null
      st.live = createSynth(idlePreset, Math.random) // fresh idle state after replay
      st.fade = initialFade()
    }
    window.lares.sendSynthTrace(linesByStage)
  })

  // IRuntime.setParams is a sticky merge: an id stops being written but keeps
  // its last value forever. Composed frames drop a cue's params once it has
  // faded out, and rAF may skip the frame that carried the resting value
  // (badly so at 64×, or whenever the window is occluded and rAF throttles) —
  // so a released param could stay pinned mid-fade. Every id the affect layer
  // has ever driven is therefore refilled with its resting value when the
  // frame omits it. Presentation only: the trace keeps the composed frame.
  const write = (
    st: StageState,
    frame: Record<string, number>,
    transient: ReadonlySet<string> = new Set()
  ): void => {
    let out = frame
    for (const id of st.driven) {
      if (id in out) continue
      if (out === frame) out = { ...frame }
      out[id] = st.defaults[id] ?? 0
    }
    for (const id of Object.keys(out)) if (!transient.has(id)) st.driven.add(id)
    st.runtime.setParams(out)
  }

  const withAuthoring = (
    id: StageId,
    st: StageState,
    frame: Record<string, number>
  ): void => {
    if (id !== 'A' || authoringPreview === null) {
      write(st, frame)
      return
    }
    const transient = new Set(
      Object.keys(authoringPreview).filter((param) => !(param in frame))
    )
    write(st, withHeldPreview(frame, authoringPreview), transient)
  }

  const present = (): void => {
    const now = performance.now()
    for (const [id, st] of Object.entries(stages) as [StageId, StageState][]) {
      if (!st) continue
      if (st.replay) {
        // Replay frames were composed on tick arrival, on the scenario clock.
        if (st.latest) withAuthoring(id, st, st.latest)
      } else {
        const stack = previewed(id, st.feed.expressionStack ?? [])
        const frame = compose(st, st.live.computeFrame(st.feed, now), stack, now)
        withAuthoring(id, st, frame)
      }
    }
    requestAnimationFrame(present)
  }

  const previewed = (id: StageId, stack: readonly StackEntry[]): readonly StackEntry[] =>
    preview && id === 'A' ? [preview, ...stack] : stack

  const reset = (refreshDefaults = false): void => {
    void window.lares.pauseScenario()
    preview = null
    authoringPreview = null
    for (const st of Object.values(stages)) {
      if (!st) continue
      if (refreshDefaults) {
        st.defaults = Object.fromEntries(st.runtime.parameters().map((p) => [p.id, p.default]))
      }
      st.latest = null
      st.feed = restFeed()
      st.fade = initialFade()
      st.driven.clear()
      st.runtime.resetParams()
    }
  }

  requestAnimationFrame(present)

  return {
    play(name: string, seed: number, speed = 1, presets: StagePresets = { A: 'default' }): void {
      if (replaying().length > 0) return
      const wanted: [StageId, string][] = [['A', presets.A]]
      if (presets.B !== undefined) wanted.push(['B', presets.B])
      for (const [id, presetName] of wanted) {
        if (!stages[id]) {
          console.error(`[lares] stage ${id} is not loaded`)
          return
        }
        if (!PRESETS[presetName]) {
          console.error(`[lares] unknown preset "${presetName}"`)
          return
        }
      }
      for (const [id, presetName] of wanted) {
        const st = stages[id]!
        st.replay = {
          synth: createSynth(PRESETS[presetName], mulberry32(seed)),
          preset: PRESETS[presetName],
          seed,
          lines: []
        }
        st.fade = initialFade()
        resetBuffer(st.trace)
      }
      preview = null
      authoringPreview = replaceHeldPreview(
        stages.A!.runtime,
        stages.A!.driven,
        authoringPreview,
        null
      )
      void window.lares.playScenario(name, seed, speed, presets).then((res) => {
        if (!res.ok) {
          console.error(`[lares] scenario:play refused: ${res.error}`)
          for (const [id] of wanted) {
            const st = stages[id]!
            st.replay = null
            st.latest = null
          }
          return
        }
        for (const [id] of wanted) stages[id]!.trace.endMs = res.endMs
      })
    },
    pause(): void {
      void window.lares.pauseScenario()
    },
    resume(): void {
      void window.lares.resumeScenario()
    },
    setSpeed(speed: number): void {
      void window.lares.setScenarioSpeed(speed)
    },
    seek(tMs: number): void {
      void window.lares.seekScenario(tMs)
    },
    buffer(stage: StageId = 'A'): TraceBuffer {
      return (stages[stage] ?? stages.A!).trace
    },
    addStage(id: StageId, rt: IRuntime): void {
      if (!stages[id]) stages[id] = makeStage(rt)
    },
    reset(): void {
      reset()
    },
    characterChanged(): () => void {
      const st = stages.A!
      const before = {
        preview,
        authoringPreview,
        defaults: st.defaults,
        driven: st.driven,
        feed: st.feed,
        fade: st.fade,
        latest: st.latest,
        motionCue: st.motionCue
      }
      const rollback = (): void => {
        preview = before.preview
        authoringPreview = before.authoringPreview
        st.defaults = before.defaults
        st.driven = before.driven
        st.feed = before.feed
        st.fade = before.fade
        st.latest = before.latest
        st.motionCue = before.motionCue
      }
      try {
        preview = null
        authoringPreview = null
        st.defaults = Object.fromEntries(st.runtime.parameters().map((p) => [p.id, p.default]))
        st.latest = null
        st.feed = restFeed()
        st.fade = initialFade()
        st.driven = new Set()
        st.motionCue = null
        st.runtime.resetParams()
        return rollback
      } catch (error) {
        rollback()
        throw error
      }
    },
    preview(cue: string, durationMs = PREVIEW_MS): void {
      if (!cues[cue]) {
        console.error(`[lares] unknown cue "${cue}"`)
        return
      }
      preview = { cueOrFreeform: cue, weight: 1, expiryMs: performance.now() + durationMs }
    }
  }
}
