import { describe, expect, it, vi } from 'vitest'
import defaultPresetJson from '../../../../presets/default.json'
import {
  computeTarget,
  withOverlay,
  DEFAULT_ANCHORS,
  DEFAULT_OPERATIONAL
} from '../feel/feel'
import type { IRuntime } from '../runtime/iface'
import type { SynthPreset } from '../synth/synth'
import { createAffectDriver, type PipelineSnapshot } from './affect'

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
    const driver = createAffectDriver(rt, defaultPreset)

    affectUpdate!({ tick: 1, feel: null, operational: 'awaiting_input' })
    driver.previewPose({ valence: 2, activation: 2, control: 2 })
    present!() // the synth's first frame snaps to the fed pose

    const target = computeTarget([1, 1, 1], DEFAULT_ANCHORS)
    const overlaid = withOverlay(target, 'awaiting_input', DEFAULT_OPERATIONAL)
    const frame = vi.mocked(rt.setParams).mock.calls.at(-1)![0]
    // ParamMouthForm is mouthCurve at gain 1, offset 0 (presets/default.json).
    expect(frame.ParamMouthForm).toBeCloseTo(overlaid.mouthCurve, 6)
    expect(overlaid.mouthCurve).not.toBeCloseTo(target.mouthCurve, 2)
  })

  it('reports semantic input and the real rig clamp without logging animation frames', () => {
    let affectUpdate: ((feed: AffectFeed) => void) | undefined
    const rt = runtime()
    // A rig whose eye range is narrower than the wiring's assumed [0, 1], so
    // the snapshot's clamp report has something real to catch.
    vi.mocked(rt.parameters).mockReturnValue([
      { id: 'ParamEyeLOpen', name: 'left eye', min: 0, max: 0.8, default: 0.8 }
    ])
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
    const snapshots: PipelineSnapshot[] = []
    const receipts: AffectFeed[] = []
    driver.onPipeline((snapshot) => snapshots.push(snapshot))
    driver.onFeed((feed) => receipts.push(feed))

    driver.previewPose(
      { valence: 2, activation: 2, control: 2 },
      { operational: 'error', expressiveness: 10 }
    )

    expect(snapshots).toHaveLength(1)
    expect(snapshots[0]).toMatchObject({
      source: 'manual',
      feel: { valence: 2, activation: 2, control: 2 },
      normalized: { valence: 1, activation: 1, control: 1 },
      operational: 'error',
      expressiveness: 10
    })
    expect(snapshots[0].bindings.find((binding) => binding.id === 'ParamEyeLOpen')).toMatchObject({
      value: 0.8,
      clipped: true,
      missing: false
    })

    driver.previewPose(null)
    expect(snapshots.at(-1)).toMatchObject({ source: 'live', feel: null, operational: 'idle' })

    driver.previewPose(
      { valence: 2, activation: 2, control: 2 },
      { operational: 'error', expressiveness: 10 }
    )
    const countWhileManual = snapshots.length
    affectUpdate!({
      tick: 1,
      feel: { valence: -1, activation: 0, control: 1 },
      operational: 'working'
    })
    expect(receipts).toHaveLength(1)
    expect(snapshots).toHaveLength(countWhileManual)
    expect(snapshots.at(-1)?.source).toBe('manual')

    driver.previewPose(null)
    expect(snapshots.at(-1)).toMatchObject({
      source: 'live',
      feel: { valence: -1, activation: 0, control: 1 },
      operational: 'working'
    })
  })
})
