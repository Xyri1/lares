// Pure synth-driving helpers shared by the live replay path and the seek
// path (slice 002 step 6, decision 1). No DOM, no Electron — same purity
// bar as synth/synth.ts, so seek determinism is directly testable.
import type { Synth, SynthFeed } from '../synth/synth'

const TICK_MS = 100
const FRAMES_PER_TICK = 3 // matches the replay grid stage/affect.ts drives (002-D3)

export interface SynthFrame {
  t: number
  params: Record<string, number>
}

/**
 * Per-frame expression compositing, applied on top of the synth's output
 * (see compose.ts). Stateful across frames — the caller owns that state, so
 * a fresh compositor pairs with a fresh synth on seek.
 */
export type Compose<F extends SynthFeed = SynthFeed> = (
  params: Record<string, number>,
  feed: F,
  tMs: number
) => Record<string, number>

const passThrough: Compose = (params) => params

/** Drive `synth` through one engine tick's fixed 3-frame grid at exact
 * thirds (t + i·100/3), mutating its internal state. Returns each frame's
 * (t, params) — the exact objects the trace line and the overlay buffer
 * both read (no re-derivation), composited included. */
export function driveTick<F extends SynthFeed>(
  synth: Synth,
  feed: F,
  tick: number,
  compose: Compose<F> = passThrough
): SynthFrame[] {
  const baseT = tick * TICK_MS
  const frames: SynthFrame[] = []
  for (let i = 0; i < FRAMES_PER_TICK; i++) {
    const t = baseT + (i * TICK_MS) / FRAMES_PER_TICK
    frames.push({ t, params: compose(synth.computeFrame(feed, t), feed, t) })
  }
  return frames
}

export function frameToLine(f: SynthFrame): string {
  return JSON.stringify(f)
}

/**
 * Replay a tick-indexed feed history (history[i] = feed at tick i) through
 * a FRESH synth built by `makeSynth` (same preset+seed the run started
 * with) and a FRESH compositor from `makeCompose`. This is the seek path:
 * because it's the exact same per-tick driveTick sequence a normal
 * incremental run would produce, the result is byte-identical to an
 * unseeked run through the same ticks.
 */
export function replayHistory<F extends SynthFeed>(
  makeSynth: () => Synth,
  history: F[],
  makeCompose: () => Compose<F> = () => passThrough
): { synth: Synth; compose: Compose<F>; frames: SynthFrame[] } {
  const synth = makeSynth()
  const compose = makeCompose()
  const frames: SynthFrame[] = []
  for (let tick = 0; tick < history.length; tick++) {
    frames.push(...driveTick(synth, history[tick], tick, compose))
  }
  return { synth, compose, frames }
}
