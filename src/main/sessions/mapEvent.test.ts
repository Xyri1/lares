import { describe, expect, it } from 'vitest'
import { mapEvent, parseEnvelope, type ClaudeCodeEnvelope, type EventEnvelope } from './mapEvent'

function envelope(hook_event_name: string): ClaudeCodeEnvelope {
  return { v: 1, harness: 'claude-code', session_id: 's1', event: { hook_event_name } }
}

describe('mapEvent', () => {
  const rows: Array<[string, ReturnType<typeof mapEvent>]> = [
    ['SessionStart', 'thinking'],
    ['UserPromptSubmit', 'thinking'],
    ['PreToolUse', 'working'],
    ['PostToolUse', 'working'],
    ['Notification', 'awaiting_input'],
    ['Stop', 'done'],
    ['PostToolUseFailure', 'error'],
    ['SubagentStart', 'working'],
    ['SubagentStop', 'working']
  ]

  for (const [hookEventName, state] of rows) {
    it(`maps ${hookEventName} to ${state}`, () => {
      expect(mapEvent(envelope(hookEventName))).toBe(state)
    })
  }

  it('drops an unknown event name', () => {
    expect(mapEvent(envelope('SomeFutureHook'))).toBeNull()
  })

  it('maps Codex PermissionRequest but not Claude Notification lookalikes', () => {
    const codex: EventEnvelope = {
      v: 1,
      harness: 'codex',
      session_id: 'c1',
      event: { hook_event_name: 'PermissionRequest' }
    }
    expect(mapEvent(codex)).toBe('awaiting_input')
    expect(mapEvent(envelope('PermissionRequest'))).toBeNull()
  })

  it.each([
    [{}, 'object'],
    [{ v: 2, harness: 'claude-code', session_id: 's', event: {} }, 'version'],
    [{ v: 1, harness: 'other', session_id: 's', event: {} }, 'harness'],
    [{ v: 1, harness: 'codex', session_id: '', event: {} }, 'session'],
    [{ v: 1, harness: 'codex', session_id: 's', pid: 0, event: {} }, 'pid'],
    [{ v: 1, harness: 'codex', session_id: 's', event: {} }, 'event name'],
    [{ v: 1, harness: 'codex', session_id: 's', event: [] }, 'event']
  ])('rejects malformed envelope: %s', (raw, _reason) => {
    expect(parseEnvelope(raw).ok).toBe(false)
  })

  it('parses a valid optional pid and cwd', () => {
    expect(
      parseEnvelope({
        v: 1,
        harness: 'codex',
        session_id: 's',
        cwd: 'C:/work',
        pid: 42,
        event: { hook_event_name: 'SessionStart' }
      })
    ).toMatchObject({ ok: true })
  })
})
