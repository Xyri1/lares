import type { AffectEngine } from '../affect/engine'
import type { BaselineState } from '../affect/types'
import { mapEvent, type ClaudeCodeEnvelope } from './mapEvent'
import { resolveBaseline } from './resolveBaseline'

// The ingestion seam (slice SPEC §3, 002-D1): envelopes go in, the engine's
// baseline comes out, with no server and no scenario knowledge in between.
// M3a's HTTP route calls `ingest` unchanged once real ingress exists.
export class Ingestor {
  private readonly sessions = new Map<string, BaselineState>()

  constructor(private readonly engine: AffectEngine) {}

  // nowMs is part of the seam contract for M3a's per-session liveness
  // tracking (root SPEC §3: pid reaping / 30min silence) — this slice has no
  // liveness or multi-session aggregation (002-D1 fence), so it's unused here.
  ingest(envelope: ClaudeCodeEnvelope, _nowMs: number): void {
    const state = mapEvent(envelope)
    if (state === null) return
    this.sessions.set(envelope.session_id, state)
    const baseline = resolveBaseline(
      Array.from(this.sessions, ([session_id, sessionState]) => ({
        session_id,
        state: sessionState
      }))
    )
    this.engine.setBaselineState(baseline)
  }
}
