import { describe, expect, it, vi } from 'vitest'
import defaultPresetJson from '../../../../presets/default.json'
import type { IRuntime } from '../runtime/iface'
import type { SynthPreset } from '../synth/synth'
import { createAffectDriver } from './affect'

const defaultPreset = defaultPresetJson as SynthPreset

function runtime(): IRuntime {
  return {
    load: vi.fn(),
    prepareLoad: vi.fn(),
    commitLoad: vi.fn(),
    rollbackLoad: vi.fn(),
    finalizeLoad: vi.fn(),
    cancelLoad: vi.fn(),
    parameters: vi.fn(() => []),
    setParams: vi.fn(),
    releaseParams: vi.fn(),
    resetParams: vi.fn(),
    applyExpression: vi.fn(),
    playMotion: vi.fn(),
    playManagedMotion: vi.fn(async () => true),
    cancelManagedMotion: vi.fn(),
    hitTest: vi.fn(() => []),
    alphaAt: vi.fn(() => 0),
    larSize: vi.fn(() => ({ width: 100, height: 200 }))
  }
}

describe('AffectDriver character switching', () => {
  it('stops a real active replay only when the character transaction finalizes', () => {
    let affectUpdate: ((feed: AffectFeed) => void) | undefined
    let scenarioStopped: (() => void) | undefined
    const stopScenario = vi.fn(async () => ({ ok: true as const }))
    Object.assign(globalThis, {
      requestAnimationFrame: vi.fn(),
      window: {
        lares: {
          onAuthoringPreview: vi.fn(),
          onAuthoringRevert: vi.fn(),
          onAffectUpdate: (cb: (feed: AffectFeed) => void) => {
            affectUpdate = cb
          },
          onScenarioSeeked: vi.fn(),
          onScenarioEnd: vi.fn(),
          onScenarioStopped: (cb: () => void) => {
            scenarioStopped = cb
          },
          sendSynthTrace: vi.fn(),
          playScenario: vi.fn(async () => ({ ok: true as const, endMs: 1000 })),
          stopScenario
        }
      }
    })
    const driver = createAffectDriver(runtime(), defaultPreset)
    const feed: AffectFeed = {
      tick: 1,
      feel: { valence: 0, activation: 0, control: 0 },
      operational: 'working'
    }

    driver.play('smooth-build', 1)
    affectUpdate?.(feed)
    expect(driver.buffer().engine).toHaveLength(1)

    const transaction = driver.characterChanged()
    expect(stopScenario).not.toHaveBeenCalled()
    affectUpdate?.({ ...feed, tick: 2 })
    expect(driver.buffer().engine).toHaveLength(1)
    transaction.finalize()

    expect(stopScenario).not.toHaveBeenCalled()
    affectUpdate?.({ ...feed, tick: 3 })
    expect(driver.buffer().engine).toHaveLength(1)

    scenarioStopped?.()
    affectUpdate?.({ ...feed, tick: 4 })
    expect(driver.buffer().engine).toHaveLength(1)
  })

  it('buffers affect while tentative and replays it only after rollback', () => {
    let affectUpdate: ((feed: AffectFeed) => void) | undefined
    const rt = runtime()
    Object.assign(globalThis, {
      requestAnimationFrame: vi.fn(),
      window: {
        lares: {
          onAuthoringPreview: vi.fn(),
          onAuthoringRevert: vi.fn(),
          onAffectUpdate: (cb: (feed: AffectFeed) => void) => {
            affectUpdate = cb
          },
          onScenarioSeeked: vi.fn(),
          onScenarioEnd: vi.fn(),
          onScenarioStopped: vi.fn(),
          sendSynthTrace: vi.fn(),
          playScenario: vi.fn(async () => ({ ok: true as const, endMs: 1000 })),
          stopScenario: vi.fn(async () => ({ ok: true as const }))
        }
      }
    })
    const driver = createAffectDriver(rt, defaultPreset)
    const feed: AffectFeed = {
      tick: 1,
      feel: { valence: 0, activation: 0, control: 0 },
      operational: 'working'
    }

    driver.play('smooth-build', 1)
    affectUpdate?.(feed)
    const transaction = driver.characterChanged()
    vi.mocked(rt.setParams).mockClear()

    affectUpdate?.({ ...feed, tick: 2, feel: { valence: 2, activation: 1, control: -1 } })

    expect(driver.buffer().engine).toHaveLength(1)
    expect(rt.setParams).not.toHaveBeenCalled()

    transaction.rollback()

    expect(driver.buffer().engine.map((entry) => entry.t)).toEqual([100, 200])
    expect(driver.buffer().engine.at(-1)!.feel).toEqual({
      valence: 1,
      activation: 0.5,
      control: -0.5
    })
  })

  it('falls back to the bundled default preset when the incoming character has no performance mapping, and rollback restores the previous preset', () => {
    // Stand-in for an outgoing character with a legacy uppercase-ID mapping
    // (e.g. Haru), deliberately using ids the bundled default preset doesn't.
    const legacyPreset: SynthPreset = {
      params: [{ id: 'PARAM_MOUTH_FORM', source: 'mouthCurve', gain: 1, offset: 0 }],
      idle: {
        breath: { id: 'PARAM_BREATH', basePeriodMs: 4000, amplitude: 1 },
        blink: {
          ids: ['PARAM_EYE_L_OPEN', 'PARAM_EYE_R_OPEN'],
          baseIntervalMs: 3500,
          durationMs: 160
        },
        sway: { id: 'PARAM_ANGLE_X', baseAmplitude: 6, periodMs: 5000 }
      }
    }
    let present: (() => void) | undefined
    const rt = runtime()
    Object.assign(globalThis, {
      requestAnimationFrame: vi.fn((cb: () => void) => {
        present = cb
      }),
      window: {
        lares: {
          onAuthoringPreview: vi.fn(),
          onAuthoringRevert: vi.fn(),
          onAffectUpdate: vi.fn(),
          onScenarioSeeked: vi.fn(),
          onScenarioEnd: vi.fn(),
          onScenarioStopped: vi.fn(),
          sendSynthTrace: vi.fn(),
          playScenario: vi.fn(async () => ({ ok: true as const, endMs: 1000 })),
          stopScenario: vi.fn(async () => ({ ok: true as const }))
        }
      }
    })
    const driver = createAffectDriver(rt, legacyPreset)

    present!() // sanity: idles on the outgoing (legacy) preset before any switch
    expect(vi.mocked(rt.setParams).mock.calls.at(-1)![0]).toHaveProperty('PARAM_BREATH')

    const transaction = driver.characterChanged() // no arg: incoming character has no `performance` block
    present!()
    const afterSwitch = vi.mocked(rt.setParams).mock.calls.at(-1)![0]
    expect(afterSwitch).toHaveProperty(defaultPreset.idle.breath.id)
    expect(afterSwitch).not.toHaveProperty('PARAM_BREATH')

    transaction.rollback()
    present!()
    const afterRollback = vi.mocked(rt.setParams).mock.calls.at(-1)![0]
    expect(afterRollback).toHaveProperty('PARAM_BREATH')
  })
})
