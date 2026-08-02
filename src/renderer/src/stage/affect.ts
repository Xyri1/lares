import defaultPresetJson from '../../../../presets/default.json'
import {
  computeTarget,
  withOverlay,
  DEFAULT_FEEL,
  type FeelConfig,
  type FeelPoses,
  type Pose
} from '../feel/feel'
import type { IRuntime } from '../runtime/iface'
import { createSynth, mulberry32, type Synth, type SynthFeed, type SynthPreset } from '../synth/synth'
import { PRESETS } from './presets'
import { driveTick, frameToLine, replayHistory } from './synthReplay'
import { createTraceBuffer, pushEngine, resetBuffer, type TraceBuffer } from './traceBuffer'

// Bundled fallback for a character with no `performance` mapping — same
// preset boot (stage/index.ts) falls back to. Never the previous character's
// preset, and never the driver's constructor `preset` (which may itself be a
// character-specific mapping, e.g. Haru's, at boot).
const defaultPreset = defaultPresetJson as SynthPreset

export type StageId = 'A' | 'B'

export interface CharacterChangeTransaction {
  rollback(): void
  finalize(): void
}

/** How long a panel pose preview holds before it fades back out. */
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
  /** Dev panel pose preview (013 SPEC §§4, 11): holds the target for a wire
   * tuple, or `null`'s anchor, through the same live pose path the feed
   * uses. Ignored while a replay runs — replay output must stay a pure
   * function of the feed and tick time (002-D3), and a click is neither. */
  previewPose(feel: { valence: number; activation: number; control: number } | null, durationMs?: number): void
  /** Debug: back to a fresh-boot face. Pauses any run, drops any preview,
   * and releases every parameter the affect layer has taken so the model's
   * own idle motion owns them again. Leaves the trace buffer alone — the
   * overlay is history, not state. */
  reset(): void
  /** Tentatively refresh model defaults; finalize stops package-specific playback. */
  characterChanged(preset?: SynthPreset, poses?: FeelPoses): CharacterChangeTransaction
}

// Per-stage state: own runtime, own synth instances, own rng stream (one
// mulberry32 per stage seeded with the SAME seed — stages never consume each
// other's random sequence), own trace buffer.
interface StageState {
  runtime: IRuntime
  /** Parameter defaults of this stage's model — the presentation floor. */
  defaults: Record<string, number>
  /** Every id this stage has ever written — see `write()`. */
  driven: Set<string>
  feed: SynthFeed
  live: Synth
  replay: { synth: Synth; preset: SynthPreset; seed: number; lines: string[] } | null
  latest: Record<string, number> | null
  trace: TraceBuffer
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
  feel: FeelConfig = DEFAULT_FEEL
): AffectDriver {
  let idlePreset = preset
  let poses: FeelPoses = feel
  // Expressiveness is app config, read once at launch (SPEC §4) — a character
  // switch replaces the poses around it, never the constant itself.
  const expressiveness = feel.expressiveness

  // An empty register performs the authored neutral anchor: resting
  // presentation, not feel(0, 0, 0) (SPEC §11).
  const restFeed = (): SynthFeed => ({ pose: poses.anchors.neutral })

  /** Wire integer → normalized axis; junk reads as 0 rather than as NaN (P7). */
  const axis = (value: number): number => (Number.isFinite(value) ? value / 2 : 0)

  /** Feel tuple → the target pose (SPEC §4), shared by the live feed and the
   * panel preview. */
  const poseForTuple = (v: number, a: number, c: number): Pose =>
    computeTarget([axis(v), axis(a), axis(c)], poses.anchors, expressiveness)

  /** Feed message → the pose the body performs (SPEC §§4, 11). */
  const poseFor = (f: AffectFeed): Pose => {
    const p = f.feel
    const target = p ? poseForTuple(p.valence, p.activation, p.control) : poses.anchors.neutral
    return withOverlay(target, f.operational, poses.operational)
  }

  const makeStage = (rt: IRuntime): StageState => ({
    runtime: rt,
    defaults: Object.fromEntries(rt.parameters().map((p) => [p.id, p.default])),
    driven: new Set<string>(),
    feed: restFeed(),
    live: createSynth(idlePreset, Math.random),
    replay: null,
    latest: null,
    trace: createTraceBuffer()
  })

  const stages: Partial<Record<StageId, StageState>> = { A: makeStage(runtime) }

  const replaying = (): [StageId, StageState][] =>
    (Object.entries(stages) as [StageId, StageState][]).filter(([, st]) => st.replay)

  let authoringPreview: Record<string, number> | null = null

  window.lares.onAuthoringPreview((value) => {
    authoringPreview = replaceHeldPreview(
      stages.A!.runtime,
      stages.A!.driven,
      authoringPreview,
      value.params
    )
  })
  window.lares.onAuthoringRevert(() => {
    authoringPreview = replaceHeldPreview(
      stages.A!.runtime,
      stages.A!.driven,
      authoringPreview,
      null
    )
  })

  // Dev panel pose preview, stage A only, live mode only (see previewPose
  // on the returned driver below). The feel target is held raw and the
  // overlay composited at presentation, so a preview never masks a live
  // awaiting_input — the dev panel is where P10 gets judged.
  let posePreview: { target: Pose; expiresAt: number } | null = null
  /** Last operational state stage A heard; the preview composites through it. */
  let operational = 'idle'

  let tentativeFeeds: AffectFeed[] | null = null
  const processFeed = (f: AffectFeed): void => {
    const st = stages[f.stageId as StageId]
    if (!st) return
    if (f.stageId === 'A') operational = f.operational
    st.feed = { pose: poseFor(f) }
    if (!st.replay) return
    pushEngine(st.trace, f)
    for (const frame of driveTick(st.replay.synth, st.feed, f.tick)) {
      st.replay.lines.push(frameToLine(frame))
      st.trace.synth.push(frame)
      st.latest = frame.params
    }
  }

  window.lares.onAffectUpdate((f) => {
    if (tentativeFeeds !== null && f.stageId === 'A') {
      tentativeFeeds.push(f)
      return
    }
    processFeed(f)
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
      const replayed = replayHistory(
        () => createSynth(rp.preset, mulberry32(rp.seed)),
        mine.map((f): SynthFeed => ({ pose: poseFor(f) }))
      )
      rp.synth = replayed.synth
      rp.lines = replayed.frames.map(frameToLine)
      st.trace.synth.push(...replayed.frames)
      if (replayed.frames.length) st.latest = replayed.frames[replayed.frames.length - 1].params
      if (mine.length) st.feed = { pose: poseFor(mine[mine.length - 1]) }
    }
  })

  const clearPlayback = (writeTrace: boolean): void => {
    const active = replaying()
    if (active.length === 0) return
    const linesByStage: Record<string, string[]> = {}
    for (const [id, st] of active) {
      if (writeTrace) {
        console.log(`[lares] replay done (stage ${id}): ${st.replay!.lines.length} synth frames traced`)
        linesByStage[id] = st.replay!.lines
      }
      st.replay = null
      st.latest = null
      st.live = createSynth(idlePreset, Math.random) // fresh idle state after replay
    }
    if (writeTrace) window.lares.sendSynthTrace(linesByStage)
  }

  window.lares.onScenarioEnd(() => {
    clearPlayback(true)
  })

  window.lares.onScenarioStopped(() => {
    clearPlayback(false)
  })

  // IRuntime.setParams is a sticky merge: an id stops being written but keeps
  // its last value forever. Every id the affect layer has ever driven is
  // therefore refilled with its resting value when a frame omits it.
  // Presentation only: the trace keeps the raw synth frame.
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
        const feed: SynthFeed =
          id === 'A' && posePreview && now < posePreview.expiresAt
            ? { pose: withOverlay(posePreview.target, operational, poses.operational) }
            : st.feed
        const frame = st.live.computeFrame(feed, now)
        withAuthoring(id, st, frame)
      }
    }
    requestAnimationFrame(present)
  }

  const reset = (refreshDefaults = false, stopMain = true): void => {
    if (stopMain) {
      void window.lares.stopScenario().catch((error) => {
        console.error('[lares] scenario:stop failed', error)
      })
    }
    clearPlayback(false)
    posePreview = null
    authoringPreview = replaceHeldPreview(
      stages.A!.runtime,
      stages.A!.driven,
      authoringPreview,
      null
    )
    for (const st of Object.values(stages)) {
      if (!st) continue
      if (refreshDefaults) {
        st.defaults = Object.fromEntries(st.runtime.parameters().map((p) => [p.id, p.default]))
      }
      st.latest = null
      st.feed = restFeed()
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
        resetBuffer(st.trace)
      }
      posePreview = null
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
    characterChanged(
      nextPreset: SynthPreset = defaultPreset,
      nextPoses: FeelPoses = DEFAULT_FEEL
    ): CharacterChangeTransaction {
      const st = stages.A!
      const bufferedFeeds: AffectFeed[] = []
      const before = {
        preset: idlePreset,
        poses,
        posePreview,
        authoringPreview,
        defaults: st.defaults,
        driven: st.driven,
        feed: st.feed,
        live: st.live,
        latest: st.latest
      }
      const rollback = (): void => {
        if (tentativeFeeds !== bufferedFeeds) return
        idlePreset = before.preset
        poses = before.poses
        posePreview = before.posePreview
        authoringPreview = before.authoringPreview
        st.defaults = before.defaults
        st.driven = before.driven
        st.feed = before.feed
        st.live = before.live
        st.latest = before.latest
        tentativeFeeds = null
        for (const feed of bufferedFeeds) processFeed(feed)
      }
      try {
        tentativeFeeds = bufferedFeeds
        idlePreset = nextPreset
        poses = nextPoses
        posePreview = null
        authoringPreview = null
        st.defaults = Object.fromEntries(st.runtime.parameters().map((p) => [p.id, p.default]))
        st.latest = null
        st.feed = restFeed()
        st.live = createSynth(idlePreset, Math.random)
        st.driven = new Set()
        st.runtime.resetParams()
        return {
          rollback,
          finalize: () => {
            if (tentativeFeeds !== bufferedFeeds) return
            tentativeFeeds = null
            reset(true, false)
          }
        }
      } catch (error) {
        rollback()
        throw error
      }
    },
    previewPose(feel, durationMs = PREVIEW_MS): void {
      if (feel === null) {
        posePreview = null
        return
      }
      posePreview = {
        target: poseForTuple(feel.valence, feel.activation, feel.control),
        expiresAt: performance.now() + durationMs
      }
    }
  }
}
