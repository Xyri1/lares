import { beforeEach, describe, expect, it, vi } from 'vitest'

const boundary = vi.hoisted(() => {
  const models = new Map<string, ReturnType<typeof model>>()
  const applications: Array<{ stage: { children: unknown[]; addChild(value: unknown): void } }> = []
  const from = vi.fn(async (source: string | { url?: string }) => {
    const path = typeof source === 'string' ? source : source.url ?? ''
    const found = models.get(path)
    if (!found) throw new Error(`missing fixture ${path}`)
    return found
  })

  function model(path: string, valid = true, fitFails = false, destroyFails = false) {
    const listeners = new Map<string, () => void>()
    return {
      path,
      width: 100,
      height: 200,
      visible: true,
      x: 0,
      y: 0,
      scale: {
        set: vi.fn(() => {
          if (fitFails) throw new Error('candidate fit failed')
        })
      },
      destroy: vi.fn(() => {
        if (destroyFails) throw new Error('old cleanup failed')
      }),
      hitTest: vi.fn(() => []),
      motion: vi.fn(async () => true),
      update: vi.fn(),
      internalModel: {
        breath: {},
        eyeBlink: {},
        on: (event: string, fn: () => void) => listeners.set(event, fn),
        coreModel: {
          _model: {
            parameters: {
              ids: ['Param'],
              minimumValues: [valid ? -1 : 2],
              maximumValues: [1],
              defaultValues: [0],
              count: 1
            }
          },
          setParameterValueByIndex: vi.fn(),
          update: vi.fn()
        },
        motionManager: { definitions: {} }
      }
    }
  }

  return { models, applications, from, model }
})

vi.mock('pixi.js', () => {
  class Application {
    screen = { width: 400, height: 400 }
    stage = {
      children: [] as unknown[],
      addChild: (value: unknown) => {
        this.stage.children.push(value)
      }
    }
    ticker = { add: vi.fn(), maxFPS: 0, deltaMS: 16 }
    renderer = { resolution: 1, gl: {}, resize: vi.fn() }
    resize = vi.fn()
    constructor() {
      boundary.applications.push(this)
    }
  }
  return {
    Application,
    Renderer: class {},
    Ticker: class {},
    UPDATE_PRIORITY: { LOW: 0 }
  }
})

vi.mock('@pixi/unsafe-eval', () => ({ install: vi.fn() }))
vi.mock('pixi-live2d-display/cubism4', () => ({
  Live2DModel: {
    registerTicker: vi.fn(),
    from: boundary.from
  },
  MotionPriority: { NORMAL: 2 }
}))

Object.assign(globalThis, {
  window: {
    devicePixelRatio: 1,
    addEventListener: vi.fn()
  },
  performance: { now: () => 0 }
})

const { Live2DRuntime, prepareModelSource } = await import('./live2d')

const cleanup = { children: true, texture: true, baseTexture: true }

describe('Live2DRuntime character transaction', () => {
  it('scales both the reported Lar bounds and renderer fit ceiling', async () => {
    boundary.models.set('/scaled', boundary.model('/scaled'))
    const runtime = new Live2DRuntime({ parentElement: null } as HTMLCanvasElement)
    await runtime.load('/scaled')

    expect(runtime.larSize()).toEqual({ width: 200, height: 400 })
    runtime.setDisplayScale(1.5)
    expect(runtime.larSize()).toEqual({ width: 300, height: 600 })
  })

  beforeEach(() => {
    boundary.models.clear()
    boundary.applications.length = 0
    boundary.from.mockClear()
  })

  it('accepts Core MOC versions 1–4 and rejects version 5 before pixi revival', async () => {
    const released = vi.fn()
    const core = {
      Moc: { fromArrayBuffer: vi.fn(() => ({ _release: released })) },
      Version: { csmGetMocVersion: vi.fn(() => 1) }
    }
    const response = (value: unknown): Response =>
      (value instanceof ArrayBuffer
        ? { ok: true, arrayBuffer: async () => value }
        : { ok: true, json: async () => value }) as unknown as Response
    const settings = {
      FileReferences: { Moc: 'model.moc3', Textures: ['texture.png'] },
      Groups: [
        { Target: 'Parameter', Name: 'EyeBlink', Ids: ['EyeL', 'EyeR'] }
      ]
    }
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(response(settings))
      .mockResolvedValueOnce(response(new ArrayBuffer(8))))
    for (const version of [1, 2, 3, 4]) {
      core.Version.csmGetMocVersion.mockReturnValueOnce(version)
      if (version > 1) {
        vi.mocked(fetch)
          .mockResolvedValueOnce(response(settings))
          .mockResolvedValueOnce(response(new ArrayBuffer(8)))
      }
      await expect(
        prepareModelSource(
          'lares://candidate/1/runtime/model.model3.json',
          undefined,
          core
        )
      ).resolves.toMatchObject({
        compatibility: {
          mocVersion: version,
          groups: { eyeBlink: ['EyeL', 'EyeR'] }
        }
      })
    }

    core.Version.csmGetMocVersion.mockReturnValueOnce(4)
    vi.mocked(fetch)
      .mockResolvedValueOnce(response({
        ...settings,
        FileReferences: { ...settings.FileReferences, Moc: '../shared.moc3' }
      }))
      .mockResolvedValueOnce(response(new ArrayBuffer(8)))
    await prepareModelSource('lares://characters/nested/model.model3.json', undefined, core)
    expect(fetch).toHaveBeenLastCalledWith('lares://characters/shared.moc3')

    boundary.models.set(
      'lares://candidate/1/runtime/model.model3.json',
      boundary.model('lares://candidate/1/runtime/model.model3.json')
    )
    Object.assign(window, {
      Live2DCubismCore: {
        ...core,
        Version: { csmGetMocVersion: vi.fn(() => 5) }
      }
    })
    vi.mocked(fetch)
      .mockResolvedValueOnce(response(settings))
      .mockResolvedValueOnce(response(new ArrayBuffer(8)))
    const runtime = new Live2DRuntime({ parentElement: null } as HTMLCanvasElement)

    await expect(
      runtime.prepareLoad(1, 'lares://candidate/1/runtime/model.model3.json')
    ).rejects.toThrow('SDK 5.x+')
    expect(boundary.from).not.toHaveBeenCalled()
    expect(released).toHaveBeenCalledTimes(6)
    vi.unstubAllGlobals()
  })

  it('rejects a texture over the live renderer limit before pixi revival', async () => {
    const core = {
      Moc: { fromArrayBuffer: vi.fn(() => ({ _release: vi.fn() })) },
      Version: { csmGetMocVersion: vi.fn(() => 4) }
    }
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          FileReferences: { Moc: 'model.moc3', Textures: ['huge.png'] }
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(8)
      })
      .mockResolvedValueOnce({
        ok: true,
        blob: async () => ({})
      }))
    const close = vi.fn()
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({
      width: 8192,
      height: 1024,
      close
    })))

    await expect(
      prepareModelSource(
        'lares://candidate/1/runtime/model.model3.json',
        undefined,
        core,
        4096
      )
    ).rejects.toThrow('8192×1024')
    expect(boundary.from).not.toHaveBeenCalled()
    expect(close).toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('drops missing optional sidecars and uses the validated physics fallback', async () => {
    const core = {
      Moc: { fromArrayBuffer: vi.fn(() => ({ _release: vi.fn() })) },
      Version: { csmGetMocVersion: vi.fn(() => 4) }
    }
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          FileReferences: {
            Moc: 'model.moc3',
            Textures: ['texture.png'],
            Physics: 'missing.physics3.json',
            Pose: 'missing.pose3.json'
          }
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(8)
      })
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: false }))

    await expect(
      prepareModelSource(
        'lares://candidate/1/runtime/model.model3.json',
        'lares://candidate/1/runtime/fallback.physics3.json',
        core
      )
    ).resolves.toMatchObject({
      source: {
        FileReferences: {
          Physics: 'lares://candidate/1/runtime/fallback.physics3.json'
        }
      }
    })
    vi.unstubAllGlobals()
  })

  it('keeps the old model through tentative commit, then cleans it on finalize', async () => {
    const initial = boundary.model('initial')
    const candidate = boundary.model('candidate')
    boundary.models.set('initial', initial)
    boundary.models.set('candidate', candidate)
    const runtime = new Live2DRuntime({ parentElement: null } as HTMLCanvasElement)

    await runtime.load('initial')
    await expect(runtime.prepareLoad(1, 'candidate')).resolves.toEqual([
      { id: 'Param', name: 'Param', min: -1, max: 1, default: 0 }
    ])
    expect(initial.destroy).not.toHaveBeenCalled()
    expect(boundary.applications[0].stage.children).toEqual([initial])

    expect(runtime.commitLoad(1)).toBe(true)
    expect(boundary.applications[0].stage.children).toEqual([initial, candidate])
    expect(initial.visible).toBe(false)
    expect(initial.destroy).not.toHaveBeenCalled()

    expect(() => runtime.finalizeLoad(1)).not.toThrow()
    expect(initial.destroy).toHaveBeenCalledWith(cleanup)
  })

  it('keeps the new model final when old cleanup throws and a later prepare is cancelled', async () => {
    const initial = boundary.model('initial', true, false, true)
    const candidate = boundary.model('candidate')
    const later = boundary.model('later')
    for (const model of [initial, candidate, later]) boundary.models.set(model.path, model)
    const runtime = new Live2DRuntime({ parentElement: null } as HTMLCanvasElement)
    await runtime.load('initial')

    await runtime.prepareLoad(1, 'candidate')
    expect(runtime.commitLoad(1)).toBe(true)
    expect(() => runtime.finalizeLoad(1)).not.toThrow()

    await runtime.prepareLoad(2, 'later')
    expect(runtime.cancelLoad(2)).toBe(true)
    expect(runtime.rollbackLoad(1)).toBe(false)
    expect(candidate.visible).toBe(true)
    expect(candidate.destroy).not.toHaveBeenCalled()
  })

  it('rolls a tentative commit back to the prior model', async () => {
    const initial = boundary.model('initial')
    const candidate = boundary.model('candidate')
    boundary.models.set('initial', initial)
    boundary.models.set('candidate', candidate)
    const runtime = new Live2DRuntime({ parentElement: null } as HTMLCanvasElement)
    await runtime.load('initial')

    await runtime.prepareLoad(1, 'candidate')
    expect(runtime.commitLoad(1)).toBe(true)
    expect(runtime.rollbackLoad(1)).toBe(true)

    expect(initial.visible).toBe(true)
    expect(initial.destroy).not.toHaveBeenCalled()
    expect(candidate.destroy).toHaveBeenCalledWith(cleanup)
    expect(runtime.parameters()).toEqual([
      { id: 'Param', name: 'Param', min: -1, max: 1, default: 0 }
    ])
  })

  it('rolls back internally when tentative fitting throws after insertion', async () => {
    const initial = boundary.model('initial')
    const candidate = boundary.model('candidate', true, true)
    boundary.models.set('initial', initial)
    boundary.models.set('candidate', candidate)
    const runtime = new Live2DRuntime({ parentElement: null } as HTMLCanvasElement)
    await runtime.load('initial')

    await runtime.prepareLoad(1, 'candidate')
    expect(runtime.commitLoad(1)).toBe(false)

    expect(initial.visible).toBe(true)
    expect(initial.destroy).not.toHaveBeenCalled()
    expect(candidate.destroy).toHaveBeenCalledWith(cleanup)
  })

  it('cancels, supersedes, and rejects post-load preparation without replacing the old model', async () => {
    const initial = boundary.model('initial')
    const cancelled = boundary.model('cancelled')
    const superseded = boundary.model('superseded')
    const latest = boundary.model('latest')
    const invalid = boundary.model('invalid', false)
    for (const model of [initial, cancelled, superseded, latest, invalid]) {
      boundary.models.set(model.path, model)
    }
    const runtime = new Live2DRuntime({ parentElement: null } as HTMLCanvasElement)
    await runtime.load('initial')

    await runtime.prepareLoad(1, 'cancelled')
    expect(runtime.cancelLoad(1)).toBe(true)
    expect(cancelled.destroy).toHaveBeenCalledWith(cleanup)

    await runtime.prepareLoad(2, 'superseded')
    await runtime.prepareLoad(3, 'latest')
    expect(superseded.destroy).toHaveBeenCalledWith(cleanup)
    expect(runtime.commitLoad(2)).toBe(false)

    await expect(runtime.prepareLoad(4, 'invalid')).rejects.toThrow('inventory')
    expect(invalid.destroy).toHaveBeenCalledWith(cleanup)
    expect(initial.destroy).not.toHaveBeenCalled()
    expect(boundary.applications[0].stage.children).toEqual([initial])
  })
})
