import type { BaselineState } from '../affect/types'

export interface ClaudeCodeEnvelope {
  v: 1
  harness: 'claude-code'
  session_id: string
  cwd?: string
  event: { hook_event_name: string; [key: string]: unknown }
}

// Root SPEC §3 event→state table, claude-code rows only (slice SPEC §3).
// Data table, not a switch, so a hook_event_name rename is a one-line edit.
// Notification: mapped unconditionally to awaiting_input for now — the real
// hook registration filters to the permission_prompt matcher upstream (root
// SPEC §7), so every Notification this function sees is assumed to already
// be that kind. Revisit if idle_prompt notifications ever reach here too.
const EVENT_STATE: Record<string, BaselineState> = {
  SessionStart: 'thinking',
  UserPromptSubmit: 'thinking',
  PreToolUse: 'working',
  PostToolUse: 'working',
  Notification: 'awaiting_input',
  Stop: 'done',
  PostToolUseFailure: 'error',
  SubagentStart: 'working',
  SubagentStop: 'working'
}

export function mapEvent(envelope: ClaudeCodeEnvelope): BaselineState | null {
  const state = EVENT_STATE[envelope.event.hook_event_name]
  if (state === undefined) {
    console.debug(`mapEvent: unknown hook_event_name ${envelope.event.hook_event_name}, dropped`)
    return null
  }
  return state
}
