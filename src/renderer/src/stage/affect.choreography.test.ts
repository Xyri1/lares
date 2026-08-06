// Slice 014 I3 gate: one phrase per displayed-feel change, duplicate and
// elapsed-time inertness, overlay priority, and transaction-safe scheduling
// (SPEC §6) — all on a fake clock.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import defaultPresetJson from '../../../../presets/default.json'
import type { ChoreographyMap } from '../feel/choreography'
import type { IRuntime } from '../runtime/iface'
import type { SynthPreset } from '../synth/synth'
import { createAffectDriver } from './affect'

const defaultPreset = defaultPresetJson as SynthPreset

const MAP: ChoreographyMap = {
  fallback: { group: 'Idle', index: 1 },
  anchors: {
    '+++': { group: 'Tap', index: 3 },
    '---': { group: 'Idle', index: 0 }
  }
}

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

type FeedFn = (feed: AffectFeed) => void
type SeekFn = (history: AffectFeed[]) => void

function boot(map?: ChoreographyMap): {
  rt: IRuntime
  feed: FeedFn
  seek: SeekFn
  driver: ReturnType<typeof createAffectDriver>
} {
  let affectUpdate: FeedFn | undefined
  let scenarioSeeked: SeekFn | undefined
  Object.assign(globalThis, {
    requestAnimationFrame: vi.fn(),
    window: {
      lares: {
        onAuthoringPreview: vi.fn(),
        onAuthoringRevert: vi.fn(),
        onAffectUpdate: (cb: FeedFn) => {
          affectUpdate = cb
        },
        onScenarioSeeked: (cb: SeekFn) => {
          scenarioSeeked = cb
        },
        onScenarioEnd: vi.fn(),
        onScenarioStopped: vi.fn(),
        sendSynthTrace: vi.fn(),
        playScenario: vi.fn(async () => ({ ok: true as const, endMs: 1000 })),
        stopScenario: vi.fn(async () => ({ ok: true as const }))
      }
    }
  })
  const rt = runtime()
  const driver = createAffectDriver(rt, defaultPreset, undefined, map)
  return { rt, feed: affectUpdate!, seek: scenarioSeeked!, driver }
}

const tuple = (v: number, a: number, c: number): { valence: number; activation: number; control: number } => ({
  valence: v,
  activation: a,
  control: c
})

const plays = (rt: IRuntime): { group: string; index: number }[] =>
  vi.mocked(rt.playManagedMotion).mock.calls.map(([plan]) => ({
    group: plan.group,
    index: plan.index
  }))

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('choreography lifecycle (SPEC §6)', () => {
  it('plays one modulated phrase per feel change; identical tuples and elapsed time stay inert', () => {
    const { rt, feed } = boot(MAP)
    feed({ tick: 1, feel: tuple(2, 2, 2), operational: 'idle' })
    vi.advanceTimersByTime(1199)
    expect(rt.playManagedMotion).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(rt.playManagedMotion).toHaveBeenCalledTimes(1)
    const plan = vi.mocked(rt.playManagedMotion).mock.calls[0][0]
    expect(plan).toMatchObject({ group: 'Tap', index: 3, displacement: 1 })
    expect(plan.tempo).toBeCloseTo(1.15, 10)
    // Face rig ids ride the plan; body channels never do.
    expect(plan.faceParamIds).toContain('ParamMouthForm')
    expect(plan.faceParamIds).not.toContain('ParamAngleY')

    feed({ tick: 2, feel: tuple(2, 2, 2), operational: 'idle' })
    feed({ tick: 3, feel: tuple(2, 2, 2), operational: 'done' }) // non-loud operational change
    vi.advanceTimersByTime(600_000)
    expect(rt.playManagedMotion).toHaveBeenCalledTimes(1)
    expect(rt.cancelManagedMotion).toHaveBeenCalledTimes(1)
  })

  it('a newer tuple supersedes the pending phrase; only the newest plays', () => {
    const { rt, feed } = boot(MAP)
    feed({ tick: 1, feel: tuple(2, 2, 2), operational: 'idle' })
    vi.advanceTimersByTime(600)
    feed({ tick: 2, feel: tuple(-2, -2, -2), operational: 'idle' })
    expect(rt.cancelManagedMotion).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(1200)
    expect(plays(rt)).toEqual([{ group: 'Idle', index: 0 }])
  })

  it('half-corner and ambiguous tuples resolve through the same selector', () => {
    const { rt, feed } = boot(MAP)
    feed({ tick: 1, feel: tuple(1, 1, 1), operational: 'idle' })
    vi.advanceTimersByTime(1200)
    const plan = vi.mocked(rt.playManagedMotion).mock.calls[0][0]
    expect(plan).toMatchObject({ group: 'Tap', index: 3, displacement: 0.75 })
    feed({ tick: 2, feel: tuple(2, 0, 0), operational: 'idle' })
    vi.advanceTimersByTime(1200)
    expect(plays(rt)[1]).toEqual({ group: 'Idle', index: 1 }) // fallback, never a borrowed corner
  })

  it('a loud overlay cancels and wins; clearing it schedules the unchanged latch exactly once', () => {
    const { rt, feed } = boot(MAP)
    feed({ tick: 1, feel: tuple(2, 2, 2), operational: 'idle' })
    vi.advanceTimersByTime(1200)
    feed({ tick: 2, feel: tuple(2, 2, 2), operational: 'awaiting_input' })
    expect(rt.cancelManagedMotion).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(600_000)
    expect(rt.playManagedMotion).toHaveBeenCalledTimes(1) // nothing starts under the overlay
    feed({ tick: 3, feel: tuple(2, 2, 2), operational: 'idle' })
    vi.advanceTimersByTime(1200)
    expect(rt.playManagedMotion).toHaveBeenCalledTimes(2)
    expect(plays(rt)[1]).toEqual({ group: 'Tap', index: 3 })
  })

  it('feel=null cancels without scheduling; the tuple returning is a fresh change', () => {
    const { rt, feed } = boot(MAP)
    feed({ tick: 1, feel: tuple(2, 2, 2), operational: 'idle' })
    vi.advanceTimersByTime(1200)
    feed({ tick: 2, feel: null, operational: 'idle' })
    vi.advanceTimersByTime(600_000)
    expect(rt.playManagedMotion).toHaveBeenCalledTimes(1)
    feed({ tick: 3, feel: tuple(2, 2, 2), operational: 'idle' })
    vi.advanceTimersByTime(1200)
    expect(rt.playManagedMotion).toHaveBeenCalledTimes(2)
  })

  it('a character without choreography never touches the managed seam', () => {
    const { rt, feed } = boot(undefined)
    feed({ tick: 1, feel: tuple(2, 2, 2), operational: 'idle' })
    vi.advanceTimersByTime(600_000)
    expect(rt.playManagedMotion).not.toHaveBeenCalled()
    expect(rt.cancelManagedMotion).not.toHaveBeenCalled()
  })

  it('manual preview drives the same lifecycle and never writes the latch', () => {
    const { rt, feed, driver } = boot(MAP)
    feed({ tick: 1, feel: tuple(2, 2, 2), operational: 'idle' })
    vi.advanceTimersByTime(1200)
    driver.previewPose(tuple(-2, -2, -2))
    vi.advanceTimersByTime(1200)
    expect(plays(rt)[1]).toEqual({ group: 'Idle', index: 0 })
    driver.previewPose(null) // back to the untouched latch
    vi.advanceTimersByTime(1200)
    expect(plays(rt)[2]).toEqual({ group: 'Tap', index: 3 })
    expect(rt.playManagedMotion).toHaveBeenCalledTimes(3)
  })

  it('a loud overlay preempts manual preview and returns to the unchanged latch', () => {
    const { rt, feed, driver } = boot(MAP)
    feed({ tick: 1, feel: tuple(2, 2, 2), operational: 'idle' })
    vi.advanceTimersByTime(1200)
    driver.previewPose(tuple(-2, -2, -2))
    vi.advanceTimersByTime(1200)

    feed({ tick: 2, feel: tuple(2, 2, 2), operational: 'awaiting_input' })
    expect(rt.cancelManagedMotion).toHaveBeenCalledTimes(3)
    vi.advanceTimersByTime(600_000)
    expect(rt.playManagedMotion).toHaveBeenCalledTimes(2)

    feed({ tick: 3, feel: tuple(2, 2, 2), operational: 'idle' })
    vi.advanceTimersByTime(1200)
    expect(plays(rt)[2]).toEqual({ group: 'Tap', index: 3 })
  })

  it('scenario seek cancels an obsolete phrase and schedules the terminal tuple', () => {
    const { rt, feed, seek, driver } = boot(MAP)
    driver.play('seek', 1)
    feed({ tick: 1, feel: tuple(2, 2, 2), operational: 'idle' })
    vi.advanceTimersByTime(600)

    seek([{ tick: 2, feel: tuple(-2, -2, -2), operational: 'idle' }])
    vi.advanceTimersByTime(1200)

    expect(plays(rt)).toEqual([{ group: 'Idle', index: 0 }])
  })

  it('commit + finalize schedule the unchanged latch once via the re-emitted feed, deferred under a loud overlay', () => {
    const { rt, feed, driver } = boot(MAP)
    feed({ tick: 1, feel: tuple(2, 2, 2), operational: 'idle' })
    vi.advanceTimersByTime(1200) // play 1, old map
    const nextMap: ChoreographyMap = {
      fallback: { group: 'Other', index: 0 },
      anchors: { '+++': { group: 'New', index: 5 } }
    }
    driver.characterChanged(defaultPreset, undefined, nextMap).finalize()
    // Main re-emits the unchanged latch after commit — here under a loud
    // overlay, so the single schedule defers until it clears (SPEC §6).
    feed({ tick: 2, feel: tuple(2, 2, 2), operational: 'awaiting_input' })
    vi.advanceTimersByTime(600_000)
    expect(rt.playManagedMotion).toHaveBeenCalledTimes(1)
    feed({ tick: 3, feel: tuple(2, 2, 2), operational: 'idle' })
    vi.advanceTimersByTime(1200)
    expect(plays(rt)[1]).toEqual({ group: 'New', index: 5 }) // new mapping, new generation
    feed({ tick: 4, feel: tuple(2, 2, 2), operational: 'idle' })
    vi.advanceTimersByTime(600_000)
    expect(rt.playManagedMotion).toHaveBeenCalledTimes(2) // exactly once
  })

  it('a character transaction cancels the pending phrase; rollback re-establishes the latch once under the restored map', () => {
    const { rt, feed, driver } = boot(MAP)
    feed({ tick: 1, feel: tuple(1, 1, 1), operational: 'idle' })
    vi.advanceTimersByTime(300) // still pending
    const tx = driver.characterChanged(defaultPreset, undefined, {
      fallback: { group: 'Other', index: 0 }
    })
    vi.advanceTimersByTime(600_000)
    expect(rt.playManagedMotion).not.toHaveBeenCalled() // prepare/commit stay visibly inert
    tx.rollback()
    vi.advanceTimersByTime(1200)
    expect(plays(rt)).toEqual([{ group: 'Tap', index: 3 }]) // old map, latch unchanged, once
  })
})
