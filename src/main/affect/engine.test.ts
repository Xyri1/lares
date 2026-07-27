import { describe, expect, it } from 'vitest'
import { DECAY_HALF_LIFE_MS, MOOD_REST_SHIFT, MOOD_TAU_MS, REST_POINT } from './constants'
import { AffectEngine } from './engine'

// cue defs double as nudge deltas and affect-space positions
const JOY = { valence: 0.6, arousal: 0.3 }

describe('decay half-life', () => {
  it('halves the distance to the rest point after one half-life', () => {
    const e = new AffectEngine({ joy: JOY }, 0)
    e.applyCueNudge('joy', 's1', 0) // E = (0.7, 0.55)
    e.tick(DECAY_HALF_LIFE_MS)
    const { E } = e.snapshot()
    expect(E.valence).toBeCloseTo(0.4, 10)
    expect(E.arousal).toBeCloseTo(0.4, 10)
  })

  it('does not depend on tick step size', () => {
    const one = new AffectEngine({ joy: JOY }, 0)
    const many = new AffectEngine({ joy: JOY }, 0)
    one.applyCueNudge('joy', 's1', 0)
    many.applyCueNudge('joy', 's1', 0)
    one.tick(DECAY_HALF_LIFE_MS)
    for (let t = 1000; t <= DECAY_HALF_LIFE_MS; t += 1000) many.tick(t)
    expect(Math.abs(one.snapshot().E.valence - many.snapshot().E.valence)).toBeLessThan(0.01)
    expect(Math.abs(one.snapshot().E.arousal - many.snapshot().E.arousal)).toBeLessThan(0.01)
  })
})

describe('mood EMA and rest-point shift', () => {
  it('tracks E as an exponential moving average', () => {
    const e = new AffectEngine({ joy: JOY }, 0)
    e.applyCueNudge('joy', 's1', 0) // E = (0.7, 0.55)
    e.tick(1000)
    // engine decays E first, then moves M toward the decayed E
    const keep = 0.5 ** (1000 / DECAY_HALF_LIFE_MS)
    const alpha = 1 - Math.exp(-1000 / MOOD_TAU_MS)
    const ev = REST_POINT.valence + (0.7 - REST_POINT.valence) * keep
    const ea = REST_POINT.arousal + (0.55 - REST_POINT.arousal) * keep
    const snap = e.snapshot()
    expect(snap.M.valence).toBeCloseTo(REST_POINT.valence + (ev - REST_POINT.valence) * alpha, 10)
    expect(snap.M.arousal).toBeCloseTo(REST_POINT.arousal + (ea - REST_POINT.arousal) * alpha, 10)
  })

  it('elevated mood shifts the effective rest point', () => {
    const e = new AffectEngine({ joy: { valence: 0.8, arousal: 0.5 } }, 0)
    let t = 0
    // build mood: full-strength nudge every 61s (outside saturation window)
    while (t < 15 * 60_000) {
      t += 1000
      e.tick(t)
      if (t % 61_000 === 0) e.applyCueNudge('joy', 's1', t)
    }
    expect(e.snapshot().M.valence).toBeGreaterThan(REST_POINT.valence + 0.05)
    // then decay quietly for 10 half-lives: E settles at E0', not E0
    const start = t
    while (t < start + 10 * DECAY_HALF_LIFE_MS) {
      t += 1000
      e.tick(t)
    }
    const { E, M } = e.snapshot()
    const shifted = REST_POINT.valence + MOOD_REST_SHIFT * (M.valence - REST_POINT.valence)
    expect(Math.abs(E.valence - shifted)).toBeLessThan(0.01)
    expect(E.valence).toBeGreaterThan(REST_POINT.valence + 0.02)
  })
})

describe('baseline nudge table', () => {
  it('applies the built-in nudge on transition', () => {
    const err = new AffectEngine({}, 0)
    err.setBaselineState('error')
    expect(err.snapshot().E).toEqual({ valence: 0.1 - 0.3, arousal: 0.25 + 0.2 })
    expect(err.snapshot().baselineState).toBe('error')

    const wait = new AffectEngine({}, 0)
    wait.setBaselineState('awaiting_input')
    expect(wait.snapshot().E).toEqual({ valence: 0.1, arousal: 0.25 + 0.15 })

    const done = new AffectEngine({}, 0)
    done.setBaselineState('done')
    expect(done.snapshot().E).toEqual({ valence: 0.1 + 0.25, arousal: 0.25 - 0.05 })
  })

  it('applies no nudge for working, thinking, or idle', () => {
    const e = new AffectEngine({}, 0)
    e.setBaselineState('working')
    e.setBaselineState('thinking')
    e.setBaselineState('idle')
    expect(e.snapshot().E).toEqual(REST_POINT)
  })

  it('does not re-nudge when the same state is set again', () => {
    const e = new AffectEngine({}, 0)
    e.setBaselineState('error')
    e.setBaselineState('error')
    expect(e.snapshot().E.valence).toBeCloseTo(-0.2, 10)
  })

  it('clamps E after a nudge', () => {
    const e = new AffectEngine({ grief: { valence: -0.9, arousal: 0 } }, 0)
    e.applyCueNudge('grief', 's1', 0) // E.valence = -0.8
    e.setBaselineState('error') // -1.1 -> clamped
    expect(e.snapshot().E.valence).toBe(-1)
  })
})

describe('per-source saturation', () => {
  const CUES = { joy: { valence: 0.2, arousal: 0.1 }, calm: { valence: 0.05, arousal: -0.1 } }

  it('scales the nth same-cue nudge by 0.5^(n-1) within 60s', () => {
    const e = new AffectEngine(CUES, 0)
    e.applyCueNudge('joy', 'a', 0) // full: +0.2
    expect(e.snapshot().E.valence).toBeCloseTo(0.3, 10)
    e.applyCueNudge('joy', 'a', 1000) // half: +0.1
    expect(e.snapshot().E.valence).toBeCloseTo(0.4, 10)
    e.applyCueNudge('joy', 'a', 2000) // quarter: +0.05
    expect(e.snapshot().E.valence).toBeCloseTo(0.45, 10)
  })

  it('does not discount across sources', () => {
    const e = new AffectEngine(CUES, 0)
    e.applyCueNudge('joy', 'a', 0)
    e.applyCueNudge('joy', 'a', 1000)
    e.applyCueNudge('joy', 'b', 2000) // other source: full +0.2
    expect(e.snapshot().E.valence).toBeCloseTo(0.1 + 0.2 + 0.1 + 0.2, 10)
  })

  it('resets the counter on a different cue', () => {
    const e = new AffectEngine(CUES, 0)
    e.applyCueNudge('joy', 'a', 0) // +0.2
    e.applyCueNudge('joy', 'a', 1000) // +0.1
    e.applyCueNudge('calm', 'a', 2000) // full +0.05
    e.applyCueNudge('joy', 'a', 3000) // counter reset: full +0.2
    expect(e.snapshot().E.valence).toBeCloseTo(0.1 + 0.2 + 0.1 + 0.05 + 0.2, 10)
  })

  it('resets the counter after 60s of quiet', () => {
    const e = new AffectEngine(CUES, 0)
    e.applyCueNudge('joy', 'a', 0)
    e.applyCueNudge('joy', 'a', 61_000) // full again
    expect(e.snapshot().E.valence).toBeCloseTo(0.5, 10)
  })

  it('measures the window from the previous nudge (rolling)', () => {
    const e = new AffectEngine(CUES, 0)
    e.applyCueNudge('joy', 'a', 0) // +0.2
    e.applyCueNudge('joy', 'a', 30_000) // +0.1
    e.applyCueNudge('joy', 'a', 59_000) // 29s since last: +0.05
    expect(e.snapshot().E.valence).toBeCloseTo(0.45, 10)
  })
})

describe('expression stack expiry and preemption', () => {
  it('holds entries FIFO and drops expired ones on tick', () => {
    const e = new AffectEngine({}, 0)
    e.enqueueExpression('smile', 1, 0, 5000)
    e.enqueueExpression('nod', 0.5, 0, 3000)
    expect(e.snapshot().expressionStack).toEqual([
      { cueOrFreeform: 'smile', weight: 1, expiryMs: 5000 },
      { cueOrFreeform: 'nod', weight: 0.5, expiryMs: 8000 }
    ])
    e.tick(6000)
    expect(e.snapshot().expressionStack).toEqual([
      { cueOrFreeform: 'nod', weight: 0.5, expiryMs: 8000 }
    ])
  })

  it('rejects a fifth queue entry without dropping the oldest', () => {
    const e = new AffectEngine({}, 0)
    for (let i = 1; i <= 4; i++) expect(e.enqueueExpression(`x${i}`, 1, 0, 1000)).toBe(true)
    expect(e.enqueueExpression('x5', 1, 0, 1000)).toBe(false)
    const stack = e.snapshot().expressionStack
    expect(stack).toHaveLength(4)
    expect(stack[0].cueOrFreeform).toBe('x1')
    expect(stack[3].expiryMs).toBe(4000)
  })

  it('clears the pending queue for immediate replacement', () => {
    const e = new AffectEngine({}, 0)
    e.enqueueExpression('smile', 1, 0, 5000)
    e.clearExpressions()
    e.enqueueExpression('alert', 1, 1000, 2000)
    expect(e.snapshot().expressionStack).toEqual([
      { cueOrFreeform: 'alert', weight: 1, expiryMs: 3000 }
    ])
  })

  it('preempts the queue on an error or awaiting_input baseline, preserving it', () => {
    const e = new AffectEngine({}, 0)
    e.enqueueExpression('smile', 1, 0, 5000)
    e.setBaselineState('error')
    let stack = e.snapshot().expressionStack
    expect(stack[0]).toMatchObject({ cueOrFreeform: 'error', weight: 1 })
    expect(stack[1]).toMatchObject({ cueOrFreeform: 'smile' })
    // a new preempting baseline replaces the previous one
    e.setBaselineState('awaiting_input')
    stack = e.snapshot().expressionStack
    expect(stack[0].cueOrFreeform).toBe('awaiting_input')
    expect(stack).toHaveLength(2)
  })

  it('resumes the preserved queue when the baseline moves on', () => {
    const e = new AffectEngine({}, 0)
    e.enqueueExpression('smile', 1, 0, 5000)
    e.setBaselineState('error')
    e.setBaselineState('working')
    expect(e.snapshot().expressionStack).toEqual([
      { cueOrFreeform: 'smile', weight: 1, expiryMs: 5000 }
    ])
  })

  it('drops entries that expired during preemption', () => {
    const e = new AffectEngine({}, 0)
    e.enqueueExpression('smile', 1, 0, 5000)
    e.setBaselineState('error')
    e.tick(6000)
    e.setBaselineState('working')
    expect(e.snapshot().expressionStack).toEqual([])
  })
})

describe('cue selection hysteresis', () => {
  const CUES = {
    a: { valence: 0, arousal: 0.25 },
    b: { valence: 0.3, arousal: 0.25 },
    push1: { valence: 0.08, arousal: 0 },
    push2: { valence: 0.12, arousal: 0 }
  }

  it('picks the nearest cue by euclidean affect distance', () => {
    const e = new AffectEngine(CUES, 0)
    expect(e.selectCue()).toBe('a') // E=(0.1,0.25): a at 0.1, b at 0.2
  })

  it('keeps the current cue when a rival is closer by 0.1 or less', () => {
    const e = new AffectEngine(CUES, 0)
    expect(e.selectCue()).toBe('a')
    e.applyCueNudge('push1', 's1', 0) // E=(0.18,0.25): a 0.18, b 0.12
    expect(e.selectCue()).toBe('a')
  })

  it('switches when a cue is closer by more than 0.1', () => {
    const e = new AffectEngine(CUES, 0)
    expect(e.selectCue()).toBe('a')
    e.applyCueNudge('push1', 's1', 0)
    e.applyCueNudge('push2', 's1', 1000) // E=(0.3,0.25): b 0, a 0.3
    expect(e.selectCue()).toBe('b')
  })

  it('returns null when no cues exist', () => {
    const e = new AffectEngine({}, 0)
    expect(e.selectCue()).toBeNull()
  })
})
