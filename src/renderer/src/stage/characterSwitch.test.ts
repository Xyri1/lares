import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { IRuntime, ParamInfo } from '../runtime/iface'
import {
  createCharacterLoadHandler,
  parseCharacterPrepareRequest
} from './characterSwitch'

const failure = JSON.parse(
  readFileSync(join(__dirname, '..', 'runtime', 'fixtures', 'load-failure.json'), 'utf8')
) as { error: string }

class FixtureRuntime
  implements
    Pick<
      IRuntime,
      | 'prepareLoad'
      | 'commitLoad'
      | 'rollbackLoad'
      | 'finalizeLoad'
      | 'cancelLoad'
      | 'parameters'
    >
{
  visible = 'first'
  prepared: { id: number; model: string } | null = null
  tentative: { id: number; previous: string } | null = null
  cancelled: number[] = []
  finalized: number[] = []
  private inventory: ParamInfo[] = [
    { id: 'ParamFirst', name: 'ParamFirst', min: -1, max: 1, default: 0 }
  ]

  async prepareLoad(id: number, modelPath: string): Promise<ParamInfo[]> {
    if (modelPath.endsWith('/failure.model3.json')) throw new Error(failure.error)
    this.prepared = { id, model: modelPath }
    return [
      { id: 'ParamSecond', name: 'ParamSecond', min: -1, max: 1, default: 0 }
    ]
  }

  commitLoad(id: number): boolean {
    if (this.prepared?.id !== id) return false
    this.tentative = { id, previous: this.visible }
    this.visible = this.prepared.model
    this.prepared = null
    this.inventory = [
      { id: 'ParamSecond', name: 'ParamSecond', min: -1, max: 1, default: 0 }
    ]
    return true
  }

  rollbackLoad(id: number): boolean {
    if (this.tentative?.id !== id) return false
    this.visible = this.tentative.previous
    this.tentative = null
    this.inventory = [
      { id: 'ParamFirst', name: 'ParamFirst', min: -1, max: 1, default: 0 }
    ]
    return true
  }

  finalizeLoad(id: number): boolean {
    if (this.tentative?.id !== id) return false
    this.tentative = null
    this.finalized.push(id)
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
  it('accepts only matching candidate URLs', () => {
    const request = (model: string) => ({
      id: 7,
      character: { ok: true, name: 'Candidate', live2d: { model } }
    })
    expect(
      parseCharacterPrepareRequest(request('lares://candidate/7/runtime/model.model3.json'))
    ).not.toBeNull()
    for (const invalid of [
      request('file:///tmp/model.model3.json'),
      request('http://localhost/model.model3.json'),
      request('lares://candidate/8/runtime/model.model3.json'),
      request('lares://candidate/7/%2e%2e/model.model3.json')
    ]) {
      expect(parseCharacterPrepareRequest(invalid)).toBeNull()
    }
  })

  it('accepts a valid choreography block and rejects malformed ones', () => {
    const base = (choreography?: unknown) => ({
      id: 7,
      character: {
        ok: true,
        name: 'Candidate',
        live2d: {
          model: 'lares://candidate/7/runtime/model.model3.json',
          ...(choreography !== undefined ? { choreography } : {})
        }
      }
    })
    expect(parseCharacterPrepareRequest(base())).not.toBeNull()
    expect(
      parseCharacterPrepareRequest(
        base({
          fallback: { group: 'Idle', index: 1 },
          anchors: { '+++': { group: 'Tap', index: 0 } }
        })
      )
    ).not.toBeNull()
    for (const invalid of [
      { anchors: { '+++': { group: 'Tap', index: 0 } } }, // missing fallback
      { fallback: { group: 'Idle', index: 1 }, extra: true }, // unknown top-level key
      { fallback: { group: 'Idle' } }, // missing index
      { fallback: { group: 'Idle', index: -1 } }, // negative index
      { fallback: { group: '', index: 0 } }, // empty group
      { fallback: { group: 'Idle', index: 1.5 } }, // non-integer index
      { fallback: { group: 'Idle', index: 1 }, anchors: { neutral: { group: 'Idle', index: 0 } } }, // not a corner key
      { fallback: { group: 'Idle', index: 1 }, anchors: { '+++': { group: 'Tap', index: 0, extra: 1 } } }
    ]) {
      expect(parseCharacterPrepareRequest(base(invalid))).toBeNull()
    }
  })

  it('commits playback only after model load succeeds', async () => {
    const runtime = new FixtureRuntime()
    let resets = 0
    const results: unknown[] = []
    const commits: unknown[] = []
    const handler = createCharacterLoadHandler(
      runtime,
      {
        characterChanged: () => {
          resets++
        }
      },
      (result) => results.push(result),
      (result) => commits.push(result),
      () => {
        throw new Error('window fit failed after finalization')
      }
    )

    await handler.prepare({
      id: 1,
      character: {
        ok: true,
        name: 'Broken',
        live2d: { model: 'lares://candidate/1/runtime/failure.model3.json' }
      }
    })
    expect(runtime.visible).toBe('first')
    expect(resets).toBe(0)
    expect(results).toEqual([{ id: 1, ok: false, error: failure.error }])

    await handler.prepare({
      id: 2,
      character: {
        ok: true,
        name: 'Second',
        live2d: { model: 'lares://candidate/2/runtime/second.model3.json' }
      }
    })
    expect(runtime.visible).toBe('first')
    expect(resets).toBe(0)
    expect(results.at(-1)).toEqual({
      id: 2,
      ok: true,
      inventory: [{ id: 'ParamSecond', name: 'ParamSecond', min: -1, max: 1, default: 0 }]
    })

    handler.commit({ id: 2 })
    expect(commits).toEqual([{ id: 2, ok: true }])
    expect(runtime.visible).toBe('lares://candidate/2/runtime/second.model3.json')
    expect(resets).toBe(1)
    expect(runtime.finalized).toEqual([])
    expect(() => handler.finalize(2)).not.toThrow()
    expect(runtime.finalized).toEqual([2])
  })

  it('rolls back the tentative model when main rejects publication', async () => {
    const runtime = new FixtureRuntime()
    let driverRollbacks = 0
    const handler = createCharacterLoadHandler(
      runtime,
      {
        characterChanged: () => () => {
          driverRollbacks++
        }
      },
      () => {},
      () => {}
    )
    const request = {
      id: 3,
      character: {
        ok: true as const,
        name: 'Second',
        live2d: { model: 'lares://candidate/3/runtime/second.model3.json' }
      }
    }

    await handler.prepare(request)
    handler.commit({ id: 3 })
    expect(runtime.visible).toBe('lares://candidate/3/runtime/second.model3.json')

    expect(handler.rollback(3)).toBe(true)
    expect(runtime.visible).toBe('first')
    expect(driverRollbacks).toBe(1)
  })

  it('reports commit failure and restores old state when body work throws after swap', async () => {
    const runtime = new FixtureRuntime()
    const commits: unknown[] = []
    const handler = createCharacterLoadHandler(
      runtime,
      {
        characterChanged: () => {
          throw new Error('driver refresh failed')
        }
      },
      () => {},
      (result) => commits.push(result)
    )

    await handler.prepare({
      id: 5,
      character: {
        ok: true,
        name: 'Second',
        live2d: { model: 'lares://candidate/5/runtime/second.model3.json' }
      }
    })
    handler.commit({ id: 5 })

    expect(commits).toEqual([{ id: 5, ok: false, error: 'driver refresh failed' }])
    expect(runtime.visible).toBe('first')
  })

  it('finalizes a tentative body when the finalize fast path is lost but main committed', async () => {
    vi.useFakeTimers()
    try {
      const runtime = new FixtureRuntime()
      const getDecision = vi.fn(async () => 'commit')
      const handler = createCharacterLoadHandler(
        runtime,
        { characterChanged: () => () => {} },
        () => {},
        () => {},
        undefined,
        getDecision,
        50
      )
      await handler.prepare({
        id: 6,
        character: {
          ok: true,
          name: 'Second',
          live2d: { model: 'lares://candidate/6/runtime/second.model3.json' }
        }
      })
      handler.commit({ id: 6 })
      expect(runtime.visible).toBe('lares://candidate/6/runtime/second.model3.json')

      await vi.advanceTimersByTimeAsync(50)

      expect(getDecision).toHaveBeenCalledWith(6)
      expect(runtime.visible).toBe('lares://candidate/6/runtime/second.model3.json')
      expect(runtime.finalized).toEqual([6])
    } finally {
      vi.useRealTimers()
    }
  })

  it('restores a tentative body when rollback delivery is lost and main rolled back', async () => {
    vi.useFakeTimers()
    try {
      const runtime = new FixtureRuntime()
      const getDecision = vi.fn(async () => 'rollback')
      const handler = createCharacterLoadHandler(
        runtime,
        { characterChanged: () => () => {} },
        () => {},
        () => {},
        undefined,
        getDecision,
        50
      )
      await handler.prepare({
        id: 7,
        character: {
          ok: true,
          name: 'Second',
          live2d: { model: 'lares://candidate/7/runtime/second.model3.json' }
        }
      })
      handler.commit({ id: 7 })

      await vi.advanceTimersByTimeAsync(50)

      expect(getDecision).toHaveBeenCalledWith(7)
      expect(runtime.visible).toBe('first')
    } finally {
      vi.useRealTimers()
    }
  })

  it.each([
    ['commit', 'lares://candidate/1/runtime/second.model3.json'],
    ['rollback', 'first']
  ] as const)(
    'reconciles a lost predecessor %s before a failing superseding prepare',
    async (decision, expectedVisible) => {
      const runtime = new FixtureRuntime()
      const results: unknown[] = []
      const handler = createCharacterLoadHandler(
        runtime,
        { characterChanged: () => () => {} },
        (result) => results.push(result),
        () => {},
        undefined,
        async (id) => (id === 1 ? decision : null),
        50
      )
      await handler.prepare({
        id: 1,
        character: {
          ok: true,
          name: 'Second',
          live2d: { model: 'lares://candidate/1/runtime/second.model3.json' }
        }
      })
      handler.commit({ id: 1 })

      await handler.prepare({
        id: 2,
        character: {
          ok: true,
          name: 'Broken',
          live2d: { model: 'lares://candidate/2/runtime/failure.model3.json' }
        }
      })

      expect(runtime.visible).toBe(expectedVisible)
      expect(results.at(-1)).toEqual({ id: 2, ok: false, error: failure.error })
    }
  )

  it('keeps a tentative predecessor intact when its decision is unavailable', async () => {
    const runtime = new FixtureRuntime()
    const results: unknown[] = []
    const handler = createCharacterLoadHandler(
      runtime,
      { characterChanged: () => () => {} },
      (result) => results.push(result),
      () => {},
      undefined,
      async () => null,
      50
    )
    await handler.prepare({
      id: 1,
      character: {
        ok: true,
        name: 'Second',
        live2d: { model: 'lares://candidate/1/runtime/second.model3.json' }
      }
    })
    handler.commit({ id: 1 })

    await handler.prepare({
      id: 2,
      character: {
        ok: true,
        name: 'Third',
        live2d: { model: 'lares://candidate/2/runtime/third.model3.json' }
      }
    })

    expect(runtime.visible).toBe('lares://candidate/1/runtime/second.model3.json')
    expect(runtime.tentative?.id).toBe(1)
    expect(results.at(-1)).toEqual({
      id: 2,
      ok: false,
      error: 'previous character switch decision is unavailable'
    })
  })

  it('reports a rejected predecessor decision without disturbing its watchdog', async () => {
    const runtime = new FixtureRuntime()
    const results: unknown[] = []
    const handler = createCharacterLoadHandler(
      runtime,
      { characterChanged: () => () => {} },
      (result) => results.push(result),
      () => {},
      undefined,
      async () => {
        throw new Error('main frame changed')
      },
      50
    )
    await handler.prepare({
      id: 1,
      character: {
        ok: true,
        name: 'Second',
        live2d: { model: 'lares://candidate/1/runtime/second.model3.json' }
      }
    })
    handler.commit({ id: 1 })

    await handler.prepare({
      id: 2,
      character: {
        ok: true,
        name: 'Third',
        live2d: { model: 'lares://candidate/2/runtime/third.model3.json' }
      }
    })

    expect(runtime.visible).toBe('lares://candidate/1/runtime/second.model3.json')
    expect(runtime.tentative?.id).toBe(1)
    expect(results.at(-1)).toEqual({
      id: 2,
      ok: false,
      error: 'previous character switch decision failed: main frame changed'
    })
  })

  it('lets only the newest concurrent prepare continue after predecessor reconciliation', async () => {
    const runtime = new FixtureRuntime()
    const results: unknown[] = []
    const decisions: Array<(value: unknown) => void> = []
    const handler = createCharacterLoadHandler(
      runtime,
      { characterChanged: () => () => {} },
      (result) => results.push(result),
      () => {},
      undefined,
      async () => new Promise((resolve) => decisions.push(resolve)),
      50
    )
    await handler.prepare({
      id: 1,
      character: {
        ok: true,
        name: 'Second',
        live2d: { model: 'lares://candidate/1/runtime/second.model3.json' }
      }
    })
    handler.commit({ id: 1 })

    const second = handler.prepare({
      id: 2,
      character: {
        ok: true,
        name: 'Third',
        live2d: { model: 'lares://candidate/2/runtime/third.model3.json' }
      }
    })
    const third = handler.prepare({
      id: 3,
      character: {
        ok: true,
        name: 'Fourth',
        live2d: { model: 'lares://candidate/3/runtime/fourth.model3.json' }
      }
    })
    await vi.waitFor(() => expect(decisions).toHaveLength(2))
    decisions[0]('commit')
    await second
    decisions[1]('commit')
    await third

    expect(runtime.finalized).toEqual([1])
    expect(runtime.prepared?.id).toBe(3)
    expect(results.some((result) => (result as { id?: number }).id === 2)).toBe(false)
    expect(results.at(-1)).toMatchObject({ id: 3, ok: true })
  })

  it('retries a transient decision rejection without an unhandled promise', async () => {
    vi.useFakeTimers()
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    try {
      const runtime = new FixtureRuntime()
      const getDecision = vi
        .fn<(id: number) => Promise<unknown>>()
        .mockRejectedValueOnce(new Error('main frame changed'))
        .mockResolvedValue('commit')
      const handler = createCharacterLoadHandler(
        runtime,
        { characterChanged: () => () => {} },
        () => {},
        () => {},
        undefined,
        getDecision,
        50
      )
      await handler.prepare({
        id: 8,
        character: {
          ok: true,
          name: 'Second',
          live2d: { model: 'lares://candidate/8/runtime/second.model3.json' }
        }
      })
      handler.commit({ id: 8 })

      await vi.advanceTimersByTimeAsync(100)

      expect(getDecision).toHaveBeenCalledTimes(2)
      expect(unhandled).not.toHaveBeenCalled()
      expect(runtime.visible).toBe('lares://candidate/8/runtime/second.model3.json')
      expect(runtime.finalized).toEqual([8])
    } finally {
      process.off('unhandledRejection', unhandled)
      vi.useRealTimers()
    }
  })

  it('makes matching finalize one-way and cancels its rollback watchdog', async () => {
    vi.useFakeTimers()
    try {
      const runtime = new FixtureRuntime()
      runtime.finalizeLoad = () => {
        throw new Error('old cleanup failed')
      }
      let finalizedDriver = 0
      const handler = createCharacterLoadHandler(
        runtime,
        {
          characterChanged: () => ({
            rollback: () => {},
            finalize: () => {
              finalizedDriver++
            }
          })
        },
        () => {},
        () => {},
        undefined,
        async () => null,
        50
      )
      await handler.prepare({
        id: 7,
        character: {
          ok: true,
          name: 'Second',
          live2d: { model: 'lares://candidate/7/runtime/second.model3.json' }
        }
      })
      handler.commit({ id: 7 })

      expect(() => handler.finalize(7)).not.toThrow()
      expect(handler.finalize(7)).toBe(false)
      expect(handler.rollback(7)).toBe(false)
      expect(finalizedDriver).toBe(1)
      await vi.advanceTimersByTimeAsync(50)
      expect(runtime.visible).toBe('lares://candidate/7/runtime/second.model3.json')
    } finally {
      vi.useRealTimers()
    }
  })

  it('cancels the rollback watchdog when main explicitly rolls back', async () => {
    vi.useFakeTimers()
    try {
      const runtime = new FixtureRuntime()
      const rollback = vi.spyOn(runtime, 'rollbackLoad')
      const handler = createCharacterLoadHandler(
        runtime,
        { characterChanged: () => () => {} },
        () => {},
        () => {},
        undefined,
        async () => null,
        50
      )
      await handler.prepare({
        id: 8,
        character: {
          ok: true,
          name: 'Second',
          live2d: { model: 'lares://candidate/8/runtime/second.model3.json' }
        }
      })
      handler.commit({ id: 8 })

      expect(handler.rollback(8)).toBe(true)
      expect(handler.finalize(8)).toBe(false)
      await vi.advanceTimersByTimeAsync(50)
      expect(rollback).toHaveBeenCalledTimes(1)
      expect(runtime.visible).toBe('first')
    } finally {
      vi.useRealTimers()
    }
  })
})
