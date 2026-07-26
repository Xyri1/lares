// Scenario file shape (root SPEC §7, slice SPEC §4). Envelopes are real
// Claude Code hook JSON wrapped in the harness envelope (sessions/mapEvent);
// emotes are handled by the runner directly (root SPEC §7 decision note —
// in real life emotes arrive via MCP, not envelopes).
import type { ClaudeCodeEnvelope } from '../sessions/mapEvent'

export interface EmoteEvent {
  cue: string
  intensity?: number
  duration_s?: number
}

export type ScenarioEvent =
  | { at_ms: number; envelope: ClaudeCodeEnvelope }
  | { at_ms: number; emote: EmoteEvent }

export interface Scenario {
  name: string
  timeScale: number
  events: ScenarioEvent[]
}
