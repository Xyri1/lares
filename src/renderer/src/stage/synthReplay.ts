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

/** Drive `synth` through one engine tick's fixed 3-frame grid at exact
 * thirds (t + i·100/3), mutating its internal state. Returns each frame's
 * (t, params) — the exact objects the trace line and the overlay buffer
 * both read (no re-derivation). */
export function driveTick(synth: Synth, feed: SynthFeed, tick: number): SynthFrame[] {
  const baseT = tick * TICK_MS
  const frames: SynthFrame[] = []
  for (let i = 0; i < FRAMES_PER_TICK; i++) {
    const t = baseT + (i * TICK_MS) / FRAMES_PER_TICK
    frames.push({ t, params: synth.computeFrame(feed, t) })
  }
  return frames
}

export function frameToLine(f: SynthFrame): string {
  return JSON.stringify(f)
}

/**
 * Replay a tick-indexed feed history (history[i] = feed at tick i) through
 * a FRESH synth built by `makeSynth` (same preset+seed the run started
 * with). This is the seek path: because it's the exact same per-tick
 * driveTick sequence a normal incremental run would produce, the result is
 * byte-identical to an unseeked run through the same ticks.
 */
export function replayHistory(
  makeSynth: () => Synth,
  history: SynthFeed[]
): { synth: Synth; frames: SynthFrame[] } {
  const synth = makeSynth()
  const frames: SynthFrame[] = []
  for (let tick = 0; tick < history.length; tick++) {
    frames.push(...driveTick(synth, history[tick], tick))
  }
  return { synth, frames }
}
