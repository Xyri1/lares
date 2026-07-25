import * as PIXI from 'pixi.js'
import { Application, Ticker, UPDATE_PRIORITY } from 'pixi.js'
import { install } from '@pixi/unsafe-eval'
import { Live2DModel, MotionPriority } from 'pixi-live2d-display/cubism4'
import type { IRuntime, ParamInfo } from './iface'

// PixiJS 6 builds shaders with new Function(); this swaps in precompiled
// versions so the strict CSP (script-src 'self', no unsafe-eval) can stay.
install(PIXI)

Live2DModel.registerTicker(Ticker)

// Raw Cubism Core parameter struct, reached through documented internals
// (001-D2 spike). Parallel arrays indexed 0..count-1.
interface CoreParamStruct {
  ids: string[]
  minimumValues: number[]
  maximumValues: number[]
  defaultValues: number[]
  count: number
}

interface CoreModel {
  setParameterValueByIndex(index: number, value: number, weight?: number): void
  update(): void
  _model: { parameters: CoreParamStruct }
}

export class Live2DRuntime implements IRuntime {
  private app: Application
  private model?: Live2DModel
  private inventory: ParamInfo[] = []
  private paramIndex = new Map<string, number>()
  // Last-written values, reapplied every frame after the model's own update:
  // motions/physics rewrite parameters each tick, so a one-shot write would
  // flash for a single frame. M2's affect engine replaces this bookkeeping.
  private overrides = new Map<string, { value: number; weight: number }>()
  private expression?: {
    params: Record<string, number>
    weight: number
    fadeMs: number
    startedAt: number
  }

  constructor(view: HTMLCanvasElement) {
    this.app = new Application({
      view,
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1,
      resizeTo: window
    })
    this.app.ticker.maxFPS = 30 // root SPEC §10: flat cap; verified by the panel readout
    this.app.ticker.add(this.tick, this, UPDATE_PRIORITY.LOW)
  }

  // Measured from processed ticks — pixi's Ticker.FPS reports raw rAF cadence
  // including maxFPS-skipped frames, so it over-reads under load.
  private frameCount = 0
  private fpsWindowStart = performance.now()
  private measuredFps = 0

  get fps(): number {
    return this.measuredFps
  }

  motionGroups(): Record<string, number> {
    const definitions = (this.model?.internalModel.motionManager.definitions ?? {}) as Record<
      string,
      unknown[] | undefined
    >
    return Object.fromEntries(
      Object.entries(definitions).map(([group, list]) => [group, list?.length ?? 0])
    )
  }

  async load(modelPath: string): Promise<void> {
    this.model = await Live2DModel.from(modelPath, { autoUpdate: false, autoInteract: false })
    this.app.stage.addChild(this.model)
    const params = this.core()._model.parameters
    this.inventory = Array.from({ length: params.count }, (_, i) => ({
      id: params.ids[i],
      name: params.ids[i], // display names live in .cdi3.json; the id is enough for M1a
      min: params.minimumValues[i],
      max: params.maximumValues[i],
      default: params.defaultValues[i]
    }))
    this.paramIndex = new Map(this.inventory.map((p, i) => [p.id, i]))
    this.fit()
    window.addEventListener('resize', () => this.fit())
  }

  parameters(): ParamInfo[] {
    return this.inventory
  }

  setParams(batch: Record<string, number>, weight = 1): void {
    for (const [id, value] of Object.entries(batch)) {
      const i = this.paramIndex.get(id)
      if (i === undefined) continue // unknown ids dropped, values clamped below (P7)
      const p = this.inventory[i]
      this.overrides.set(id, { value: clamp(value, p.min, p.max), weight })
    }
  }

  applyExpression(ref: string | Record<string, number>, weight: number, fadeMs: number): void {
    if (typeof ref === 'string') {
      // Hiyori ships no .exp3.json; the ref form lands with the first model that does (A7).
      throw new Error(`expression refs are not supported yet (got "${ref}") — pass a raw param map`)
    }
    this.expression = { params: ref, weight, fadeMs, startedAt: performance.now() }
  }

  playMotion(group: string, index?: number, priority = MotionPriority.NORMAL): void {
    void this.model?.motion(group, index, priority)
  }

  hitTest(x: number, y: number): string[] {
    return this.model?.hitTest(x, y) ?? []
  }

  private core(): CoreModel {
    return this.model!.internalModel.coreModel as unknown as CoreModel
  }

  private tick(): void {
    this.frameCount++
    const now = performance.now()
    if (now - this.fpsWindowStart >= 1000) {
      this.measuredFps = (this.frameCount * 1000) / (now - this.fpsWindowStart)
      this.frameCount = 0
      this.fpsWindowStart = now
    }
    if (!this.model) return
    this.model.update(this.app.ticker.deltaMS)
    const core = this.core()
    let dirty = false
    for (const [id, o] of this.overrides) {
      core.setParameterValueByIndex(this.paramIndex.get(id)!, o.value, o.weight)
      dirty = true
    }
    if (this.expression) {
      const { params, weight, fadeMs, startedAt } = this.expression
      const fade = fadeMs > 0 ? Math.min(1, (performance.now() - startedAt) / fadeMs) : 1
      for (const [id, value] of Object.entries(params)) {
        const i = this.paramIndex.get(id)
        if (i === undefined) continue
        const p = this.inventory[i]
        core.setParameterValueByIndex(i, clamp(value, p.min, p.max), weight * fade)
        dirty = true
      }
    }
    // Writes after the model's own update need an explicit propagate to reach
    // the mesh (001-D2 spike finding).
    if (dirty) core.update()
  }

  private fit(): void {
    if (!this.model) return
    const { width, height } = this.app.screen
    this.model.scale.set(1)
    const scale = Math.min(width / this.model.width, height / this.model.height)
    this.model.scale.set(scale)
    this.model.x = (width - this.model.width) / 2
    this.model.y = (height - this.model.height) / 2
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
