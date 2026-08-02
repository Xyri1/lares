import { readFileSync } from 'node:fs'
import { parseTuple } from '../feel/register'
import { parseEnvelope } from '../sessions/mapEvent'
import type { Scenario, ScenarioEvent } from './types'

function fail(msg: string): never {
  throw new Error(`Invalid scenario: ${msg}`)
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
    const hasFeel = 'feel' in evt
    if (hasEnvelope === hasFeel) fail(`${where} must have exactly one of envelope or feel`)
    const at_ms = evt.at_ms * timeScale
    if (hasEnvelope) {
      const envelope = parseEnvelope(evt.envelope)
      if (!envelope.ok) fail(`${where}.${envelope.error}`)
      return { at_ms, envelope: envelope.value }
    }
    // Same ingress rule as the live `feel` tool (013 SPEC §1, §8): three
    // required integers in {-2..2}.
    const tuple = parseTuple(evt.feel)
    if (!tuple) fail(`${where}.feel must have integer valence, activation, control in {-2..2}`)
    return { at_ms, feel: tuple }
  })

  return { name: s.name, timeScale, events }
}
