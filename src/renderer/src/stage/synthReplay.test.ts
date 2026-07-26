import { describe, expect, it } from 'vitest'
import presetJson from '../../../../presets/default.json'
import { createSynth, mulberry32, type SynthFeed, type SynthPreset } from '../synth/synth'
import { driveTick, replayHistory } from './synthReplay'

const PRESET = presetJson as SynthPreset

function feedAt(tick: number): SynthFeed {
  return {
    E: {
      valence: 0.8 * Math.sin(tick / 5),
      arousal: 0.5 + 0.45 * Math.sin(tick / 3)
    }
  }
}

// The property the seek path depends on (002 step-6 decision 1): replaying
// a tick history in one batch (what a seek does) must be byte-identical to
// driving the same ticks one at a time from a fresh synth (what an
// unseeked run does).
describe('synthReplay — seek byte-equivalence', () => {
  it('batch replay of a full history matches driving it tick by tick', () => {
    const seed = 42
    const history = Array.from({ length: 50 }, (_, tick) => feedAt(tick))

    const live = createSynth(PRESET, mulberry32(seed))
    const liveFrames = history.flatMap((feed, tick) => driveTick(live, feed, tick))

    const seeked = replayHistory(() => createSynth(PRESET, mulberry32(seed)), history)

    expect(seeked.frames).toEqual(liveFrames)
  })

  it('seeking mid-run then continuing matches playing straight through', () => {
    const seed = 7
    const history = Array.from({ length: 80 }, (_, tick) => feedAt(tick))

    const straight = replayHistory(() => createSynth(PRESET, mulberry32(seed)), history)

    // Simulate: play a bit, seek to tick 50 (fresh replay of 0..50), then
    // keep driving ticks 50..79 incrementally — as stage/affect.ts does.
    const afterSeek = replayHistory(() => createSynth(PRESET, mulberry32(seed)), history.slice(0, 50))
    const synth = afterSeek.synth
    const tailFrames = [...afterSeek.frames]
    for (let tick = 50; tick < history.length; tick++) {
      tailFrames.push(...driveTick(synth, history[tick], tick))
    }

    expect(tailFrames).toEqual(straight.frames)
  })

  it('different seeds diverge', () => {
    const history = Array.from({ length: 10 }, (_, tick) => feedAt(tick))
    const a = replayHistory(() => createSynth(PRESET, mulberry32(1)), history)
    const b = replayHistory(() => createSynth(PRESET, mulberry32(2)), history)
    expect(a.frames).not.toEqual(b.frames)
  })
})
