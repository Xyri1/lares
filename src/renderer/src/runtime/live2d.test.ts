import { describe, expect, it } from 'vitest'
import { registerLooseMotion } from './looseMotion'

describe('registerLooseMotion', () => {
  it('adds a runtime-only Cubism4 definition once per URL', () => {
    const manager = { definitions: {}, motionGroups: {}, startMotion: async () => true }
    expect(registerLooseMotion(manager, 'lares://characters/icegirl/runtime/wave.motion3.json')).toBe(0)
    expect(registerLooseMotion(manager, 'lares://characters/icegirl/runtime/wave.motion3.json')).toBe(0)
    expect(registerLooseMotion(manager, 'lares://characters/icegirl/runtime/bow.motion3.json')).toBe(1)
    expect(manager.definitions).toEqual({
      __lares__: [
        { File: 'lares://characters/icegirl/runtime/wave.motion3.json' },
        { File: 'lares://characters/icegirl/runtime/bow.motion3.json' }
      ]
    })
    expect(manager.motionGroups).toEqual({ __lares__: [undefined, undefined] })
  })
})
