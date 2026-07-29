import { describe, expect, it } from 'vitest'
import {
  nextMotionCue,
  playMotionRef,
  replaceHeldPreview,
  withHeldPreview
} from './affect'

describe('authoring preview frame ownership', () => {
  it('holds then replaces only previewed knobs while idle values survive', () => {
    const idle = { ParamBreath: 0.4, ParamAngleX: 3, ParamMouthForm: 0.2 }
    expect(withHeldPreview(idle, { ParamMouthForm: -1 })).toEqual({
      ParamBreath: 0.4,
      ParamAngleX: 3,
      ParamMouthForm: -1
    })
    expect(withHeldPreview(idle, { ParamAngleX: -8 })).toEqual({
      ParamBreath: 0.4,
      ParamAngleX: -8,
      ParamMouthForm: 0.2
    })
    expect(withHeldPreview(idle, null)).toEqual(idle)
  })

  it('releases replaced preview-only knobs without releasing affect-owned knobs', () => {
    const released: string[][] = []
    const runtime = { releaseParams: (ids: readonly string[]) => released.push([...ids]) }
    expect(
      replaceHeldPreview(
        runtime,
        new Set(['ParamMouthForm']),
        { ParamMouthForm: -1, ParamAngleX: 3 },
        { ParamEyeLOpen: 0.5 }
      )
    ).toEqual({ ParamEyeLOpen: 0.5 })
    expect(released).toEqual([['ParamAngleX']])
  })
})

describe('motion cue consumption', () => {
  const motions = { wave: 'TapBody:1' }

  it('plays a regular or previewed motion once, then waits for a replacement', () => {
    const stack = [{ cueOrFreeform: 'wave', weight: 1, expiryMs: Infinity }]
    expect(nextMotionCue(null, stack, motions, 0)).toEqual({
      next: 'wave:Infinity',
      play: 'TapBody:1'
    })
    expect(nextMotionCue('wave:Infinity', stack, motions, 100)).toEqual({
      next: 'wave:Infinity',
      play: null
    })
    expect(nextMotionCue('wave:Infinity', [], motions, 200)).toEqual({
      next: null,
      play: null
    })
    expect(nextMotionCue(null, stack, motions, 300)).toEqual({
      next: 'wave:Infinity',
      play: 'TapBody:1'
    })
  })

  it('plays consecutive instances of the same cue', () => {
    const first = [{ cueOrFreeform: 'wave', weight: 1, expiryMs: 1000 }]
    const second = [{ cueOrFreeform: 'wave', weight: 1, expiryMs: 2000 }]
    const played = nextMotionCue(null, first, motions, 0)
    expect(nextMotionCue(played.next, second, motions, 1000)).toEqual({
      next: 'wave:2000',
      play: 'TapBody:1'
    })
  })

  it('dispatches only the supported indexed motion form', () => {
    const calls: Array<[string, number | undefined]> = []
    const runtime = { playMotion: (group: string, index?: number) => calls.push([group, index]) }
    playMotionRef(runtime, 'TapBody:1')
    playMotionRef(runtime, 'Idle:not-a-number')
    playMotionRef(runtime, 'lares://characters/icegirl/runtime/wave.motion3.json')
    expect(calls).toEqual([
      ['TapBody', 1],
      ['Idle', undefined],
      ['lares://characters/icegirl/runtime/wave.motion3.json', undefined]
    ])
  })
})
