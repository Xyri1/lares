import { readFileSync } from 'node:fs'
import type { ClaudeCodeEnvelope } from '../sessions/mapEvent'
import type { EmoteEvent, Scenario, ScenarioEvent } from './types'

function fail(msg: string): never {
  throw new Error(`Invalid scenario: ${msg}`)
}

function checkEnvelope(v: unknown, where: string): asserts v is ClaudeCodeEnvelope {
  if (typeof v !== 'object' || v === null) fail(`${where}.envelope must be an object`)
  const e = v as Partial<ClaudeCodeEnvelope>
  if (e.v !== 1) fail(`${where}.envelope.v must be 1`)
  if (e.harness !== 'claude-code') fail(`${where}.envelope.harness must be "claude-code"`)
  if (typeof e.session_id !== 'string' || !e.session_id) {
    fail(`${where}.envelope.session_id must be a non-empty string`)
  }
  if (
    typeof e.event !== 'object' ||
    e.event === null ||
    typeof e.event.hook_event_name !== 'string' ||
    !e.event.hook_event_name
  ) {
    fail(`${where}.envelope.event.hook_event_name must be a non-empty string`)
  }
}

function checkEmote(v: unknown, where: string): asserts v is EmoteEvent {
  if (typeof v !== 'object' || v === null) fail(`${where}.emote must be an object`)
  const e = v as Partial<EmoteEvent>
  if (typeof e.cue !== 'string' || !e.cue) fail(`${where}.emote.cue must be a non-empty string`)
  if (e.intensity !== undefined && typeof e.intensity !== 'number') {
    fail(`${where}.emote.intensity must be a number`)
  }
  if (e.duration_s !== undefined && typeof e.duration_s !== 'number') {
    fail(`${where}.emote.duration_s must be a number`)
  }
}

// Parses + validates a scenario file (root SPEC §7 shape) and applies
// timeScale to every event's at_ms (authoring convenience — the runner never
// sees timeScale). Malformed input throws rather than returning a result
// union: a bad golden is a build-time problem, not a runtime one to degrade
// through.
export function loadScenario(filePath: string): Scenario {
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(filePath, 'utf8'))
  } catch (err) {
    fail(`${filePath} is not valid JSON: ${(err as Error).message}`)
  }

  const s = raw as Record<string, unknown>
  if (typeof s.name !== 'string' || !s.name) fail('name must be a non-empty string')
  if (typeof s.timeScale !== 'number' || s.timeScale <= 0) {
    fail('timeScale must be a positive number')
  }
  if (!Array.isArray(s.events)) fail('events must be an array')
  const timeScale = s.timeScale

  const events: ScenarioEvent[] = s.events.map((rawEvent, i) => {
    const where = `events[${i}]`
    if (typeof rawEvent !== 'object' || rawEvent === null) fail(`${where} must be an object`)
    const evt = rawEvent as Record<string, unknown>
    if (typeof evt.at_ms !== 'number' || evt.at_ms < 0) {
      fail(`${where}.at_ms must be a non-negative number`)
    }
    const hasEnvelope = 'envelope' in evt
    const hasEmote = 'emote' in evt
    if (hasEnvelope === hasEmote) fail(`${where} must have exactly one of envelope or emote`)
    const at_ms = evt.at_ms * timeScale
    if (hasEnvelope) {
      checkEnvelope(evt.envelope, where)
      return { at_ms, envelope: evt.envelope }
    }
    checkEmote(evt.emote, where)
    return { at_ms, emote: evt.emote }
  })

  return { name: s.name, timeScale, events }
}
