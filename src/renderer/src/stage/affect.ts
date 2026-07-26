import type { IRuntime } from '../runtime/iface'
import { createSynth, mulberry32, type Synth, type SynthFeed, type SynthPreset } from '../synth/synth'
import { PRESETS } from './presets'
import { driveTick, frameToLine, replayHistory } from './synthReplay'
import { createTraceBuffer, pushEngine, resetBuffer, type TraceBuffer } from './traceBuffer'

export type StageId = 'A' | 'B'

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
}

// Per-stage state: own runtime, own synth instances, own rng stream (one
// mulberry32 per stage seeded with the SAME seed — stages never consume each
// other's random sequence), own trace buffer.
interface StageState {
  runtime: IRuntime
  feed: SynthFeed
  live: Synth
  replay: { synth: Synth; preset: SynthPreset; seed: number; lines: string[] } | null
  latest: Record<string, number> | null
  trace: TraceBuffer
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
export function createAffectDriver(runtime: IRuntime, preset: SynthPreset): AffectDriver {
  // Rest-point feed so a Lar idles before any brain tick arrives.
  const restFeed = (): SynthFeed => ({ E: { valence: 0.1, arousal: 0.25 } })
  const idlePreset = preset

  const makeStage = (rt: IRuntime): StageState => ({
    runtime: rt,
    feed: restFeed(),
    live: createSynth(idlePreset, Math.random),
    replay: null,
    latest: null,
    trace: createTraceBuffer()
  })

  const stages: Partial<Record<StageId, StageState>> = { A: makeStage(runtime) }

  const replaying = (): [StageId, StageState][] =>
    (Object.entries(stages) as [StageId, StageState][]).filter(([, st]) => st.replay)

  window.lares.onAffectUpdate((f) => {
    const st = stages[f.stageId as StageId]
    if (!st) return
    st.feed = f
    if (!st.replay) return
    pushEngine(st.trace, f)
    for (const frame of driveTick(st.replay.synth, f, f.tick)) {
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
      const replayed = replayHistory(() => createSynth(rp.preset, mulberry32(rp.seed)), mine)
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
    }
    window.lares.sendSynthTrace(linesByStage)
  })

  const present = (): void => {
    for (const st of Object.values(stages)) {
      if (!st) continue
      if (st.replay) {
        if (st.latest) st.runtime.setParams(st.latest)
      } else {
        st.runtime.setParams(st.live.computeFrame(st.feed, performance.now()))
      }
    }
    requestAnimationFrame(present)
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
    }
  }
}
