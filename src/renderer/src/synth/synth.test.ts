import { describe, expect, it } from 'vitest'
import presetJson from '../../../../presets/default.json'
import { createSynth, mulberry32, type SynthFeed, type SynthPreset } from './synth'

const PRESET = presetJson as SynthPreset

// A varied but fixed feed sequence — what the driver sees tick by tick.
function feedAt(tick: number): SynthFeed {
  return {
    E: {
      valence: 0.8 * Math.sin(tick / 5),
      arousal: 0.5 + 0.45 * Math.sin(tick / 3)
    }
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
      ...PRESET.params.map((p) => p.id),
      PRESET.idle.breath.id,
      ...PRESET.idle.blink.ids,
      PRESET.idle.sway.id
    ])
  })
})

describe('synth behavior (root SPEC §4 formulas)', () => {
  it('breath runs faster at higher arousal', () => {
    const calm = createSynth(PRESET, mulberry32(1))
    const hyped = createSynth(PRESET, mulberry32(1))
    let calmV = 0
    let hypedV = 0
    for (let t = 0; t <= 1000; t += 100) {
      calmV = calm.computeFrame({ E: { valence: 0, arousal: 0 } }, t)[PRESET.idle.breath.id]
      hypedV = hyped.computeFrame({ E: { valence: 0, arousal: 1 } }, t)[PRESET.idle.breath.id]
    }
    // Both still inside the first half-cycle, where more phase = larger value.
    expect(hypedV).toBeGreaterThan(calmV)
  })

  it('blinks: eye openness dips within the first 10 seconds', () => {
    const synth = createSynth(PRESET, mulberry32(7))
    const eyeId = PRESET.idle.blink.ids[0]
    let min = Infinity
    for (let tick = 0; tick < 100; tick++) {
      for (let i = 0; i < 3; i++) {
        const t = tick * 100 + (i * 100) / 3
        const v = synth.computeFrame({ E: { valence: 0.1, arousal: 0.25 } }, t)[eyeId]
        min = Math.min(min, v)
      }
    }
    expect(min).toBeLessThan(0.6)
  })

  it('sway amplitude grows with arousal', () => {
    // Same seed → same sway phase; compare |value| at a peak-phase-free time.
    const swayId = PRESET.idle.sway.id
    const low = createSynth(PRESET, mulberry32(3)).computeFrame(
      { E: { valence: 0, arousal: 0 } },
      1234
    )[swayId]
    const high = createSynth(PRESET, mulberry32(3)).computeFrame(
      { E: { valence: 0, arousal: 1 } },
      1234
    )[swayId]
    expect(Math.abs(high)).toBeGreaterThan(Math.abs(low))
  })
})
