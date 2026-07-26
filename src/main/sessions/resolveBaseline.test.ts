import { describe, expect, it } from 'vitest'
import { resolveBaseline } from './resolveBaseline'

describe('resolveBaseline', () => {
  it('returns idle for an empty session set', () => {
    expect(resolveBaseline([])).toBe('idle')
  })

  it('returns the single session state as baseline', () => {
    expect(resolveBaseline([{ session_id: 's1', state: 'working' }])).toBe('working')
  })

  it('throws for more than one session (fenced — no aggregation this slice)', () => {
    expect(() =>
      resolveBaseline([
        { session_id: 's1', state: 'working' },
        { session_id: 's2', state: 'error' }
      ])
    ).toThrow()
  })
})
