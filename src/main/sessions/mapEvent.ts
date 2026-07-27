import type { BaselineState } from '../affect/types'

export type Harness = 'claude-code' | 'codex'

export interface EventEnvelope {
  v: 1
  harness: Harness
  session_id: string
  cwd?: string
  pid?: number
  event: Record<string, unknown>
}

export type ClaudeCodeEnvelope = EventEnvelope & { harness: 'claude-code' }

export type EnvelopeParseResult = { ok: true; value: EventEnvelope } | { ok: false; error: string }

/** Validates the untrusted event-route body before the session table sees it. */
export function parseEnvelope(raw: unknown): EnvelopeParseResult {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, error: 'envelope must be an object' }
  }
  const value = raw as Record<string, unknown>
  if (value.v !== 1) return { ok: false, error: 'envelope.v must be 1' }
  if (value.harness !== 'claude-code' && value.harness !== 'codex') {
    return { ok: false, error: 'envelope.harness must be "claude-code" or "codex"' }
  }
  if (typeof value.session_id !== 'string' || !value.session_id) {
    return { ok: false, error: 'envelope.session_id must be a non-empty string' }
  }
  if (value.cwd !== undefined && typeof value.cwd !== 'string') {
    return { ok: false, error: 'envelope.cwd must be a string' }
  }
  const pid = value.pid
  if (pid !== undefined && (typeof pid !== 'number' || !Number.isInteger(pid) || pid <= 0)) {
    return { ok: false, error: 'envelope.pid must be a positive integer' }
  }
  if (typeof value.event !== 'object' || value.event === null || Array.isArray(value.event)) {
    return { ok: false, error: 'envelope.event must be an object' }
  }
  const event = value.event as Record<string, unknown>
  if (typeof event.hook_event_name !== 'string' || !event.hook_event_name) {
    return { ok: false, error: 'envelope.event.hook_event_name must be a non-empty string' }
  }
  return {
    ok: true,
    value: {
      v: 1,
      harness: value.harness,
      session_id: value.session_id,
      ...(value.cwd === undefined ? {} : { cwd: value.cwd }),
      ...(pid === undefined ? {} : { pid }),
      event
    }
  }
}

const SHARED_EVENT_STATE: Record<string, BaselineState> = {
  SessionStart: 'thinking',
  UserPromptSubmit: 'thinking',
  PreToolUse: 'working',
  PostToolUse: 'working',
  Stop: 'done',
  PostToolUseFailure: 'error',
  SubagentStart: 'working',
  SubagentStop: 'working'
}

export function eventName(envelope: EventEnvelope): string | null {
  const name = envelope.event.hook_event_name
  return typeof name === 'string' && name ? name : null
}

export function mapEvent(envelope: EventEnvelope): BaselineState | null {
  const name = eventName(envelope)
  if (name === null) return null
  if (name === 'Notification' && envelope.harness === 'claude-code') return 'awaiting_input'
  if (name === 'PermissionRequest' && envelope.harness === 'codex') return 'awaiting_input'
  return SHARED_EVENT_STATE[name] ?? null
}
