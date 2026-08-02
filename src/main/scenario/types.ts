// Scenario file shape (root SPEC §7, slice SPEC §4). Envelopes are real
// Claude Code hook JSON wrapped in the harness envelope (sessions/mapEvent);
// feel calls are handled by the runner directly (root SPEC §7 decision note —
// in real life a feel report arrives via MCP, not envelopes).
import type { EventEnvelope } from '../sessions/mapEvent'
import type { FeelTuple } from '../feel/register'

export type ScenarioEvent =
  | { at_ms: number; envelope: EventEnvelope }
  | { at_ms: number; feel: FeelTuple }

export interface Scenario {
  name: string
  timeScale: number
  events: ScenarioEvent[]
}
