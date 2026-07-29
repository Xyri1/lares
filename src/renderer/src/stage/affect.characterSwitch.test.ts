import { describe, expect, it, vi } from 'vitest'
import type { IRuntime } from '../runtime/iface'
import { createAffectDriver } from './affect'
import { PRESETS } from './presets'

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
    const driver = createAffectDriver(runtime(), PRESETS.default, {})
    const feed: AffectFeed = {
      stageId: 'A',
      tick: 1,
      E: { valence: 0, arousal: 0 },
      M: { valence: 0, arousal: 0 },
      baselineState: 'steady',
      expressionStack: [],
      beats: []
    }

    driver.play('smooth-build', 1)
    affectUpdate?.(feed)
    expect(driver.buffer().engine).toHaveLength(1)

    const transaction = driver.characterChanged()
    expect(stopScenario).not.toHaveBeenCalled()
    transaction.finalize()

    expect(stopScenario).toHaveBeenCalledOnce()
    affectUpdate?.({ ...feed, tick: 2 })
    expect(driver.buffer().engine).toHaveLength(1)

    scenarioStopped?.()
    affectUpdate?.({ ...feed, tick: 3 })
    expect(driver.buffer().engine).toHaveLength(1)
  })
})
