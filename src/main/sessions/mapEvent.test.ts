import { describe, expect, it } from 'vitest'
import { mapEvent, type ClaudeCodeEnvelope } from './mapEvent'

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
})
