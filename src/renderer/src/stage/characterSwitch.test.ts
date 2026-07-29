import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { IRuntime, ParamInfo } from '../runtime/iface'
import {
  createCharacterLoadHandler,
  parseCharacterPrepareRequest
} from './characterSwitch'

const failure = JSON.parse(
  readFileSync(join(__dirname, '..', 'runtime', 'fixtures', 'load-failure.json'), 'utf8')
) as { error: string }

class FixtureRuntime
  implements Pick<IRuntime, 'prepareLoad' | 'commitLoad' | 'cancelLoad' | 'parameters'>
{
  visible = 'first'
  prepared: { id: number; model: string } | null = null
  cancelled: number[] = []
  private inventory: ParamInfo[] = [
    { id: 'ParamFirst', name: 'ParamFirst', min: -1, max: 1, default: 0 }
  ]

  async prepareLoad(id: number, modelPath: string): Promise<ParamInfo[]> {
    if (modelPath.endsWith('/failure.model3.json')) throw new Error(failure.error)
    this.prepared = { id, model: modelPath }
    this.inventory = [
      { id: 'ParamSecond', name: 'ParamSecond', min: -1, max: 1, default: 0 }
    ]
    return this.inventory
  }

  commitLoad(id: number): boolean {
    if (this.prepared?.id !== id) return false
    this.visible = this.prepared.model
    this.prepared = null
    return true
  }

  cancelLoad(id: number): boolean {
    if (this.prepared?.id !== id) return false
    this.prepared = null
    this.cancelled.push(id)
    return true
  }

  parameters(): ParamInfo[] {
    return this.inventory
  }
}

describe('body character load handshake', () => {
  it('accepts only matching candidate URLs and exclusive cue variants', () => {
    const request = (model: string, cue: Record<string, unknown>) => ({
      id: 7,
      character: { ok: true, name: 'Candidate', live2d: { model } },
      cues: [{ name: 'cue', valence: 0, arousal: 0, ...cue }]
    })
    expect(
      parseCharacterPrepareRequest(
        request('lares://candidate/7/runtime/model.model3.json', {
          motion: 'lares://candidate/7/runtime/wave.motion3.json'
        })
      )
    ).not.toBeNull()
    for (const invalid of [
      request('file:///tmp/model.model3.json', { params: { Param: 1 } }),
      request('http://localhost/model.model3.json', { params: { Param: 1 } }),
      request('lares://candidate/8/runtime/model.model3.json', { params: { Param: 1 } }),
      request('lares://candidate/7/%2e%2e/model.model3.json', { params: { Param: 1 } }),
      request('lares://candidate/7/runtime/model.model3.json', {}),
      request('lares://candidate/7/runtime/model.model3.json', {
        params: { Param: 1 },
        motion: 'lares://candidate/7/runtime/wave.motion3.json'
      }),
      request('lares://candidate/7/runtime/model.model3.json', {
        motion: 'lares://candidate/8/runtime/wave.motion3.json'
      })
    ]) {
      expect(parseCharacterPrepareRequest(invalid)).toBeNull()
    }
  })

  it('publishes new cues and clears playback only after model load succeeds', async () => {
    const runtime = new FixtureRuntime()
    const cueParams = { First: { ParamFirst: 1 } }
    const cueMotions = { Wave: 'Idle:0' }
    let resets = 0
    const results: unknown[] = []
    const handler = createCharacterLoadHandler(
      () => [runtime],
      { characterChanged: () => resets++ },
      cueParams,
      cueMotions,
      (result) => results.push(result)
    )

    await handler.prepare({
      id: 1,
      character: {
        ok: true,
        name: 'Broken',
        live2d: { model: 'lares://candidate/1/runtime/failure.model3.json' }
      },
      cues: [{ name: 'Broken', valence: 0, arousal: 0, params: { ParamBroken: 1 } }]
    })
    expect(runtime.visible).toBe('first')
    expect(cueParams).toEqual({ First: { ParamFirst: 1 } })
    expect(cueMotions).toEqual({ Wave: 'Idle:0' })
    expect(resets).toBe(0)
    expect(results).toEqual([{ id: 1, ok: false, error: failure.error }])

    await handler.prepare({
      id: 2,
      character: {
        ok: true,
        name: 'Second',
        live2d: { model: 'lares://candidate/2/runtime/second.model3.json' }
      },
      cues: [
        { name: 'Second', valence: 0.2, arousal: 0.3, params: { ParamSecond: 1 } },
        {
          name: 'Motion',
          valence: null,
          arousal: null,
          motion: 'lares://candidate/2/runtime/wave.motion3.json'
        }
      ]
    })
    expect(runtime.visible).toBe('first')
    expect(cueParams).toEqual({ First: { ParamFirst: 1 } })
    expect(resets).toBe(0)
    expect(results.at(-1)).toEqual({
      id: 2,
      ok: true,
      inventory: [{ id: 'ParamSecond', name: 'ParamSecond', min: -1, max: 1, default: 0 }]
    })

    expect(
      handler.commit({
        id: 2,
        cues: [
          { name: 'Second', params: { ParamSecond: 1 } },
          { name: 'Expression', params: { ParamSecond: 0.5 } },
          {
            name: 'Motion',
            motion: 'lares://candidate/2/runtime/wave.motion3.json'
          }
        ]
      })
    ).toBe(true)
    expect(runtime.visible).toBe('lares://candidate/2/runtime/second.model3.json')
    expect(cueParams).toEqual({
      Second: { ParamSecond: 1 },
      Expression: { ParamSecond: 0.5 }
    })
    expect(cueMotions).toEqual({
      Motion: 'lares://candidate/2/runtime/wave.motion3.json'
    })
    expect(resets).toBe(1)
  })

  it('prepares and commits every registered feed-consuming runtime together', async () => {
    const a = new FixtureRuntime()
    const b = new FixtureRuntime()
    const results: unknown[] = []
    const handler = createCharacterLoadHandler(
      () => [a, b],
      { characterChanged: () => {} },
      {},
      {},
      (result) => results.push(result)
    )
    const request = {
      id: 3,
      character: {
        ok: true as const,
        name: 'Second',
        live2d: { model: 'lares://candidate/3/runtime/second.model3.json' }
      },
      cues: [{ name: 'Second', valence: 0, arousal: 0, params: { ParamSecond: 1 } }]
    }

    await handler.prepare(request)
    expect([a.visible, b.visible]).toEqual(['first', 'first'])
    expect(results.at(-1)).toMatchObject({ id: 3, ok: true })
    expect(handler.commit({ id: 3, cues: request.cues })).toBe(true)
    expect([a.visible, b.visible]).toEqual([
      'lares://candidate/3/runtime/second.model3.json',
      'lares://candidate/3/runtime/second.model3.json'
    ])
  })

  it('cancels prepared runtimes when post-load cue preparation fails', async () => {
    const runtime = new FixtureRuntime()
    const results: unknown[] = []
    const handler = createCharacterLoadHandler(
      () => [runtime],
      { characterChanged: () => {} },
      { First: { ParamFirst: 1 } },
      {},
      (result) => results.push(result)
    )

    await handler.prepare({
      id: 4,
      character: {
        ok: true,
        name: 'Broken',
        live2d: { model: 'lares://candidate/4/runtime/broken.model3.json' }
      },
      cues: [{ name: 'Broken', valence: 0, arousal: 0, params: { Missing: 1 } }]
    })

    expect(runtime.visible).toBe('first')
    expect(runtime.cancelled).toEqual([4])
    expect(results.at(-1)).toEqual({
      id: 4,
      ok: false,
      error: 'Cue "Broken": unknown parameter "Missing"'
    })
  })

  it('waits for and discards every candidate when one runtime fails early', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const delayed = new FixtureRuntime()
    let delayedFinished!: Promise<ParamInfo[]>
    const originalPrepare = delayed.prepareLoad.bind(delayed)
    delayed.prepareLoad = (_id, model) => {
      delayedFinished = gate.then(() => originalPrepare(5, model))
      return delayedFinished
    }
    const failed = new FixtureRuntime()
    failed.prepareLoad = async () => {
      throw new Error('stage A rejected candidate')
    }
    const results: unknown[] = []
    const handler = createCharacterLoadHandler(
      () => [failed, delayed],
      { characterChanged: () => {} },
      {},
      {},
      (result) => results.push(result)
    )

    const preparation = handler.prepare({
      id: 5,
      character: {
        ok: true,
        name: 'Second',
        live2d: { model: 'lares://candidate/5/runtime/second.model3.json' }
      },
      cues: [{ name: 'Second', params: { ParamSecond: 1 } }]
    })
    await Promise.resolve()
    release()
    await preparation
    await delayedFinished

    expect(delayed.prepared).toBeNull()
    expect(delayed.cancelled).toEqual([5])
    expect(results.at(-1)).toEqual({
      id: 5,
      ok: false,
      error: 'stage A rejected candidate'
    })
  })
})
