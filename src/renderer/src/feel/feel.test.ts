import { describe, expect, it } from 'vitest'
import {
  ANCHOR_KEYS,
  CHANNELS,
  CORNER_KEYS,
  DEFAULT_ANCHORS,
  computeTarget,
  mergeAnchors,
  type AnchorSet,
  type Channel,
  type CornerKey
} from './feel'

// SPEC §1 anchor lattice, plus a finer interior grid for the property
// sweeps (no property-testing framework — explicit loops over grids).
const LATTICE = [-1, -0.5, 0, 0.5, 1]
const GRID = [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1]
const EPS = 1e-9

function sign(ch: '+' | '-'): 1 | -1 {
  return ch === '+' ? 1 : -1
}

function cornerPoint(key: CornerKey): [number, number, number] {
  return [
    sign(key[0] as '+' | '-'),
    sign(key[1] as '+' | '-'),
    sign(key[2] as '+' | '-')
  ]
}

function cornersWithSign(axis: 0 | 1 | 2, s: '+' | '-'): CornerKey[] {
  return CORNER_KEYS.filter((key) => key[axis] === s)
}

function channelRange(anchors: AnchorSet, ch: Channel): [number, number] {
  const values = ANCHOR_KEYS.map((key) => anchors[key][ch])
  return [Math.min(...values), Math.max(...values)]
}

describe('anchor exactness (SPEC §4 property 1)', () => {
  it('neutral anchor: p = (0,0,0) returns the authored neutral pose exactly', () => {
    expect(computeTarget([0, 0, 0], DEFAULT_ANCHORS)).toEqual(DEFAULT_ANCHORS.neutral)
  })

  it('every corner anchor returns its authored pose exactly', () => {
    for (const key of CORNER_KEYS) {
      expect(computeTarget(cornerPoint(key), DEFAULT_ANCHORS)).toEqual(DEFAULT_ANCHORS[key])
    }
  })
})

describe('convexity (SPEC §4 property 2)', () => {
  it('every channel stays within the authored min/max, for k ≤ 1, no clamp needed', () => {
    for (const v of GRID) {
      for (const a of GRID) {
        for (const c of GRID) {
          for (const k of [0, 0.25, 0.5, 0.75, 1]) {
            const out = computeTarget([v, a, c], DEFAULT_ANCHORS, k)
            for (const ch of CHANNELS) {
              const [lo, hi] = channelRange(DEFAULT_ANCHORS, ch)
              expect(out[ch]).toBeGreaterThanOrEqual(lo - EPS)
              expect(out[ch]).toBeLessThanOrEqual(hi + EPS)
            }
          }
        }
      }
    }
  })
})

describe('ray linearity (SPEC §4 property 3)', () => {
  const directions: [number, number, number][] = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
    [-1, 0, 0],
    [0.4, -0.9, 0.2],
    [-0.7, -0.3, 1],
    [1, 1, 1],
    [-1, 1, -1]
  ]

  it('every channel is exactly linear in m along any ray, and monotone', () => {
    const neutral = DEFAULT_ANCHORS.neutral
    for (const u of directions) {
      const shell = computeTarget(u, DEFAULT_ANCHORS)
      for (const ch of CHANNELS) {
        const total = shell[ch] - neutral[ch]
        let prev = neutral[ch]
        for (const t of [0.25, 0.5, 0.75, 1]) {
          const p: [number, number, number] = [u[0] * t, u[1] * t, u[2] * t]
          const cur = computeTarget(p, DEFAULT_ANCHORS)[ch]
          // exact affine formula: target(t) = neutral + t·(shell - neutral)
          expect(cur).toBeCloseTo(neutral[ch] + t * total, 9)
          // monotone toward the shell value (or flat, if this channel has no slope)
          if (total > EPS) expect(cur).toBeGreaterThanOrEqual(prev - EPS)
          else if (total < -EPS) expect(cur).toBeLessThanOrEqual(prev + EPS)
          prev = cur
        }
      }
    }
  })

  it('wire ±1 (normalized 0.5) lands exactly halfway between neutral and the ±2 pose', () => {
    const neutral = DEFAULT_ANCHORS.neutral
    for (const u of directions) {
      const shell = computeTarget(u, DEFAULT_ANCHORS)
      const half: [number, number, number] = [u[0] * 0.5, u[1] * 0.5, u[2] * 0.5]
      const mid = computeTarget(half, DEFAULT_ANCHORS)
      for (const ch of CHANNELS) {
        expect(mid[ch]).toBeCloseTo((neutral[ch] + shell[ch]) / 2, 9)
      }
    }
  })
})

describe('Chebyshev full strength (SPEC §4 property 4)', () => {
  it('a single axis at normalized ±1 performs at full magnitude (m = 1, no neutral leak)', () => {
    const axes: (0 | 1 | 2)[] = [0, 1, 2]
    for (const axis of axes) {
      for (const s of ['+', '-'] as const) {
        const p: [number, number, number] = [0, 0, 0]
        p[axis] = sign(s)
        const out = computeTarget(p, DEFAULT_ANCHORS)
        const corners = cornersWithSign(axis, s)
        expect(corners).toHaveLength(4)
        for (const ch of CHANNELS) {
          const expected =
            corners.reduce((sum, key) => sum + DEFAULT_ANCHORS[key][ch], 0) / corners.length
          expect(out[ch]).toBeCloseTo(expected, 9)
        }
      }
    }
  })
})

describe('clamp only above k = 1 (SPEC §4 expressiveness)', () => {
  it('k ≤ 1 never clamps: output matches the unclamped scale formula everywhere', () => {
    for (const v of LATTICE) {
      for (const a of LATTICE) {
        for (const c of LATTICE) {
          const shell = computeTarget([v, a, c], DEFAULT_ANCHORS, 1)
          const neutral = DEFAULT_ANCHORS.neutral
          for (const k of [0, 0.3, 0.6, 1]) {
            const out = computeTarget([v, a, c], DEFAULT_ANCHORS, k)
            for (const ch of CHANNELS) {
              expect(out[ch]).toBeCloseTo(neutral[ch] + k * (shell[ch] - neutral[ch]), 9)
            }
          }
        }
      }
    }
  })

  it('k = 1 restores anchor exactness', () => {
    for (const key of CORNER_KEYS) {
      expect(computeTarget(cornerPoint(key), DEFAULT_ANCHORS, 1)).toEqual(DEFAULT_ANCHORS[key])
    }
  })

  it('k > 1 clamps a channel that would otherwise leave [-1, 1]', () => {
    const boundary: AnchorSet = {
      ...DEFAULT_ANCHORS,
      neutral: { ...DEFAULT_ANCHORS.neutral, mouthCurve: 0 },
      '+++': { ...DEFAULT_ANCHORS['+++'], mouthCurve: 1 }
    }
    // Unclamped this would be neutral + 3·(1 - 0) = 3.
    const out = computeTarget([1, 1, 1], boundary, 3)
    expect(out.mouthCurve).toBe(1)
  })
})

describe('worked example (SPEC §4, verbatim)', () => {
  it('p = (-0.5, 1, -1) blends 0.75·panic + 0.25·giddy, m = 1, neutral contributes nothing', () => {
    const out = computeTarget([-0.5, 1, -1], DEFAULT_ANCHORS)
    const panic = DEFAULT_ANCHORS['-+-']
    const giddy = DEFAULT_ANCHORS['++-']
    for (const ch of CHANNELS) {
      expect(out[ch]).toBeCloseTo(0.75 * panic[ch] + 0.25 * giddy[ch], 9)
    }
  })
})

describe('anchor merge (SPEC §13)', () => {
  it('a partial override replaces only the specified channel, per anchor', () => {
    const merged = mergeAnchors(DEFAULT_ANCHORS, { '+++': { mouthCurve: 0.1 } })
    expect(merged['+++'].mouthCurve).toBe(0.1)
    for (const ch of CHANNELS) {
      if (ch === 'mouthCurve') continue
      expect(merged['+++'][ch]).toBe(DEFAULT_ANCHORS['+++'][ch])
    }
    for (const key of ANCHOR_KEYS) {
      if (key === '+++') continue
      expect(merged[key]).toEqual(DEFAULT_ANCHORS[key])
    }
  })

  it('no overrides returns the shipped default values unchanged', () => {
    expect(mergeAnchors(DEFAULT_ANCHORS)).toEqual(DEFAULT_ANCHORS)
    expect(mergeAnchors(DEFAULT_ANCHORS, {})).toEqual(DEFAULT_ANCHORS)
  })

  it('overrides across multiple anchors and channels compose independently', () => {
    const merged = mergeAnchors(DEFAULT_ANCHORS, {
      neutral: { eyeOpen: 0.2 },
      '---': { headPitch: -1, gazeHeight: -1 }
    })
    expect(merged.neutral.eyeOpen).toBe(0.2)
    expect(merged.neutral.mouthCurve).toBe(DEFAULT_ANCHORS.neutral.mouthCurve)
    expect(merged['---'].headPitch).toBe(-1)
    expect(merged['---'].gazeHeight).toBe(-1)
    expect(merged['---'].breathRate).toBe(DEFAULT_ANCHORS['---'].breathRate)
  })
})
