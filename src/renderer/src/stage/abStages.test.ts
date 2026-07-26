import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import defaultPreset from '../../../../presets/default.json'
import expressivePreset from '../../../../presets/expressive.json'
import { SCENARIO_CUES } from '../../../main/scenario/cues'
import { loadScenario } from '../../../main/scenario/load'
import { createStepper, traceLine, STEP_MS } from '../../../main/scenario/run'
import { createSynth, mulberry32, type SynthPreset } from '../synth/synth'
import { driveTick, frameToLine } from './synthReplay'

// A5: two stages, same golden + same seed, different presets. Each stage =
// own engine + own synth + own rng stream, driven by the identical tick
// sequence — so the engine halves of the traces must be byte-identical and
// only the synth halves may differ (slice SPEC §9 A5, 002-D2).
const SEED = 42
const GOLDEN = join(process.cwd(), 'scenarios', 'recovery-arc.json')

function stageTrace(preset: SynthPreset): { engine: string[]; synth: string[] } {
  const scenario = loadScenario(GOLDEN)
  const stepper = createStepper(scenario, SCENARIO_CUES)
  const synth = createSynth(preset, mulberry32(SEED))
  const engine: string[] = []
  const synthLines: string[] = []
  for (let t = 0; t <= stepper.endMs; t += STEP_MS) {
    const snap = stepper.step(t)
    engine.push(traceLine(t, snap))
    for (const frame of driveTick(synth, snap, t / STEP_MS)) synthLines.push(frameToLine(frame))
  }
  return { engine, synth: synthLines }
}

describe('dual-stage A/B (A5)', () => {
  const a = stageTrace(defaultPreset as SynthPreset)
  const b = stageTrace(expressivePreset as SynthPreset)

  it('engine lines are byte-identical across stages', () => {
    expect(a.engine.length).toBeGreaterThan(0)
    expect(a.engine.join('\n')).toBe(b.engine.join('\n'))
  })

  it('synth lines differ — the preset is the only visible difference', () => {
    expect(a.synth).toHaveLength(b.synth.length)
    expect(a.synth.join('\n')).not.toBe(b.synth.join('\n'))
  })

  it('each stage owns its rng stream: a stage is unchanged by the other running', () => {
    // Same seed, same preset, run twice -> identical, so interleaving stages
    // can never cross-consume random numbers (one mulberry32 per stage).
    expect(stageTrace(defaultPreset as SynthPreset).synth.join('\n')).toBe(a.synth.join('\n'))
  })
})
