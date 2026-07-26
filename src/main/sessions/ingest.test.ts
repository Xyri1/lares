import { describe, expect, it } from 'vitest'
import { AffectEngine } from '../affect/engine'
import { Ingestor } from './ingest'
import type { ClaudeCodeEnvelope } from './mapEvent'

function envelope(hook_event_name: string, session_id = 's1'): ClaudeCodeEnvelope {
  return { v: 1, harness: 'claude-code', session_id, event: { hook_event_name } }
}

describe('Ingestor', () => {
  it('flows a known event through mapEvent -> resolveBaseline -> engine', () => {
    const engine = new AffectEngine({}, 0)
    const ingestor = new Ingestor(engine)
    ingestor.ingest(envelope('PreToolUse'), 0)
    expect(engine.snapshot().baselineState).toBe('working')
  })

  it('tracks baseline changes across successive events for the same session', () => {
    const engine = new AffectEngine({}, 0)
    const ingestor = new Ingestor(engine)
    ingestor.ingest(envelope('SessionStart'), 0)
    expect(engine.snapshot().baselineState).toBe('thinking')
    ingestor.ingest(envelope('PostToolUseFailure'), 1000)
    expect(engine.snapshot().baselineState).toBe('error')
    ingestor.ingest(envelope('Stop'), 2000)
    expect(engine.snapshot().baselineState).toBe('done')
  })

  it('drops an unknown event with no state change', () => {
    const engine = new AffectEngine({}, 0)
    const ingestor = new Ingestor(engine)
    ingestor.ingest(envelope('PreToolUse'), 0)
    ingestor.ingest(envelope('SomeFutureHook'), 1000)
    expect(engine.snapshot().baselineState).toBe('working')
  })
})
