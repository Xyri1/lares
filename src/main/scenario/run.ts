import type { AffectSnapshot } from '../affect/engine'
import type { Vec2 } from '../affect/constants'
import { Nerves } from '../nerves'
import type { Scenario } from './types'

export const STEP_MS = 100
const DEFAULT_TAIL_MS = 2000

export interface RunOptions {
  /** Extra scenario time run past the last event, ms. Default 2000. */
  tailMs?: number
  /**
   * UI playback multiplier (1x/8x/64x) — wall-clock pacing a future
   * renderer-side sleep would use between steps. Accepted here, never read:
   * the point of this field existing is a test proving speed can't leak
   * into the trace.
   */
  speed?: number
}

export interface ScenarioStepper {
  /** Last scenario time to step (inclusive): last event + tail. */
  endMs: number
  /** Fire due events, tick the engine, return its snapshot. Call with t = 0, 100, 200... */
  step(t: number): AffectSnapshot
}

// The deterministic per-step core (slice SPEC §4, 002-D3), shared by the pure
// runScenario below and the wall-clock-paced player (player.ts). Scenario time
// arrives from the caller in fixed 100ms steps; no Date.now(), no
// Math.random() anywhere in here.
export function createStepper(
  scenario: Scenario,
  cues: Record<string, Vec2>,
  tailMs = DEFAULT_TAIL_MS
): ScenarioStepper {
  const events = scenario.events
  const lastEventMs = events.reduce((max, e) => Math.max(max, e.at_ms), 0)
  const endMs = lastEventMs + tailMs

  const nerves = new Nerves('scenario', cues, 0)
  const fired = new Array<boolean>(events.length).fill(false)

  return {
    endMs,
    step(t: number): AffectSnapshot {
      for (let i = 0; i < events.length; i++) {
        if (fired[i] || events[i].at_ms > t) continue
        fired[i] = true
        const evt = events[i]
        if ('envelope' in evt) {
          nerves.ingest(evt.envelope, t)
        } else {
          nerves.emote(evt.emote, 'scenario:emote', t)
        }
      }
      nerves.tick(t)
      return nerves.snapshot()
    }
  }
}

/** One engine trace line — the byte format A3's golden runs compare. */
export function traceLine(t: number, snap: AffectSnapshot): string {
  return JSON.stringify({
    t,
    E: snap.E,
    M: snap.M,
    baselineState: snap.baselineState,
    expressionStack: snap.expressionStack
  })
}

// Deterministic replay (slice SPEC §4, 002-D3): advances SCENARIO time in
// fixed 100ms steps from 0 to the last event + a tail, firing each event
// once in file order, ticking the engine, then recording one trace line.
// Same input always produces the same output string[], regardless of how
// fast the caller wants it played back.
export function runScenario(
  scenario: Scenario,
  cues: Record<string, Vec2>,
  opts: RunOptions = {}
): string[] {
  const stepper = createStepper(scenario, cues, opts.tailMs ?? DEFAULT_TAIL_MS)
  const lines: string[] = []
  for (let t = 0; t <= stepper.endMs; t += STEP_MS) {
    lines.push(traceLine(t, stepper.step(t)))
  }
  return lines
}
