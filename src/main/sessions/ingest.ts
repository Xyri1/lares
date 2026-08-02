import {
  eventName,
  mapEvent,
  type BaselineState,
  type EventEnvelope,
  type Harness
} from './mapEvent'
import { resolveBaseline } from './resolveBaseline'

const DONE_IDLE_MS = 60_000
const GLOBAL_SILENCE_MS = 90_000
const PIDLESS_REAP_MS = 30 * 60_000
const PID_PROBE_MS = 30_000

export interface SessionRow {
  session_id: string
  harness: Harness
  cwd?: string
  state: BaselineState
  since: number
  last_event_at: number
  subagents: number
  pid?: number
  /** UserPromptSubmit seen, no Stop yet — feel attribution reads this (013 §9). */
  turnOpen: boolean
}

export interface SessionSummary {
  baseline: BaselineState
  sessions: SessionRow[]
}

export type PidProbe = (pid: number) => boolean

export function probePid(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH'
  }
}

// Pure state table: callers provide clock cadence through ingest() and sweep().
export class Ingestor {
  private readonly sessions = new Map<string, SessionRow>()
  private lastPidProbeAt = -Infinity

  constructor(
    private readonly pidProbe: PidProbe = probePid,
    private readonly pidProbeMs = PID_PROBE_MS
  ) {}

  ingest(envelope: EventEnvelope, nowMs: number): void {
    const state = mapEvent(envelope)
    const name = eventName(envelope)
    if (state === null && name !== 'SessionEnd') return

    if (name === 'SessionEnd') {
      this.sessions.delete(envelope.session_id)
      return
    }

    const prior = this.sessions.get(envelope.session_id)
    const row: SessionRow = prior ?? {
      session_id: envelope.session_id,
      harness: envelope.harness,
      state: 'idle',
      since: nowMs,
      last_event_at: nowMs,
      subagents: 0,
      turnOpen: false
    }
    row.harness = envelope.harness
    if (envelope.cwd !== undefined) row.cwd = envelope.cwd
    if (envelope.pid !== undefined) row.pid = envelope.pid
    row.last_event_at = nowMs
    if (name === 'UserPromptSubmit') row.turnOpen = true
    else if (name === 'Stop') row.turnOpen = false
    if (name === 'SubagentStart') row.subagents++
    if (name === 'SubagentStop') row.subagents = Math.max(0, row.subagents - 1)
    if (state !== row.state) {
      row.state = state!
      row.since = nowMs
    }
    this.sessions.set(row.session_id, row)
  }

  sweep(nowMs: number): SessionRow[] {
    const reaped: SessionRow[] = []
    const probePids = nowMs - this.lastPidProbeAt >= this.pidProbeMs
    for (const [id, row] of this.sessions) {
      if (
        (row.pid === undefined && nowMs - row.last_event_at >= PIDLESS_REAP_MS) ||
        (row.pid !== undefined && probePids && !this.pidProbe(row.pid))
      ) {
        this.sessions.delete(id)
        reaped.push(row)
        continue
      }
      if (row.state === 'done' && nowMs - row.since >= DONE_IDLE_MS) {
        row.state = 'idle'
        row.since += DONE_IDLE_MS
      }
    }
    if (probePids) this.lastPidProbeAt = nowMs
    return reaped
  }

  summary(nowMs: number): SessionSummary {
    return {
      baseline: this.displayedBaseline(nowMs),
      sessions: Array.from(this.sessions.values(), (row) => ({ ...row }))
    }
  }

  private displayedBaseline(nowMs: number): BaselineState {
    let lastEventAt = -Infinity
    for (const row of this.sessions.values()) lastEventAt = Math.max(lastEventAt, row.last_event_at)
    const baseline = resolveBaseline(this.sessions.values())
    if (nowMs - lastEventAt < GLOBAL_SILENCE_MS) return baseline
    return baseline === 'awaiting_input' || baseline === 'error' ? baseline : 'idle'
  }
}
