// Slice 014 I2 gate: managed phrases — ownership order, interruption,
// watchdog, and settlement from actual live values (SPEC §§5–7).
import { beforeEach, describe, expect, it, vi } from 'vitest'

const boundary = vi.hoisted(() => {
  // Inventory: FACE is feel-owned, BODY is a wired body channel, ARM is an
  // unwired motion-driven parameter. Defaults 0, range [-2, 2]. One Part.
  const state = {
    values: [0, 0, 0],
    opacities: [1],
    playing: false,
    startResult: true,
    stopThrows: false,
    duration: 2,
    loop: true,
    fadeIn: 2,
    fadeOut: 2,
    startGate: null as Promise<void> | null,
    startSideEffect: null as (() => void) | null,
    lastUpdateDt: 0,
    // Simulated authored curves, run inside model.update before the hook.
    motionScript: null as (() => void) | null,
    listeners: new Map<string, () => void>(),
    manager: null as Record<string, unknown> | null
  }

  const manager = {
    definitions: { A: [{}], B: [{}] },
    playing: false,
    groups: { idle: 'Idle' },
    startMotion: vi.fn(async () => {
      if (state.startGate) await state.startGate
      if (state.startResult) {
        state.playing = true
        state.startSideEffect?.()
      }
      return state.startResult
    }),
    stopAllMotions: vi.fn(() => {
      if (state.stopThrows) throw new Error('stop failed')
      state.playing = false
    }),
    motionGroups: {
      // Both motions author ARM and FACE (plus a Part curve, which the
      // displacement pass must ignore); BODY is deliberately unauthored.
      A: [
        {
          getDuration: (): number => state.duration,
          isLoop: (): boolean => state.loop,
          setIsLoop: vi.fn((loop: boolean) => {
            state.loop = loop
          }),
          getFadeInTime: (): number => state.fadeIn,
          setFadeInTime: vi.fn((seconds: number) => {
            state.fadeIn = seconds
          }),
          getFadeOutTime: (): number => state.fadeOut,
          setFadeOutTime: vi.fn((seconds: number) => {
            state.fadeOut = seconds
          }),
          _motionData: {
            curves: [
              { type: 1, id: 'ARM' },
              { type: 1, id: 'FACE' },
              { type: 2, id: 'PartArmA' }
            ]
          }
        }
      ],
      B: [
        {
          getDuration: (): number => state.duration,
          _motionData: { curves: [{ type: 1, id: 'ARM' }] }
        }
      ]
    }
  }
  Object.defineProperty(manager, 'playing', { get: () => state.playing })
  state.manager = manager

  const model = {
    width: 100,
    height: 200,
    visible: true,
    x: 0,
    y: 0,
    scale: { set: vi.fn() },
    destroy: vi.fn(),
    update: vi.fn((dt: number) => {
      state.lastUpdateDt = dt
      if (state.playing) state.motionScript?.()
      state.listeners.get('afterMotionUpdate')?.()
    }),
    internalModel: {
      breath: {},
      eyeBlink: {},
      on: (event: string, fn: () => void) => state.listeners.set(event, fn),
      coreModel: {
        _model: {
          parameters: {
            ids: ['FACE', 'BODY', 'ARM'],
            minimumValues: [-2, -2, -2],
            maximumValues: [2, 2, 2],
            defaultValues: [0, 0, 0],
            values: state.values,
            count: 3
          },
          parts: { ids: ['PartArmA'], opacities: state.opacities, count: 1 }
        },
        setParameterValueByIndex: (i: number, v: number, w = 1) => {
          state.values[i] = state.values[i] * (1 - w) + v * w
        },
        setPartOpacityByIndex: (i: number, v: number) => {
          state.opacities[i] = v
        },
        update: vi.fn()
      },
      motionManager: manager
    }
  }

  const tickers: Array<{ fn: () => void; ctx: unknown; deltaMS: number }> = []
  return { state, manager, model, tickers }
})

vi.mock('pixi.js', () => {
  class Application {
    screen = { width: 400, height: 400 }
    stage = { children: [] as unknown[], addChild: vi.fn() }
    ticker = {
      add: (fn: () => void, ctx: unknown) => {
        boundary.tickers.push({ fn, ctx, deltaMS: 16 })
      },
      maxFPS: 0,
      deltaMS: 16
    }
    renderer = { resolution: 1, gl: {}, resize: vi.fn() }
    resize = vi.fn()
    constructor() {
      this.ticker.add = this.ticker.add.bind(this)
      boundary.tickers.length = 0
      const push = boundary.tickers
      this.ticker.add = (fn: () => void, ctx: unknown) => {
        push.push({ fn, ctx, deltaMS: 16 })
      }
      Object.defineProperty(this.ticker, 'deltaMS', {
        get: () => (push[0] ? push[0].deltaMS : 16)
      })
    }
  }
  return { Application, Renderer: class {}, Ticker: class {}, UPDATE_PRIORITY: { LOW: 0 } }
})
vi.mock('@pixi/unsafe-eval', () => ({ install: vi.fn() }))
vi.mock('pixi-live2d-display/cubism4', () => ({
  Live2DModel: { registerTicker: vi.fn(), from: vi.fn(async () => boundary.model) },
  MotionPriority: { NORMAL: 2, FORCE: 3 }
}))

Object.assign(globalThis, {
  window: { devicePixelRatio: 1, addEventListener: vi.fn() },
  performance: { now: () => 0 }
})

const { Live2DRuntime } = await import('./live2d')

const FACE = 0
const BODY = 1
const ARM = 2

function tick(dtMs: number): void {
  const entry = boundary.tickers[0]
  entry.deltaMS = dtMs
  entry.fn.call(entry.ctx)
}

async function loaded(): Promise<InstanceType<typeof Live2DRuntime>> {
  const runtime = new Live2DRuntime({ parentElement: null } as HTMLCanvasElement)
  await runtime.load('/model', undefined, true)
  return runtime
}

beforeEach(() => {
  boundary.state.values.fill(0)
  boundary.state.opacities[0] = 1
  boundary.state.playing = false
  boundary.state.startResult = true
  boundary.state.stopThrows = false
  boundary.state.duration = 2
  boundary.state.loop = true
  boundary.state.fadeIn = 2
  boundary.state.fadeOut = 2
  boundary.state.startGate = null
  boundary.state.startSideEffect = null
  boundary.state.motionScript = null
  boundary.manager.groups.idle = 'Idle'
  boundary.manager.startMotion.mockClear()
  boundary.manager.stopAllMotions.mockClear()
  boundary.manager.motionGroups.A[0].setIsLoop.mockClear()
})

describe('managed choreography playback', () => {
  it('suppresses random idle for a choreographed body at load', async () => {
    await loaded()
    expect(boundary.manager.groups.idle).toBe('')
  })

  it('turns an asset loop off so managed playback is one authored cycle', async () => {
    const runtime = await loaded()
    const done = runtime.playManagedMotion({
      group: 'A',
      index: 0,
      displacement: 1,
      tempo: 1,
      faceParamIds: []
    })
    await Promise.resolve()

    expect(boundary.manager.motionGroups.A[0].setIsLoop).toHaveBeenCalledWith(false)
    expect(boundary.state.loop).toBe(false)
    expect(boundary.state.fadeIn).toBe(0.5)
    expect(boundary.state.fadeOut).toBe(0.5)
    boundary.state.playing = false
    tick(16)
    await expect(done).resolves.toBe(true)
    expect(boundary.state.loop).toBe(true)
    expect(boundary.state.fadeIn).toBe(2)
    expect(boundary.state.fadeOut).toBe(2)
  })

  it('lets the motion own the body, the feel target own the face, and settles completion from live values', async () => {
    const runtime = await loaded()
    runtime.setParams({ FACE: 0.8, BODY: 0.4 })
    boundary.state.motionScript = () => {
      boundary.state.values[ARM] = 1
      boundary.state.values[FACE] = 1
    }
    const done = runtime.playManagedMotion({
      group: 'A',
      index: 0,
      displacement: 0.75,
      tempo: 1,
      faceParamIds: ['FACE']
    })
    await Promise.resolve()

    tick(16)
    // Displacement scales the motion's deviation; the face write wins last.
    expect(boundary.state.values[ARM]).toBeCloseTo(0.75, 10)
    expect(boundary.state.values[FACE]).toBeCloseTo(0.8, 10)
    // The motion owns BODY: the sticky override must not land mid-phrase.
    expect(boundary.state.values[BODY]).toBeCloseTo(0, 10)

    // Natural finish: motion stops writing; settle eases BODY to its target
    // and persists ARM (the settled organization) — no snap, no rig neutral.
    boundary.state.playing = false
    boundary.state.motionScript = null
    tick(16) // finish detected, settle begins from actual values
    await expect(done).resolves.toBe(true)
    tick(350)
    tick(16) // the settle clock advances post-frame; this frame writes ~w(0.5)
    const mid = boundary.state.values[BODY]
    expect(mid).toBeGreaterThan(0)
    expect(mid).toBeLessThan(0.4)
    expect(boundary.state.values[ARM]).toBeCloseTo(0.75, 10)
    tick(400)
    tick(16)
    tick(16)
    expect(boundary.state.values[BODY]).toBeCloseTo(0.4, 10)
    expect(boundary.state.values[ARM]).toBeCloseTo(0.75, 10)
    expect(boundary.state.opacities[0]).toBe(1)
  })

  it('cancellation settles Parts and unwired parameters back to defaults without a snap', async () => {
    const runtime = await loaded()
    boundary.state.motionScript = () => {
      boundary.state.values[ARM] = 1
      boundary.state.opacities[0] = 0
    }
    const done = runtime.playManagedMotion({
      group: 'A',
      index: 0,
      displacement: 1,
      tempo: 1,
      faceParamIds: []
    })
    await Promise.resolve()
    tick(16)
    expect(boundary.state.opacities[0]).toBe(0)

    runtime.cancelManagedMotion()
    expect(boundary.manager.stopAllMotions).toHaveBeenCalled()
    expect(boundary.state.loop).toBe(true)
    await expect(done).resolves.toBe(false)
    tick(350)
    tick(16) // the settle clock advances post-frame; this frame writes ~w(0.5)
    expect(boundary.state.opacities[0]).toBeGreaterThan(0)
    expect(boundary.state.opacities[0]).toBeLessThan(1)
    expect(boundary.state.values[ARM]).toBeGreaterThan(0)
    expect(boundary.state.values[ARM]).toBeLessThan(1)
    tick(400)
    tick(16)
    expect(boundary.state.opacities[0]).toBeCloseTo(1, 10)
    expect(boundary.state.values[ARM]).toBeCloseTo(0, 10)
  })

  it('force-stops a suppressed finish once, at duration/tempo plus the fixed grace', async () => {
    const runtime = await loaded()
    const done = runtime.playManagedMotion({
      group: 'A',
      index: 0,
      displacement: 1,
      tempo: 2,
      faceParamIds: []
    })
    await Promise.resolve()
    // duration 2s / tempo 2 = 1000ms + 250ms grace.
    tick(800)
    expect(boundary.manager.stopAllMotions).not.toHaveBeenCalled()
    tick(800)
    expect(boundary.manager.stopAllMotions).toHaveBeenCalledTimes(1)
    await expect(done).resolves.toBe(true)
  })

  it('contains a watchdog stop failure until the manager stops', async () => {
    const runtime = await loaded()
    boundary.state.motionScript = () => {
      boundary.state.opacities[0] = 0
    }
    boundary.state.stopThrows = true
    const done = runtime.playManagedMotion({
      group: 'A',
      index: 0,
      displacement: 1,
      tempo: 2,
      faceParamIds: []
    })
    await Promise.resolve()
    tick(800)
    tick(800)
    await expect(done).resolves.toBe(true)
    for (let i = 0; i < 20; i++) tick(50)
    expect(boundary.state.opacities[0]).toBeCloseTo(1, 10)
    tick(50)
    expect(boundary.state.opacities[0]).toBeCloseTo(1, 10)
    boundary.state.playing = false
    tick(16)
    expect(boundary.state.loop).toBe(true)
    expect(boundary.state.fadeIn).toBe(2)
    expect(boundary.state.fadeOut).toBe(2)
  })

  it('contains a failed start: warns once per reference and keeps the persistent target', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const runtime = await loaded()
    runtime.setParams({ BODY: 0.4 })
    boundary.state.startResult = false
    await expect(
      runtime.playManagedMotion({
        group: 'A',
        index: 0,
        displacement: 1,
        tempo: 1,
        faceParamIds: []
      })
    ).resolves.toBe(false)
    expect(boundary.state.loop).toBe(true)
    await expect(
      runtime.playManagedMotion({
        group: 'A',
        index: 0,
        displacement: 1,
        tempo: 1,
        faceParamIds: []
      })
    ).resolves.toBe(false)
    expect(boundary.state.loop).toBe(true)
    expect(warn).toHaveBeenCalledTimes(1)
    tick(16)
    expect(boundary.state.values[BODY]).toBeCloseTo(0.4, 10)
    warn.mockRestore()
  })

  it('settles SDK writes when a started motion exposes no usable duration', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const runtime = await loaded()
    boundary.state.duration = Number.NaN
    boundary.state.startSideEffect = () => {
      boundary.state.values[ARM] = 1
      boundary.state.opacities[0] = 0
    }

    await expect(
      runtime.playManagedMotion({
        group: 'A',
        index: 0,
        displacement: 1,
        tempo: 1,
        faceParamIds: []
      })
    ).resolves.toBe(false)
    expect(boundary.state.loop).toBe(true)
    expect(boundary.state.values[ARM]).toBe(1)
    expect(boundary.state.opacities[0]).toBe(0)

    for (let i = 0; i < 20; i++) tick(50)
    expect(boundary.state.values[ARM]).toBeCloseTo(0, 10)
    expect(boundary.state.opacities[0]).toBeCloseTo(1, 10)
    warn.mockRestore()
  })

  it('never rescales a parameter the motion does not author', async () => {
    const runtime = await loaded()
    runtime.setParams({ BODY: 0.4 })
    tick(16) // the sticky override lands while nothing plays
    expect(boundary.state.values[BODY]).toBeCloseTo(0.4, 10)
    boundary.state.motionScript = () => {
      boundary.state.values[ARM] = 1
    }
    void runtime.playManagedMotion({
      group: 'A',
      index: 0,
      displacement: 0.75,
      tempo: 1,
      faceParamIds: []
    })
    await Promise.resolve()
    for (let i = 0; i < 10; i++) tick(16)
    expect(boundary.state.values[ARM]).toBeCloseTo(0.75, 10) // authored: scaled per fresh write
    expect(boundary.state.values[BODY]).toBeCloseTo(0.4, 10) // unauthored: persists, no collapse
  })

  it('rolling back a character switch resets the restored body, not just restores it', async () => {
    const runtime = await loaded()
    boundary.state.motionScript = () => {
      boundary.state.values[ARM] = 1
      boundary.state.opacities[0] = 0
    }
    const done = runtime.playManagedMotion({
      group: 'A',
      index: 0,
      displacement: 1,
      tempo: 1,
      faceParamIds: []
    })
    await Promise.resolve()
    tick(16)
    boundary.state.playing = false
    boundary.state.motionScript = null
    tick(16)
    await expect(done).resolves.toBe(true)
    for (let i = 0; i < 20; i++) tick(50)
    expect(boundary.state.opacities[0]).toBe(0) // completion: Part organization persists

    await runtime.prepareLoad(2, '/model')
    expect(runtime.commitLoad(2)).toBe(true)
    expect(runtime.rollbackLoad(2)).toBe(true)
    expect(boundary.state.loop).toBe(true)
    // SPEC §6: rollback restores AND resets the old body.
    expect(boundary.state.opacities[0]).toBe(1)
    expect(boundary.state.values[ARM]).toBeCloseTo(0, 10)
  })

  it('a failing stop cannot prevent settlement', async () => {
    const runtime = await loaded()
    boundary.state.motionScript = () => {
      boundary.state.opacities[0] = 0
    }
    const done = runtime.playManagedMotion({
      group: 'A',
      index: 0,
      displacement: 1,
      tempo: 1,
      faceParamIds: []
    })
    await Promise.resolve()
    tick(16)
    boundary.state.stopThrows = true
    runtime.cancelManagedMotion()
    await expect(done).resolves.toBe(false)
    for (let i = 0; i < 20; i++) tick(50)
    expect(boundary.state.opacities[0]).toBeCloseTo(1, 10) // settled to defaults regardless
    tick(50)
    expect(boundary.state.opacities[0]).toBeCloseTo(1, 10) // remains contained while manager writes
    boundary.state.playing = false
    tick(16)
  })

  it('reset contains a motion whose stop throws', async () => {
    const runtime = await loaded()
    boundary.state.motionScript = () => {
      boundary.state.opacities[0] = 0
    }
    void runtime.playManagedMotion({
      group: 'A',
      index: 0,
      displacement: 1,
      tempo: 1,
      faceParamIds: []
    })
    await Promise.resolve()
    tick(16)
    boundary.state.stopThrows = true

    runtime.resetParams()
    for (let i = 0; i < 20; i++) tick(50)
    expect(boundary.state.opacities[0]).toBeCloseTo(1, 10)
    tick(50)
    expect(boundary.state.opacities[0]).toBeCloseTo(1, 10)
  })

  it('rollback contains a restored motion whose earlier stop threw', async () => {
    const runtime = await loaded()
    boundary.state.motionScript = () => {
      boundary.state.opacities[0] = 0
    }
    void runtime.playManagedMotion({
      group: 'A',
      index: 0,
      displacement: 1,
      tempo: 1,
      faceParamIds: []
    })
    await Promise.resolve()
    tick(16)
    boundary.state.stopThrows = true

    await runtime.prepareLoad(2, '/model')
    expect(runtime.commitLoad(2)).toBe(true)
    expect(runtime.rollbackLoad(2)).toBe(true)
    expect(boundary.state.loop).toBe(false)
    for (let i = 0; i < 20; i++) tick(50)
    expect(boundary.state.opacities[0]).toBeCloseTo(1, 10)
    tick(50)
    expect(boundary.state.opacities[0]).toBeCloseTo(1, 10)
    boundary.state.playing = false
    tick(16)
    expect(boundary.state.loop).toBe(true)
  })

  it('rollback contains a motion that starts after commit cancellation', async () => {
    const runtime = await loaded()
    let releaseStart!: () => void
    boundary.state.startGate = new Promise<void>((resolve) => {
      releaseStart = resolve
    })
    boundary.state.motionScript = () => {
      boundary.state.opacities[0] = 0
    }
    const done = runtime.playManagedMotion({
      group: 'A',
      index: 0,
      displacement: 1,
      tempo: 1,
      faceParamIds: []
    })

    await runtime.prepareLoad(2, '/model')
    expect(runtime.commitLoad(2)).toBe(true)
    boundary.state.stopThrows = true
    releaseStart()
    await Promise.resolve()
    await Promise.resolve()
    await expect(done).resolves.toBe(false)
    expect(boundary.state.loop).toBe(false)

    expect(runtime.rollbackLoad(2)).toBe(true)
    for (let i = 0; i < 20; i++) tick(50)
    expect(boundary.state.opacities[0]).toBeCloseTo(1, 10)
    boundary.state.playing = false
    tick(16)
    expect(boundary.state.loop).toBe(true)
  })

  it('keeps rollback containment until a deferred start resolves', async () => {
    const runtime = await loaded()
    let releaseStart!: () => void
    boundary.state.startGate = new Promise<void>((resolve) => {
      releaseStart = resolve
    })
    boundary.state.motionScript = () => {
      boundary.state.opacities[0] = 0
    }
    const done = runtime.playManagedMotion({
      group: 'A',
      index: 0,
      displacement: 1,
      tempo: 1,
      faceParamIds: []
    })

    await runtime.prepareLoad(2, '/model')
    expect(runtime.commitLoad(2)).toBe(true)
    expect(runtime.rollbackLoad(2)).toBe(true)
    boundary.state.stopThrows = true
    releaseStart()
    await Promise.resolve()
    await Promise.resolve()
    await expect(done).resolves.toBe(false)
    expect(boundary.state.loop).toBe(false)

    for (let i = 0; i < 20; i++) tick(50)
    expect(boundary.state.opacities[0]).toBeCloseTo(1, 10)
    boundary.state.playing = false
    tick(16)
    expect(boundary.state.loop).toBe(true)
  })

  it('a newer phrase supersedes a pending one and tempo scales the model delta', async () => {
    const runtime = await loaded()
    const first = runtime.playManagedMotion({
      group: 'A',
      index: 0,
      displacement: 1,
      tempo: 1,
      faceParamIds: []
    })
    const second = runtime.playManagedMotion({
      group: 'B',
      index: 0,
      displacement: 1,
      tempo: 1.15,
      faceParamIds: []
    })
    await expect(first).resolves.toBe(false)
    await Promise.resolve()
    tick(100)
    expect(boundary.state.lastUpdateDt).toBeCloseTo(115, 10)
    boundary.state.playing = false
    tick(16)
    await expect(second).resolves.toBe(true)
  })
})
