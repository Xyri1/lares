import { describe, expect, it } from 'vitest'
import { runScenario } from './run'
import type { Scenario } from './types'

function scenario(events: Scenario['events']): Scenario {
  return { name: 't', timeScale: 1, events }
}

describe('runScenario', () => {
  it('produces one trace line per 100ms step through the tail', () => {
    const s = scenario([
      {
        at_ms: 0,
        envelope: {
          v: 1,
          harness: 'claude-code',
          session_id: 's1',
          event: { hook_event_name: 'SessionStart' }
        }
      }
    ])
    const trace = runScenario(s, { tailMs: 500 })
    expect(trace).toHaveLength(6) // t = 0,100,200,300,400,500
    expect(JSON.parse(trace[0]).t).toBe(0)
    expect(JSON.parse(trace[trace.length - 1]).t).toBe(500)
  })

  it('latches a feel tuple at the tick it fires', () => {
    const s = scenario([{ at_ms: 0, feel: { valence: 1, activation: 1, control: 0 } }])
    const trace = runScenario(s, { tailMs: 200 })
    const first = JSON.parse(trace[0])
    expect(first.feel).toEqual({ valence: 1, activation: 1, control: 0 })
  })

  it('drives baseline state from an envelope event', () => {
    const s = scenario([
      {
        at_ms: 100,
        envelope: {
          v: 1,
          harness: 'claude-code',
          session_id: 's1',
          event: { hook_event_name: 'PostToolUseFailure' }
        }
      }
    ])
    const trace = runScenario(s, { tailMs: 0 })
    expect(JSON.parse(trace[trace.length - 1]).operational).toBe('error')
  })

  it('is deterministic: two runs of the same scenario are identical', () => {
    const s = scenario([
      {
        at_ms: 100,
        envelope: {
          v: 1,
          harness: 'claude-code',
          session_id: 's1',
          event: { hook_event_name: 'PreToolUse' }
        }
      }
    ])
    expect(runScenario(s)).toEqual(runScenario(s))
  })

  it('is unaffected by the speed option', () => {
    const s = scenario([{ at_ms: 0, feel: { valence: 1, activation: 0, control: 0 } }])
    const slow = runScenario(s, { speed: 1 })
    const fast = runScenario(s, { speed: 64 })
    expect(slow).toEqual(fast)
  })
})
