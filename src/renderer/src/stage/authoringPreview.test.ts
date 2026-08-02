import { describe, expect, it } from 'vitest'
import { replaceHeldPreview, withHeldPreview } from './affect'

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
