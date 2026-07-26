import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createStepper, traceLine, STEP_MS } from './run'
import { clampSpeed, playScenarioPaced, type AffectFeedMessage } from './player'
import type { Scenario } from './types'

const CUES = { pleased: { valence: 0.55, arousal: 0.45 } }

function scenario(): Scenario {
  return {
    name: 't',
    timeScale: 1,
    events: [
      { at_ms: 0, emote: { cue: 'pleased', intensity: 1, duration_s: 1 } },
      { at_ms: 500, emote: { cue: 'pleased', intensity: 1, duration_s: 1 } }
    ]
  }
}

describe('clampSpeed', () => {
  it('clamps to [0.1, 64] and falls back to 1 for non-finite input', () => {
    expect(clampSpeed(-5)).toBe(0.1)
    expect(clampSpeed(999)).toBe(64)
    expect(clampSpeed(8)).toBe(8)
    expect(clampSpeed(NaN)).toBe(1)
  })
})

describe('playScenarioPaced — seek', () => {
  it('recomputes the same trace prefix as stepping the pure core straight to the same tick', () => {
    const stepperRef = createStepper(scenario(), CUES)
    let refLine = ''
    for (let t = 0; t <= 1000; t += STEP_MS) refLine = traceLine(t, stepperRef.step(t))

    let seekHistory: AffectFeedMessage[] = []
    const controller = playScenarioPaced(scenario(), CUES, {
      onFeed: () => {},
      onSeek: (h) => (seekHistory = h),
      onDone: () => {}
    })

    controller.seek(1000)

    expect(seekHistory).toHaveLength(11) // t = 0,100,...,1000
    const last = seekHistory[seekHistory.length - 1]
    const lastLine = traceLine(last.tick * STEP_MS, {
      E: last.E,
      M: last.M,
      baselineState: last.baselineState,
      expressionStack: last.expressionStack
    })
    expect(lastLine).toBe(refLine)
    controller.cancel()
  })

  it('clamps seek targets to [0, endMs] and aligns down to the 100ms grid', () => {
    const stepperRef = createStepper(scenario(), CUES)
    let seekHistory: AffectFeedMessage[] = []
    const controller = playScenarioPaced(scenario(), CUES, {
      onFeed: () => {},
      onSeek: (h) => (seekHistory = h),
      onDone: () => {}
    })

    controller.seek(-500)
    expect(seekHistory).toHaveLength(1)
    expect(seekHistory[0].tick).toBe(0)

    controller.seek(999_999)
    expect(seekHistory[seekHistory.length - 1].tick * STEP_MS).toBe(stepperRef.endMs)

    controller.seek(150) // aligns down to tick 1 (t=100), not tick 1.5
    expect(seekHistory[seekHistory.length - 1].tick).toBe(1)

    controller.cancel()
  })
})

describe('playScenarioPaced — dual stage (002-D2)', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('emits one feed per stage per tick; per-stage engine states match (determinism)', () => {
    const feeds: AffectFeedMessage[] = []
    let done: Record<string, string[]> = {}
    const controller = playScenarioPaced(scenario(), CUES, {
      stages: ['A', 'B'],
      onFeed: (f) => feeds.push(f),
      onSeek: () => {},
      onDone: (lines) => (done = lines)
    })

    vi.advanceTimersByTime(60_000) // past endMs (last event + 2s tail)

    const a = feeds.filter((f) => f.stageId === 'A')
    const b = feeds.filter((f) => f.stageId === 'B')
    expect(a.length).toBeGreaterThan(0)
    expect(b.map((f) => f.tick)).toEqual(a.map((f) => f.tick)) // same ticks, no drift
    expect(JSON.stringify(b)).toBe(JSON.stringify(a).replaceAll('"stageId":"A"', '"stageId":"B"'))
    expect(done.B).toEqual(done.A) // per-stage engine trace lines, identical by construction
    controller.cancel()
  })
})

describe('playScenarioPaced — pause/resume', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('pause stops advancing ticks; resume continues from the same position', () => {
    const feeds: AffectFeedMessage[] = []
    const controller = playScenarioPaced(scenario(), CUES, {
      onFeed: (f) => feeds.push(f),
      onSeek: () => {},
      onDone: () => {}
    })

    vi.advanceTimersByTime(300)
    controller.pause()
    const countAtPause = feeds.length
    expect(countAtPause).toBeGreaterThan(0)

    vi.advanceTimersByTime(1000) // paused — no further ticks
    expect(feeds.length).toBe(countAtPause)

    controller.resume()
    vi.advanceTimersByTime(300)
    expect(feeds.length).toBeGreaterThan(countAtPause)
    // resumed ticks continue the same sequence — no gap, no rewind.
    expect(feeds[countAtPause].tick).toBe(feeds[countAtPause - 1].tick + 1)

    controller.cancel()
  })
})
