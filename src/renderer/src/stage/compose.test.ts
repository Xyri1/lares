import { describe, expect, it } from 'vitest'
import presetJson from '../../../../presets/default.json'
import { createSynth, mulberry32, type SynthFeed, type SynthPreset } from '../synth/synth'
import { composeFrame, FADE_MS, initialFade, type CueParams, type StackEntry } from './compose'
import { driveTick, replayHistory } from './synthReplay'

const CUES: CueParams = {
  pleased: { ParamMouthForm: 1, ParamCheek: 0.6 },
  dejected: { ParamMouthForm: -0.6, ParamAngleY: -15 }
}
const DEFAULTS = { ParamMouthForm: 0, ParamCheek: 0, ParamAngleY: 0, ParamBrowLY: 0 }
const BASE = { ParamMouthForm: 0.2, ParamBrowLY: 0.4 }

const entry = (cue: string, weight = 1, expiryMs = Infinity): StackEntry => ({
  cueOrFreeform: cue,
  weight,
  expiryMs
})

/** Run a (tMs, stack) sequence through the compositor, threading the state. */
function run(steps: [number, StackEntry[]][], base = BASE): Record<string, number>[] {
  let state = initialFade()
  return steps.map(([tMs, stack]) => {
    const r = composeFrame(CUES, base, DEFAULTS, stack, tMs, state)
    state = r.state
    return r.params
  })
}

describe('compose — precedence', () => {
  it('passes the synth frame through untouched when the stack is empty', () => {
    expect(run([[0, []]])[0]).toEqual(BASE)
  })

  it('an active cue overrides the trend curve for the params it names', () => {
    const [, held] = run([
      [0, [entry('pleased')]],
      [FADE_MS, [entry('pleased')]]
    ])
    expect(held.ParamMouthForm).toBe(1) // cue wins over the trend's 0.2
    expect(held.ParamCheek).toBe(0.6) // cue-only param, off the model default
    expect(held.ParamBrowLY).toBe(0.4) // untouched by the cue: trend still drives
  })

  it('fades in over FADE_MS instead of snapping', () => {
    const frames = run([
      [0, [entry('pleased')]],
      [FADE_MS / 2, [entry('pleased')]],
      [FADE_MS, [entry('pleased')]]
    ])
    expect(frames[0].ParamMouthForm).toBeCloseTo(0.2) // = base
    expect(frames[1].ParamMouthForm).toBeCloseTo(0.6) // halfway to 1
    expect(frames[2].ParamMouthForm).toBe(1)
  })

  it('scales the cue by the entry weight', () => {
    const [, held] = run([
      [0, [entry('pleased', 0.5)]],
      [FADE_MS, [entry('pleased', 0.5)]]
    ])
    expect(held.ParamMouthForm).toBeCloseTo(0.6) // base 0.2 → halfway to 1
    expect(held.ParamCheek).toBeCloseTo(0.3)
  })

  it('only the front resolvable entry drives the face', () => {
    const [, held] = run([
      [0, [entry('dejected'), entry('pleased')]],
      [FADE_MS, [entry('dejected'), entry('pleased')]]
    ])
    expect(held.ParamMouthForm).toBeCloseTo(-0.6)
    expect(held.ParamCheek).toBeUndefined()
  })

  it('skips unknown cue names and falls through to one it can resolve', () => {
    const [, held] = run([
      [0, [entry('a wistful sigh'), entry('pleased')]],
      [FADE_MS, [entry('a wistful sigh'), entry('pleased')]]
    ])
    expect(held.ParamMouthForm).toBe(1)
  })

  it('renders an opaque freeform parameter set without cue lookup', () => {
    const freeform: StackEntry = {
      cueOrFreeform: { params: { ParamMouthForm: -0.25, ParamCheek: 0.4 }, label: 'wry' },
      weight: 1,
      expiryMs: Infinity
    }
    const [, held] = run([
      [0, [freeform]],
      [FADE_MS, [freeform]]
    ])
    expect(held.ParamMouthForm).toBe(-0.25)
    expect(held.ParamCheek).toBe(0.4)
  })

  it('ignores expired entries', () => {
    const [held] = run([[500, [entry('pleased', 1, 400), entry('dejected')]]])
    expect(held.ParamMouthForm).toBeCloseTo(0.2) // dejected only starting to fade in
  })

  // Infinity survives IPC; null is what a JSON round trip leaves behind.
  it('treats a non-numeric expiry as no expiry', () => {
    const wire = { cueOrFreeform: 'pleased', weight: 1, expiryMs: null } as unknown as StackEntry
    const [, held] = run([
      [0, [wire]],
      [FADE_MS, [wire]]
    ])
    expect(held.ParamMouthForm).toBe(1)
  })
})

// A fade starts on the frame the switch is first seen, so every switch below
// is a step of its own before the sample that measures the fade.
function stepper(): (tMs: number, stack: StackEntry[]) => Record<string, number> {
  let state = initialFade()
  return (tMs, stack) => {
    const r = composeFrame(CUES, BASE, DEFAULTS, stack, tMs, state)
    state = r.state
    return r.params
  }
}

describe('compose — cross-fade between entries', () => {
  it('cross-fades from the old cue to the new one, params of both moving', () => {
    const step = stepper()
    step(0, [entry('pleased')])
    expect(step(FADE_MS, [entry('pleased')]).ParamMouthForm).toBe(1)

    step(FADE_MS, [entry('dejected')]) // switch seen here
    const mid = step(FADE_MS * 1.5, [entry('dejected')])
    expect(mid.ParamMouthForm).toBeCloseTo(0.2) // halfway from 1 to −0.6
    expect(mid.ParamCheek).toBeCloseTo(0.3) // pleased-only param easing back out
    expect(mid.ParamAngleY).toBeCloseTo(-7.5) // dejected-only param easing in

    const after = step(FADE_MS * 2, [entry('dejected')])
    expect(after.ParamMouthForm).toBeCloseTo(-0.6)
    expect(after.ParamCheek).toBe(0) // landed on the model default
    expect(after.ParamAngleY).toBeCloseTo(-15)
  })

  it('releases back to the trend/default floor when the stack empties', () => {
    const step = stepper()
    step(0, [entry('pleased')])
    step(FADE_MS, [entry('pleased')])
    step(FADE_MS, []) // release seen here
    expect(step(FADE_MS * 1.5, []).ParamMouthForm).toBeCloseTo(0.6) // 1 → base 0.2
    const released = step(FADE_MS * 2, [])
    expect(released.ParamMouthForm).toBeCloseTo(0.2)
    expect(released.ParamCheek).toBe(0)
  })

  it('a preempting baseline (already resolved to a cue by main) takes over the front', () => {
    // What the feed carries once run.ts has resolved 'error' to a cue name:
    // the preempt entry sits in front of the queue, which is preserved.
    const step = stepper()
    const queue = [entry('pleased')]
    step(0, queue)
    expect(step(FADE_MS, queue).ParamMouthForm).toBe(1)

    step(FADE_MS, [entry('dejected'), ...queue])
    expect(step(2 * FADE_MS, [entry('dejected'), ...queue]).ParamMouthForm).toBeCloseTo(-0.6)

    // …and when it lifts, the preserved queue entry fades back in.
    step(2 * FADE_MS, queue)
    expect(step(3 * FADE_MS, queue).ParamMouthForm).toBeCloseTo(1)
  })
})

// 002-D3: composed output must be a pure function of feed contents and tick
// time. Same guarantee the synth carries, now covering the expression layer —
// this is what keeps A3 green with cues driving parameters.
describe('compose — determinism through the replay path', () => {
  const PRESET = presetJson as SynthPreset
  type Feed = SynthFeed & { expressionStack: StackEntry[] }

  const history: Feed[] = Array.from({ length: 60 }, (_, tick) => ({
    E: { valence: 0.8 * Math.sin(tick / 5), arousal: 0.5 + 0.45 * Math.sin(tick / 3) },
    expressionStack:
      tick >= 10 && tick < 30 ? [entry('pleased')] : tick >= 40 ? [entry('dejected')] : []
  }))

  const makeCompose = (): ((
    p: Record<string, number>,
    f: Feed,
    t: number
  ) => Record<string, number>) => {
    let state = initialFade()
    return (params, feed, tMs) => {
      const r = composeFrame(CUES, params, DEFAULTS, feed.expressionStack, tMs, state)
      state = r.state
      return r.params
    }
  }

  it('two runs of the same history produce identical frames', () => {
    const a = replayHistory(() => createSynth(PRESET, mulberry32(42)), history, makeCompose)
    const b = replayHistory(() => createSynth(PRESET, mulberry32(42)), history, makeCompose)
    expect(JSON.stringify(a.frames)).toBe(JSON.stringify(b.frames))
  })

  it('batch replay (seek) matches driving tick by tick, cues included', () => {
    const synth = createSynth(PRESET, mulberry32(42))
    const compose = makeCompose()
    const incremental = history.flatMap((feed, tick) => driveTick(synth, feed, tick, compose))
    const seeked = replayHistory(() => createSynth(PRESET, mulberry32(42)), history, makeCompose)
    expect(JSON.stringify(seeked.frames)).toBe(JSON.stringify(incremental))
  })

  it('the cue actually reaches the frames (the bug this guards)', () => {
    const { frames } = replayHistory(
      () => createSynth(PRESET, mulberry32(42)),
      history,
      makeCompose
    )
    const held = frames.find((f) => f.t >= 1500 && f.t < 2900)! // tick 15–29, pleased
    expect(held.params.ParamMouthForm).toBe(1)
    expect(held.params.ParamCheek).toBe(0.6)
    const empty = frames.find((f) => f.t < 900)!
    expect(empty.params.ParamCheek).toBeUndefined()
  })
})
