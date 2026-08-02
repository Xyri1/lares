import { describe, expect, it } from 'vitest'
import { Ingestor, probePid } from './ingest'
import type { ClaudeCodeEnvelope } from './mapEvent'

function envelope(hook_event_name: string, session_id = 's1'): ClaudeCodeEnvelope {
  return { v: 1, harness: 'claude-code', session_id, event: { hook_event_name } }
}

describe('Ingestor', () => {
  it('flows a known event through mapEvent -> resolveBaseline -> summary', () => {
    const ingestor = new Ingestor()
    ingestor.ingest(envelope('PreToolUse'), 0)
    expect(ingestor.summary(0).baseline).toBe('working')
  })

  it('tracks baseline changes across successive events for the same session', () => {
    const ingestor = new Ingestor()
    ingestor.ingest(envelope('SessionStart'), 0)
    expect(ingestor.summary(0).baseline).toBe('thinking')
    ingestor.ingest(envelope('PostToolUseFailure'), 1000)
    expect(ingestor.summary(1000).baseline).toBe('error')
    ingestor.ingest(envelope('Stop'), 2000)
    expect(ingestor.summary(2000).baseline).toBe('done')
  })

  it('drops an unknown event with no state change', () => {
    const ingestor = new Ingestor()
    ingestor.ingest(envelope('PreToolUse'), 0)
    ingestor.ingest(envelope('SomeFutureHook'), 1000)
    expect(ingestor.summary(1000).baseline).toBe('working')
  })

  it('aggregates multiple sessions by P10 priority and returns when the urgent session resolves', () => {
    const ingestor = new Ingestor()
    ingestor.ingest(envelope('PreToolUse', 'a'), 0)
    ingestor.ingest(envelope('Notification', 'b'), 1)
    expect(ingestor.summary(1).baseline).toBe('awaiting_input')
    ingestor.ingest(envelope('Stop', 'b'), 2)
    expect(ingestor.summary(2).baseline).toBe('working')
  })

  it('decays done to idle after a minute', () => {
    const ingestor = new Ingestor()
    ingestor.ingest(envelope('Stop'), 0)
    ingestor.sweep(60_000)
    expect(ingestor.summary(60_000).sessions[0].state).toBe('idle')
    expect(ingestor.summary(60_000).baseline).toBe('idle')
  })

  it('does not let silence mask an urgent live session', () => {
    const ingestor = new Ingestor()
    ingestor.ingest(envelope('Notification'), 0)
    ingestor.sweep(90_000)
    expect(ingestor.summary(90_000).baseline).toBe('awaiting_input')
  })

  it('returns stale working and thinking sessions to idle after 90 seconds', () => {
    for (const event of ['PreToolUse', 'SessionStart']) {
      const ingestor = new Ingestor()
      ingestor.ingest(envelope(event), 0)
      ingestor.sweep(90_000)
      expect(ingestor.summary(90_000).baseline).toBe('idle')
    }
  })

  it('tracks subagent count without going below zero', () => {
    const ingestor = new Ingestor()
    ingestor.ingest(envelope('SubagentStop'), 0)
    ingestor.ingest(envelope('SubagentStart'), 1)
    ingestor.ingest(envelope('SubagentStart'), 2)
    ingestor.ingest(envelope('SubagentStop'), 3)
    expect(ingestor.summary(3).sessions[0].subagents).toBe(1)
  })

  it('reaps dead pid rows but keeps live ones', () => {
    const ingestor = new Ingestor((pid) => pid !== 10)
    ingestor.ingest({ ...envelope('PreToolUse', 'dead'), pid: 10 }, 0)
    ingestor.ingest({ ...envelope('PreToolUse', 'live'), pid: 20 }, 0)
    ingestor.sweep(1)
    expect(ingestor.summary(1).sessions.map((row) => row.session_id)).toEqual(['live'])
  })

  it('probes live pids at most once per thirty-second interval', () => {
    let probes = 0
    const ingestor = new Ingestor(() => {
      probes++
      return true
    })
    ingestor.ingest({ ...envelope('PreToolUse'), pid: 10 }, 0)
    ingestor.sweep(0)
    ingestor.sweep(29_999)
    expect(probes).toBe(1)
    ingestor.sweep(30_000)
    expect(probes).toBe(2)
  })

  it('reaps pidless rows after thirty minutes', () => {
    const ingestor = new Ingestor()
    ingestor.ingest(envelope('PreToolUse'), 0)
    ingestor.sweep(30 * 60_000)
    expect(ingestor.summary(30 * 60_000).sessions).toEqual([])
  })

  it('treats EPERM as alive and ESRCH as dead', () => {
    const original = process.kill
    try {
      process.kill = (() => {
        throw Object.assign(new Error(), { code: 'EPERM' })
      }) as typeof process.kill
      expect(probePid(1)).toBe(true)
      process.kill = (() => {
        throw Object.assign(new Error(), { code: 'ESRCH' })
      }) as typeof process.kill
      expect(probePid(1)).toBe(false)
    } finally {
      process.kill = original
    }
  })
})
