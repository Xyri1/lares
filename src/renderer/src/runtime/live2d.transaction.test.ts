import { beforeEach, describe, expect, it, vi } from 'vitest'

const boundary = vi.hoisted(() => {
  const models = new Map<string, ReturnType<typeof model>>()
  const applications: Array<{ stage: { children: unknown[]; addChild(value: unknown): void } }> = []

  function model(path: string, valid = true) {
    const listeners = new Map<string, () => void>()
    return {
      path,
      width: 100,
      height: 200,
      visible: true,
      x: 0,
      y: 0,
      scale: { set: vi.fn() },
      destroy: vi.fn(),
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

  return { models, applications, model }
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
    from: vi.fn(async (path: string) => {
      const found = boundary.models.get(path)
      if (!found) throw new Error(`missing fixture ${path}`)
      return found
    })
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

const { Live2DRuntime } = await import('./live2d')

const cleanup = { children: true, texture: true, baseTexture: true }

describe('Live2DRuntime character transaction', () => {
  beforeEach(() => {
    boundary.models.clear()
    boundary.applications.length = 0
  })

  it('keeps the old model visible through prepare, then cleans it on commit', async () => {
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
    expect(initial.destroy).toHaveBeenCalledWith(cleanup)
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
