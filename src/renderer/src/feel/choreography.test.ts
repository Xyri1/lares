import { describe, expect, it } from 'vitest'
import { CORNER_KEYS, type CornerKey } from './feel'
import { planPhrase, type ChoreographyMap } from './choreography'

// Distinct ref per corner so a wrong selection cannot alias a right one.
const FULL_MAP: ChoreographyMap = {
  fallback: { group: 'Fallback', index: 9 },
  anchors: Object.fromEntries(
    CORNER_KEYS.map((key, i) => [key, { group: `Corner:${key}`, index: i }])
  ) as ChoreographyMap['anchors']
}

const WIRE = [-2, -1, 0, 1, 2] as const
const axis = (w: number): number => w / 2

/** Independent oracle: over the wire grid a corner weight exceeds 0.5 iff
 * every axis is nonzero, and the winner is then the sign octant. */
const expectedCorner = (v: number, a: number, c: number): CornerKey | null =>
  v !== 0 && a !== 0 && c !== 0
    ? (((v > 0 ? '+' : '-') + (a > 0 ? '+' : '-') + (c > 0 ? '+' : '-')) as CornerKey)
    : null

describe('planPhrase', () => {
  it('resolves all 125 legal wire tuples to one explicit corner or the fallback', () => {
    for (const v of WIRE) {
      for (const a of WIRE) {
        for (const c of WIRE) {
          const p: [number, number, number] = [axis(v), axis(a), axis(c)]
          const plan = planPhrase(p, FULL_MAP)
          expect(plan).not.toBeNull()
          const { group, index, displacement, tempo } = plan!

          const corner = expectedCorner(v, a, c)
          if (corner === null) {
            expect({ group, index }).toEqual(FULL_MAP.fallback)
          } else {
            expect({ group, index }).toEqual(FULL_MAP.anchors![corner])
          }

          const m = Math.max(Math.abs(p[0]), Math.abs(p[1]), Math.abs(p[2]))
          if (m === 0) {
            expect(displacement).toBe(1)
            expect(tempo).toBe(1)
          } else {
            expect(displacement).toBeCloseTo(0.5 + 0.5 * m, 12)
            expect(tempo).toBeCloseTo(1 + 0.15 * p[1], 12)
          }
          // Bounded modulation (SPEC §5).
          expect(displacement).toBeGreaterThanOrEqual(0.5)
          expect(displacement).toBeLessThanOrEqual(1)
          expect(tempo).toBeGreaterThanOrEqual(0.85)
          expect(tempo).toBeLessThanOrEqual(1.15)
        }
      }
    }
  })

  it('selects the same motion at full and half magnitude on each corner ray', () => {
    for (const key of CORNER_KEYS) {
      const signs = [...key].map((s) => (s === '+' ? 1 : -1))
      const full = planPhrase([signs[0], signs[1], signs[2]], FULL_MAP)!
      const half = planPhrase([signs[0] / 2, signs[1] / 2, signs[2] / 2], FULL_MAP)!
      expect(full.group).toBe(half.group)
      expect(full.index).toBe(half.index)
      expect(full.displacement).toBe(1)
      expect(half.displacement).toBe(0.75)
    }
  })

  it('gives axis-only and tied directions the fallback, never a borrowed corner', () => {
    expect(planPhrase([1, 0, 0], FULL_MAP)!.group).toBe('Fallback')
    expect(planPhrase([1, 1, 0], FULL_MAP)!.group).toBe('Fallback')
    expect(planPhrase([0, -1, 1], FULL_MAP)!.group).toBe('Fallback')
  })

  it('uses the fallback for an unmapped corner, with tuple modulation intact', () => {
    const sparse: ChoreographyMap = {
      fallback: FULL_MAP.fallback,
      anchors: { '+++': { group: 'Tap', index: 3 } }
    }
    expect(planPhrase([1, 1, 1], sparse)).toEqual({
      group: 'Tap',
      index: 3,
      displacement: 1,
      tempo: 1.15
    })
    expect(planPhrase([-1, -1, -1], sparse)).toEqual({
      group: 'Fallback',
      index: 9,
      displacement: 1,
      tempo: 0.85
    })
    expect(planPhrase([0.5, 0.5, 0.5], { fallback: FULL_MAP.fallback })).toEqual({
      group: 'Fallback',
      index: 9,
      displacement: 0.75,
      tempo: 1.075
    })
  })

  it('plans nothing for a null feel or an absent choreography block', () => {
    expect(planPhrase(null, FULL_MAP)).toBeNull()
    expect(planPhrase([1, 1, 1], undefined)).toBeNull()
    expect(planPhrase([1, 1, 1], null)).toBeNull()
  })
})
