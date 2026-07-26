import { describe, expect, it } from 'vitest'
import { tToX, xToT } from './overlayCanvas'

describe('overlay x<->t mapping', () => {
  it('round-trips within a pixel', () => {
    const width = 460
    const maxT = 12_345
    for (const t of [0, 1, 100, 6172, maxT]) {
      const x = tToX(t, width, maxT)
      expect(xToT(x, width, maxT)).toBeCloseTo(t, 0)
    }
  })

  it('clamps clicks outside the canvas to [0, maxT]', () => {
    expect(xToT(-50, 460, 1000)).toBe(0)
    expect(xToT(9999, 460, 1000)).toBe(1000)
  })

  it('degenerates to 0 before any duration is known', () => {
    expect(xToT(200, 460, 0)).toBe(0)
    expect(tToX(500, 460, 0)).toBe(0)
  })
})
