import type { BaselineState } from './mapEvent'

export interface SessionEntry {
  session_id: string
  state: BaselineState
}

const PRIORITY: Record<BaselineState, number> = {
  awaiting_input: 100,
  error: 80,
  working: 60,
  thinking: 50,
  done: 30,
  idle: 10
}

/** P10: the most urgent live session always owns the displayed baseline. */
export function resolveBaseline(sessions: Iterable<SessionEntry>): BaselineState {
  let result: BaselineState = 'idle'
  for (const session of sessions) {
    if (PRIORITY[session.state] > PRIORITY[result]) result = session.state
  }
  return result
}
