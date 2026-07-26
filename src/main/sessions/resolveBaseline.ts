import type { BaselineState } from '../affect/types'

export interface SessionEntry {
  session_id: string
  state: BaselineState
}

// Fenced to single-session (slice SPEC §3, root SPEC §9 A7): the param is a
// collection, not a single entry, so M3a's priority-aggregation upgrade
// (root SPEC §3) extends this signature instead of rewriting callers.
// >1 sessions throws rather than silently picking one — P10 "aggregate
// loudly", and a wrong guess here would mask a live session instead of
// surfacing the gap until M3a lands real aggregation.
export function resolveBaseline(sessions: Iterable<SessionEntry>): BaselineState {
  const list = Array.from(sessions)
  if (list.length === 0) return 'idle'
  if (list.length > 1) {
    throw new Error(
      `resolveBaseline: multi-session aggregation is out of scope for this slice (got ${list.length} sessions)`
    )
  }
  return list[0].state
}
