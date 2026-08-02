// Bounded in-memory history of the current scenario replay — the trace
// overlay canvas reads straight from this (slice 002 step 6, decision 3).
// A full golden run is a few thousand ticks of small objects, so "bounded"
// just means "one run's worth" — it resets on every play()/seek().
// Values are the exact feed/synth objects produced during playback, never
// re-derived, so the graph matches the written trace file.
import type { SynthFrame } from './synthReplay'

export interface EnginePoint {
  t: number
  /** Normalized tuple (wire ÷ 2); null before the first report (SPEC §11). */
  feel: { valence: number; activation: number; control: number } | null
  operational: string
}

export interface TraceBuffer {
  engine: EnginePoint[]
  synth: SynthFrame[]
  /** Scenario end time (ms) — fixed once play() resolves; 0 until then. */
  endMs: number
}

export function createTraceBuffer(): TraceBuffer {
  return { engine: [], synth: [], endMs: 0 }
}

export function resetBuffer(buf: TraceBuffer): void {
  buf.engine.length = 0
  buf.synth.length = 0
}

export function pushEngine(buf: TraceBuffer, feed: AffectFeed): void {
  const f = feed.feel
  buf.engine.push({
    t: feed.tick * 100,
    feel: f
      ? { valence: f.valence / 2, activation: f.activation / 2, control: f.control / 2 }
      : null,
    operational: feed.operational
  })
}
