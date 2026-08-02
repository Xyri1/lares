import { describe, expect, it, vi } from 'vitest'
import {
  computeTarget,
  withOverlay,
  DEFAULT_ANCHORS,
  DEFAULT_OPERATIONAL
} from '../feel/feel'
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

// SPEC §11 / P10: a dev-panel preview is a feel target like any other, so the
// live operational overlay still composites over it — the panel is the surface
// P10 gets judged on, and a preview that hid awaiting_input would lie there.
describe('AffectDriver pose preview', () => {
  it('composites the live operational overlay over a previewed tuple', () => {
    let affectUpdate: ((feed: AffectFeed) => void) | undefined
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
    const driver = createAffectDriver(rt, PRESETS.default)

    affectUpdate!({ stageId: 'A', tick: 1, feel: null, operational: 'awaiting_input' })
    driver.previewPose({ valence: 2, activation: 2, control: 2 })
    present!() // the synth's first frame snaps to the fed pose

    const target = computeTarget([1, 1, 1], DEFAULT_ANCHORS)
    const overlaid = withOverlay(target, 'awaiting_input', DEFAULT_OPERATIONAL)
    const frame = vi.mocked(rt.setParams).mock.calls.at(-1)![0]
    // ParamMouthForm is mouthCurve at gain 1, offset 0 (presets/default.json).
    expect(frame.ParamMouthForm).toBeCloseTo(overlaid.mouthCurve, 6)
    expect(overlaid.mouthCurve).not.toBeCloseTo(target.mouthCurve, 2)
  })
})
