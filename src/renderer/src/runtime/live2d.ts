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

  // Pass a canvas to own a new pixi Application; pass an existing runtime to
  // SHARE its Application, context and ticker (002-D2 A/B). Two WebGL contexts
  // cannot share pixi's URL-keyed texture cache — one context steals the other's
  // textures and a stage goes blank — so both Hiyoris live in one context and
  // split the screen into slots.
  private peers: Live2DRuntime[]
  private active = true

  constructor(target: HTMLCanvasElement | Live2DRuntime) {
    if (target instanceof Live2DRuntime) {
      this.app = target.app
      this.peers = target.peers
      this.peers.push(this)
    } else {
      this.app = new Application({
        view: target,
        backgroundAlpha: 0,
        antialias: true,
        autoDensity: true,
        resolution: window.devicePixelRatio || 1,
        resizeTo: target.parentElement ?? window
      })
      this.app.ticker.maxFPS = 30 // root SPEC §10: flat cap; verified by the panel readout
      this.peers = [this]
    }
    this.app.ticker.add(this.tick, this, UPDATE_PRIORITY.LOW)
  }

  /** Show/hide this stage and re-split the screen between active stages. */
  setActive(on: boolean): void {
    this.active = on
    if (this.model) this.model.visible = on
    for (const p of this.peers) p.fit()
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
    // Synth owns breath/blink/sway (slice 002 step 4): disable the library's
    // autobreath/autoblink so per-frame setParams isn't fighting them. Both
    // fields are optional-chained in the library's update path.
    const internal = this.model.internalModel as unknown as {
      breath?: unknown
      eyeBlink?: unknown
      on(event: string, fn: () => void): void
    }
    internal.breath = undefined
    internal.eyeBlink = undefined
    // Our parameter writes have to land INSIDE the model's own update pass, not
    // from the pixi ticker around it. Cubism4InternalModel.update() runs at
    // render time as: motion → [afterMotionUpdate] → physics → pose →
    // coreModel.update() → draw → loadParameters(). The auto-started Idle
    // motion group rewrites every parameter it owns at the top of that pass, so
    // anything written from the ticker (which runs after render) was overwritten
    // before it was ever drawn. Writing on afterMotionUpdate puts us exactly
    // where Cubism expects an expression layer: on top of the motion, under
    // physics and pose.
    internal.on('afterMotionUpdate', () => this.writeParams())
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
    for (const p of this.peers) p.fit() // a joining stage re-splits the screen
    // app.resize() forces pixi's measurement NOW (its own listener defers to
    // the next rAF) so fit() reads the fresh screen size — matters for the
    // single programmatic resize the A/B toggle produces.
    window.addEventListener('resize', () => {
      this.app.resize()
      this.fit()
    })
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

  // setParams is a sticky merge and applyExpression pins until replaced, so a
  // parameter the affect layer once touched never goes back to the model's own
  // motion. This hands everything back at once: defaults written straight to
  // the core (a released id would otherwise keep its last value — nothing in
  // the Cubism pipeline restores defaults), then both layers dropped.
  // ponytail: all 70 params, not just the touched ones — a debug button can
  // afford one extra loop, and there is no bookkeeping to get wrong.
  resetParams(): void {
    if (!this.model) return
    const core = this.core()
    this.inventory.forEach((p, i) => core.setParameterValueByIndex(i, p.default, 1))
    this.overrides.clear()
    this.expression = undefined
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
    // Feeds the model's delta budget; the actual update (and our writeParams
    // hook inside it) runs when pixi renders the model.
    this.model.update(this.app.ticker.deltaMS)
  }

  // Called from inside the model's update pass — see the hook in load().
  private writeParams(): void {
    const core = this.core()
    for (const [id, o] of this.overrides) {
      core.setParameterValueByIndex(this.paramIndex.get(id)!, o.value, o.weight)
    }
    if (this.expression) {
      const { params, weight, fadeMs, startedAt } = this.expression
      const fade = fadeMs > 0 ? Math.min(1, (performance.now() - startedAt) / fadeMs) : 1
      for (const [id, value] of Object.entries(params)) {
        const i = this.paramIndex.get(id)
        if (i === undefined) continue
        const p = this.inventory[i]
        core.setParameterValueByIndex(i, clamp(value, p.min, p.max), weight * fade)
      }
    }
  }

  // Each active stage gets an equal horizontal slot of the shared canvas;
  // with one stage that's the whole window, i.e. pre-A/B behavior.
  private fit(): void {
    if (!this.model || !this.active) return
    const { width, height } = this.app.screen
    const shown = this.peers.filter((p) => p.active)
    const slotWidth = width / shown.length
    const slotX = slotWidth * shown.indexOf(this)
    this.model.scale.set(1)
    const scale = Math.min(slotWidth / this.model.width, height / this.model.height)
    this.model.scale.set(scale)
    this.model.x = slotX + (slotWidth - this.model.width) / 2
    this.model.y = (height - this.model.height) / 2
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
