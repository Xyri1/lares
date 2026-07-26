import { describe, expect, it } from 'vitest'
import { runScenario } from './run'
import type { Scenario } from './types'

const CUES = { pleased: { valence: 0.55, arousal: 0.45 } }

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
    const trace = runScenario(s, CUES, { tailMs: 500 })
    expect(trace).toHaveLength(6) // t = 0,100,200,300,400,500
    expect(JSON.parse(trace[0]).t).toBe(0)
    expect(JSON.parse(trace[trace.length - 1]).t).toBe(500)
  })

  it('applies an emote as a cue nudge plus a queued expression', () => {
    const s = scenario([{ at_ms: 0, emote: { cue: 'pleased', intensity: 1, duration_s: 1 } }])
    const trace = runScenario(s, CUES, { tailMs: 200 })
    const first = JSON.parse(trace[0])
    expect(first.E.valence).toBeGreaterThan(0.1)
    expect(first.expressionStack).toEqual([
      { cueOrFreeform: 'pleased', weight: 1, expiryMs: 1000 }
    ])
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
    const trace = runScenario(s, CUES, { tailMs: 0 })
    expect(JSON.parse(trace[trace.length - 1]).baselineState).toBe('error')
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
    expect(runScenario(s, CUES)).toEqual(runScenario(s, CUES))
  })

  it('is unaffected by the speed option', () => {
    const s = scenario([{ at_ms: 0, emote: { cue: 'pleased' } }])
    const slow = runScenario(s, CUES, { speed: 1 })
    const fast = runScenario(s, CUES, { speed: 64 })
    expect(slow).toEqual(fast)
  })
})
