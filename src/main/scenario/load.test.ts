import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadScenario } from './load'

function writeScenario(body: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), 'lares-scenario-'))
  const path = join(dir, 'scenario.json')
  writeFileSync(path, typeof body === 'string' ? body : JSON.stringify(body))
  return path
}

const SESSION_START_ENVELOPE = {
  v: 1,
  harness: 'claude-code',
  session_id: 's1',
  event: { hook_event_name: 'SessionStart' }
}

const VALID = {
  name: 'test-scenario',
  timeScale: 1,
  events: [
    { at_ms: 0, envelope: SESSION_START_ENVELOPE },
    { at_ms: 500, emote: { cue: 'pleased', intensity: 0.8, duration_s: 4 } }
  ]
}

describe('loadScenario', () => {
  it('loads a valid scenario file', () => {
    const s = loadScenario(writeScenario(VALID))
    expect(s.name).toBe('test-scenario')
    expect(s.events).toHaveLength(2)
    expect(s.events[0]).toMatchObject({ at_ms: 0 })
    expect(s.events[1]).toMatchObject({ at_ms: 500, emote: { cue: 'pleased' } })
  })

  it('applies timeScale to every event at_ms', () => {
    const s = loadScenario(writeScenario({ ...VALID, timeScale: 2 }))
    expect(s.events[0].at_ms).toBe(0)
    expect(s.events[1].at_ms).toBe(1000)
  })

  it('rejects malformed JSON', () => {
    expect(() => loadScenario(writeScenario('{not json'))).toThrow(/not valid JSON/)
  })

  it('rejects a missing name', () => {
    const { name: _name, ...rest } = VALID
    expect(() => loadScenario(writeScenario(rest))).toThrow(/name/)
  })

  it('rejects a non-array events field', () => {
    expect(() => loadScenario(writeScenario({ ...VALID, events: {} }))).toThrow(/events/)
  })

  it('rejects an event missing both envelope and emote', () => {
    const bad = { ...VALID, events: [{ at_ms: 0 }] }
    expect(() => loadScenario(writeScenario(bad))).toThrow(/envelope or emote/)
  })

  it('rejects an event with both envelope and emote', () => {
    const bad = {
      ...VALID,
      events: [{ at_ms: 0, envelope: SESSION_START_ENVELOPE, emote: { cue: 'x' } }]
    }
    expect(() => loadScenario(writeScenario(bad))).toThrow(/envelope or emote/)
  })

  it('rejects an envelope missing hook_event_name', () => {
    const bad = {
      ...VALID,
      events: [{ at_ms: 0, envelope: { v: 1, harness: 'claude-code', session_id: 's1', event: {} } }]
    }
    expect(() => loadScenario(writeScenario(bad))).toThrow(/hook_event_name/)
  })

  it.each([
    ['cwd', 42, /cwd must be a string/],
    ['pid', 0, /pid must be a positive integer/]
  ])('uses the ingress validator for malformed envelope %s', (field, value, message) => {
    const bad = {
      ...VALID,
      events: [
        {
          at_ms: 0,
          envelope: { ...SESSION_START_ENVELOPE, [field]: value }
        }
      ]
    }
    expect(() => loadScenario(writeScenario(bad))).toThrow(message)
  })

  it('rejects an emote missing cue', () => {
    const bad = { ...VALID, events: [{ at_ms: 0, emote: {} }] }
    expect(() => loadScenario(writeScenario(bad))).toThrow(/cue/)
  })
})
