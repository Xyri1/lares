import type { BaselineState } from '../sessions/mapEvent'
import type { FeelTuple } from '../feel/register'
import { Ingestor } from '../sessions/ingest'
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

/** One scenario tick: the latched tuple (or its absence) and root §3
 * operational state — the same halves the live feed carries (013 SPEC §13). */
export interface StepState {
  feel: FeelTuple | null
  operational: BaselineState
}

export interface ScenarioStepper {
  /** Last scenario time to step (inclusive): last event + tail. */
  endMs: number
  /** Fire due events, advance session liveness, return the tick's state. Call with t = 0, 100, 200... */
  step(t: number): StepState
}

// The deterministic per-step core (slice SPEC §4, 002-D3), shared by the pure
// runScenario below and the wall-clock-paced player (player.ts). Scenario time
// arrives from the caller in fixed 100ms steps; no Date.now(), no
// Math.random() anywhere in here. A feel event latches a scenario-scoped
// tuple directly (the runner drives the same shape the live path does, minus
// attribution and rate-capping — a scripted golden has no session to
// misattribute and no user to spam); envelopes keep driving root §3
// operational state through the same Ingestor the live path uses.
export function createStepper(scenario: Scenario, tailMs = DEFAULT_TAIL_MS): ScenarioStepper {
  const events = scenario.events
  const lastEventMs = events.reduce((max, e) => Math.max(max, e.at_ms), 0)
  const endMs = lastEventMs + tailMs

  const sessions = new Ingestor()
  const fired = new Array<boolean>(events.length).fill(false)
  let feel: FeelTuple | null = null

  return {
    endMs,
    step(t: number): StepState {
      for (let i = 0; i < events.length; i++) {
        if (fired[i] || events[i].at_ms > t) continue
        fired[i] = true
        const evt = events[i]
        if ('envelope' in evt) {
          sessions.ingest(evt.envelope, t)
        } else {
          feel = evt.feel
        }
      }
      sessions.sweep(t)
      return { feel, operational: sessions.summary(t).baseline }
    }
  }
}

/** One trace line — the byte format A3's golden runs compare. */
export function traceLine(t: number, state: StepState): string {
  return JSON.stringify({ t, feel: state.feel, operational: state.operational })
}

// Deterministic replay (slice SPEC §4, 002-D3): advances SCENARIO time in
// fixed 100ms steps from 0 to the last event + a tail, firing each event
// once in file order, then recording one trace line. Same input always
// produces the same output string[], regardless of how fast the caller
// wants it played back.
export function runScenario(scenario: Scenario, opts: RunOptions = {}): string[] {
  const stepper = createStepper(scenario, opts.tailMs ?? DEFAULT_TAIL_MS)
  const lines: string[] = []
  for (let t = 0; t <= stepper.endMs; t += STEP_MS) {
    lines.push(traceLine(t, stepper.step(t)))
  }
  return lines
}
