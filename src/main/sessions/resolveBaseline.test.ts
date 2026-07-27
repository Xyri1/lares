import { describe, expect, it } from 'vitest'
import { resolveBaseline } from './resolveBaseline'

describe('resolveBaseline', () => {
  it('returns idle for an empty session set', () => {
    expect(resolveBaseline([])).toBe('idle')
  })

  it('returns the single session state as baseline', () => {
    expect(resolveBaseline([{ session_id: 's1', state: 'working' }])).toBe('working')
  })

  it('returns the highest-priority live session', () => {
    expect(
      resolveBaseline([
        { session_id: 's1', state: 'working' },
        { session_id: 's2', state: 'awaiting_input' },
        { session_id: 's3', state: 'error' }
      ])
    ).toBe('awaiting_input')
  })
})
