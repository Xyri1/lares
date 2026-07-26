import { describe, expect, it } from 'vitest'
import { REST_POINT, type Vec2 } from './constants'
import { AffectEngine } from './engine'
import { SCENARIO_CUES } from '../scenario/cues'

// A6 (slice SPEC §9): "the engine's nearest-cue pick at each cue's own
// coordinates is that cue." E starts at REST_POINT; a single nudge on a
// synthetic key (delta = target - REST_POINT, intensity 1) lands E exactly
// on the target coordinate. That synthetic key rides alongside the real
// seven cues so selectCue() is exercised against the real candidate set —
// distance to self is 0, so the target cue always wins.
describe('A6 — nearest-cue pick at each cue\'s own coordinates', () => {
  for (const [name, target] of Object.entries(SCENARIO_CUES)) {
    it(`selects "${name}" when E is at ${name}'s coordinates`, () => {
      const delta: Vec2 = {
        valence: target.valence - REST_POINT.valence,
        arousal: target.arousal - REST_POINT.arousal
      }
      const engine = new AffectEngine({ ...SCENARIO_CUES, __target: delta }, 0)
      engine.applyCueNudge('__target', 'a6-test', 0, 1)
      expect(engine.snapshot().E).toEqual(target)
      expect(engine.selectCue()).toBe(name)
    })
  }
})
