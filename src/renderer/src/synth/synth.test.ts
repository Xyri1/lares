import { describe, expect, it } from 'vitest'
import presetJson from '../../../../presets/default.json'
import { computeTarget, DEFAULT_ANCHORS, type Pose } from '../feel/feel'
import { createSynth, mulberry32, type SynthFeed, type SynthPreset } from './synth'

const PRESET = presetJson as SynthPreset

/** A pose with only the channels under test moved off neutral. */
function pose(overrides: Partial<Pose> = {}): Pose {
  return { ...DEFAULT_ANCHORS.neutral, ...overrides }
}

// A varied but fixed target sequence — what the driver hands the synth tick
// by tick once the feel blend has run.
function feedAt(tick: number): SynthFeed {
  return {
    pose: computeTarget(
      [Math.sin(tick / 5), Math.sin(tick / 3), Math.cos(tick / 7)],
      DEFAULT_ANCHORS
    )
  }
}

// The replay frame grid: 3 frames per 100ms tick at exact thirds, exactly
// as stage/affect.ts computes them.
function run(seed: number, ticks = 100): string {
  const synth = createSynth(PRESET, mulberry32(seed))
  const lines: string[] = []
  for (let tick = 0; tick < ticks; tick++) {
    const feed = feedAt(tick)
    for (let i = 0; i < 3; i++) {
      const t = tick * 100 + (i * 100) / 3
      lines.push(JSON.stringify({ t, params: synth.computeFrame(feed, t) }))
    }
  }
  return lines.join('\n')
}

describe('synth determinism (002-D3)', () => {
  it('same seed twice over the fixed frame grid → byte-identical output', () => {
    expect(run(42)).toBe(run(42))
  })

  it('different seed → different output', () => {
    expect(run(42)).not.toBe(run(1337))
  })

  it('output key order is preset param list, then breath, blink ids, sway', () => {
    const synth = createSynth(PRESET, mulberry32(1))
    const keys = Object.keys(synth.computeFrame(feedAt(0), 0))
    expect(keys).toEqual([
      ...new Set([
        ...PRESET.params.map((p) => p.id),
        PRESET.idle.breath.id,
        ...PRESET.idle.blink.ids,
        PRESET.idle.sway.id
      ])
    ])
  })
})

describe('static channel wiring (SPEC §5)', () => {
  it('drives each bound parameter as offset + gain·channel', () => {
    const target = computeTarget([1, -0.5, 0.5], DEFAULT_ANCHORS)
    const frame = createSynth(PRESET, mulberry32(1)).computeFrame({ pose: target }, 0)
    for (const p of PRESET.params) {
      if (PRESET.idle.blink.ids.includes(p.id)) continue // blink owns those, below
      expect(frame[p.id]).toBeCloseTo(p.offset + p.gain * target[p.source], 12)
    }
  })

  it('eases into a new target instead of jumping to it', () => {
    const synth = createSynth(PRESET, mulberry32(1))
    const id = 'ParamMouthForm'
    const rest = synth.computeFrame({ pose: pose() }, 0)[id]
    const next = { pose: pose({ mouthCurve: 1 }) }
    const first = synth.computeFrame(next, 1000 / 60)[id]
    expect(first).toBeGreaterThan(rest)
    expect(first).toBeLessThan(0.2) // nowhere near the target one frame in
    let last = first
    for (let t = 2 * (1000 / 60); t <= 2000; t += 1000 / 60) {
      last = synth.computeFrame(next, t)[id]
    }
    expect(last).toBeCloseTo(1, 2) // settled, and it holds there
  })
})

describe('channel-driven idle writers (SPEC §13)', () => {
  it('breath runs faster at higher breathRate', () => {
    const calm = createSynth(PRESET, mulberry32(1))
    const rapid = createSynth(PRESET, mulberry32(1))
    let calmV = 0
    let rapidV = 0
    for (let t = 0; t <= 1000; t += 100) {
      calmV = calm.computeFrame({ pose: pose() }, t)[PRESET.idle.breath.id]
      rapidV = rapid.computeFrame({ pose: pose({ breathRate: 1 }) }, t)[PRESET.idle.breath.id]
    }
    // Both still inside the first half-cycle, where more phase = larger value.
    expect(rapidV).toBeGreaterThan(calmV)
  })

  it('breath swings wider at higher breathDepth', () => {
    const shallow = createSynth(PRESET, mulberry32(1))
    const deep = createSynth(PRESET, mulberry32(1))
    let shallowMax = 0
    let deepMax = 0
    for (let t = 0; t <= 4000; t += 100) {
      shallowMax = Math.max(shallowMax, shallow.computeFrame({ pose: pose() }, t)[PRESET.idle.breath.id])
      deepMax = Math.max(
        deepMax,
        deep.computeFrame({ pose: pose({ breathDepth: 1 }) }, t)[PRESET.idle.breath.id]
      )
    }
    expect(deepMax).toBeGreaterThan(shallowMax)
  })

  it('blinks: eye openness dips within the first 10 seconds', () => {
    const synth = createSynth(PRESET, mulberry32(7))
    const eyeId = PRESET.idle.blink.ids[0]
    let min = Infinity
    for (let tick = 0; tick < 100; tick++) {
      for (let i = 0; i < 3; i++) {
        const t = tick * 100 + (i * 100) / 3
        min = Math.min(min, synth.computeFrame({ pose: pose() }, t)[eyeId])
      }
    }
    expect(min).toBeLessThan(0.6)
  })

  it('blinks more often at higher blinkRate', () => {
    const count = (blinkRate: number): number => {
      const synth = createSynth(PRESET, mulberry32(7))
      const eyeId = PRESET.idle.blink.ids[0]
      let blinks = 0
      let closed = false
      for (let t = 0; t <= 30_000; t += 1000 / 60) {
        const open = synth.computeFrame({ pose: pose({ blinkRate }) }, t)[eyeId]
        if (open < 0.5 && !closed) blinks++
        closed = open < 0.5
      }
      return blinks
    }
    expect(count(1)).toBeGreaterThan(count(-1))
  })

  it('the blink envelope rides on top of the eyeOpen wiring, not over it', () => {
    // Between blinks the envelope is 1, so the eye ids read exactly what the
    // static channel asked for — the two writers compose instead of racing.
    const wide = createSynth(PRESET, mulberry32(3)).computeFrame({ pose: pose({ eyeOpen: 1 }) }, 0)
    const narrow = createSynth(PRESET, mulberry32(3)).computeFrame(
      { pose: pose({ eyeOpen: -1 }) },
      0
    )
    const binding = PRESET.params.find((p) => p.id === PRESET.idle.blink.ids[0])!
    expect(wide[binding.id]).toBeCloseTo(binding.offset + binding.gain, 12)
    expect(narrow[binding.id]).toBeCloseTo(binding.offset - binding.gain, 12)
  })

  it('sway amplitude grows with swayAmplitude, and −1 is still', () => {
    // Same seed → same sway phase; compare |value| at a peak-phase-free time.
    const swayId = PRESET.idle.sway.id
    const at = (swayAmplitude: number): number =>
      createSynth(PRESET, mulberry32(3)).computeFrame({ pose: pose({ swayAmplitude }) }, 1234)[
        swayId
      ]
    expect(Math.abs(at(1))).toBeGreaterThan(Math.abs(at(0)))
    expect(Math.abs(at(-1))).toBe(0)
  })
})
