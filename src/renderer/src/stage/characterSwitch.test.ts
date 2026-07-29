import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { IRuntime, ParamInfo } from '../runtime/iface'
import { createCharacterLoadHandler } from './characterSwitch'

const failure = JSON.parse(
  readFileSync(join(__dirname, '..', 'runtime', 'fixtures', 'load-failure.json'), 'utf8')
) as { error: string }

class FixtureRuntime implements Pick<IRuntime, 'load' | 'parameters'> {
  visible = 'first'
  private inventory: ParamInfo[] = [
    { id: 'ParamFirst', name: 'ParamFirst', min: -1, max: 1, default: 0 }
  ]

  async load(modelPath: string): Promise<void> {
    if (modelPath === 'fixture:failure') throw new Error(failure.error)
    this.visible = modelPath
    this.inventory = [
      { id: 'ParamSecond', name: 'ParamSecond', min: -1, max: 1, default: 0 }
    ]
  }

  parameters(): ParamInfo[] {
    return this.inventory
  }
}

describe('body character load handshake', () => {
  it('publishes new cues and clears playback only after model load succeeds', async () => {
    const runtime = new FixtureRuntime()
    const cueParams = { First: { ParamFirst: 1 } }
    const cueMotions = { Wave: 'Idle:0' }
    let resets = 0
    const results: unknown[] = []
    const handle = createCharacterLoadHandler(
      runtime,
      { characterChanged: () => resets++ },
      cueParams,
      cueMotions,
      (result) => results.push(result)
    )

    await handle({
      id: 1,
      character: { ok: true, name: 'Broken', live2d: { model: 'fixture:failure' } },
      cues: [{ name: 'Broken', valence: 0, arousal: 0, params: { ParamBroken: 1 } }]
    })
    expect(runtime.visible).toBe('first')
    expect(cueParams).toEqual({ First: { ParamFirst: 1 } })
    expect(cueMotions).toEqual({ Wave: 'Idle:0' })
    expect(resets).toBe(0)
    expect(results).toEqual([{ id: 1, ok: false, error: failure.error }])

    await handle({
      id: 2,
      character: { ok: true, name: 'Second', live2d: { model: 'fixture:second' } },
      cues: [
        { name: 'Second', valence: 0.2, arousal: 0.3, params: { ParamSecond: 1 } },
        { name: 'Motion', valence: null, arousal: null, motion: 'Wave:0' }
      ]
    })
    expect(runtime.visible).toBe('fixture:second')
    expect(cueParams).toEqual({ Second: { ParamSecond: 1 } })
    expect(cueMotions).toEqual({ Motion: 'Wave:0' })
    expect(resets).toBe(1)
    expect(results.at(-1)).toEqual({
      id: 2,
      ok: true,
      inventory: [{ id: 'ParamSecond', name: 'ParamSecond', min: -1, max: 1, default: 0 }]
    })
  })
})
