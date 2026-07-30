import * as PIXI from 'pixi.js'
import { Application, Renderer, Ticker, UPDATE_PRIORITY } from 'pixi.js'
import { install } from '@pixi/unsafe-eval'
import { Live2DModel, MotionPriority } from 'pixi-live2d-display/cubism4'
import type { IRuntime, ParamInfo, RuntimeCompatibility } from './iface'
import {
  isCubism4MotionManager,
  LARES_MOTION_GROUP,
  registerLooseMotion
} from './looseMotion'

// PixiJS 6 builds shaders with new Function(); this swaps in precompiled
// versions so the strict CSP (script-src 'self', no unsafe-eval) can stay.
install(PIXI)

Live2DModel.registerTicker(Ticker)

// Default Lar size (root SPEC §7): the model renders 400 logical px tall —
// the normative judging size for all of M2b. autoDensity keeps it crisp on
// HiDPI. Smaller windows still fit-to-window rather than crop.
const DEFAULT_LAR_HEIGHT = 400
const DESTROY_MODEL = { children: true, texture: true, baseTexture: true } as const

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

interface MocHandle {
  _release(): void
}

interface CubismCore {
  Moc: { fromArrayBuffer(bytes: ArrayBuffer): MocHandle | null }
  Version: { csmGetMocVersion(moc: MocHandle, bytes: ArrayBuffer): number }
}

interface ModelSettings {
  url?: string
  FileReferences?: {
    Moc?: unknown
    Textures?: unknown
    Physics?: unknown
    Motions?: unknown
    [key: string]: unknown
  }
  Groups?: unknown
  [key: string]: unknown
}

interface PreparedSource {
  source: string | ModelSettings
  compatibility: Omit<RuntimeCompatibility, 'motions' | 'maxTextureSize'>
}

const SUPPORTED_MOC_VERSIONS = new Set([1, 2, 3, 4])
const MOC_LABELS: Record<number, string> = {
  1: 'SDK 3.0–3.2',
  2: 'SDK 3.3',
  3: 'SDK 4.0',
  4: 'SDK 4.2',
  5: 'SDK 5.x+'
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function groupIds(settings: ModelSettings, name: 'EyeBlink' | 'LipSync'): string[] {
  if (!Array.isArray(settings.Groups)) return []
  const group = settings.Groups.find(
    (value) => record(value) && value.Target === 'Parameter' && value.Name === name
  )
  return record(group) && Array.isArray(group.Ids)
    ? group.Ids.filter((id): id is string => typeof id === 'string')
    : []
}

function resourceUrl(modelUrl: string, reference: string): string {
  const resolved = new URL(reference, modelUrl)
  const model = new URL(modelUrl)
  const leavesCandidateRoot =
    model.hostname === 'candidate' &&
    resolved.pathname.split('/')[1] !== model.pathname.split('/')[1]
  if (
    resolved.protocol !== 'lares:' ||
    model.protocol !== 'lares:' ||
    resolved.hostname !== model.hostname ||
    leavesCandidateRoot
  ) {
    throw new Error(`Model resource escapes its character root: ${reference}`)
  }
  return resolved.toString()
}

function withoutMotionSounds(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutMotionSounds)
  if (!record(value)) return value
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== 'Sound')
      .map(([key, child]) => [key, withoutMotionSounds(child)])
  )
}

/** Reads Core compatibility before pixi creates a Live2DModel. */
export async function prepareModelSource(
  modelPath: string,
  fallbackPhysics?: string,
  core = window.Live2DCubismCore as CubismCore,
  maxTextureSize: number | null = null
): Promise<PreparedSource> {
  if (!modelPath.startsWith('lares://')) {
    return {
      source: modelPath,
      compatibility: {
        mocVersion: null,
        groups: { eyeBlink: [], lipSync: [] },
        textures: [],
        textureDimensions: []
      }
    }
  }
  const response = await fetch(modelPath)
  if (!response.ok) throw new Error(`Model settings request failed (${response.status})`)
  const settings = await response.json() as ModelSettings
  if (!record(settings) || !record(settings.FileReferences)) {
    throw new Error('Model settings are malformed')
  }
  const mocReference = settings.FileReferences.Moc
  if (typeof mocReference !== 'string' || mocReference === '') {
    throw new Error('Model FileReferences.Moc is required')
  }
  const mocResponse = await fetch(resourceUrl(modelPath, mocReference))
  if (!mocResponse.ok) throw new Error(`MOC request failed (${mocResponse.status})`)
  const bytes = await mocResponse.arrayBuffer()
  let moc: MocHandle | null = null
  let mocVersion = 0
  try {
    moc = core.Moc.fromArrayBuffer(bytes)
    if (!moc) throw new Error('MOC is malformed or unsupported')
    mocVersion = core.Version.csmGetMocVersion(moc, bytes)
  } finally {
    moc?._release()
  }
  if (!Number.isInteger(mocVersion) || !SUPPORTED_MOC_VERSIONS.has(mocVersion)) {
    const detected = MOC_LABELS[mocVersion] ?? `unknown value ${String(mocVersion)}`
    throw new Error(
      `Unsupported Live2D MOC runtime ${detected}; Lares supports SDK 3.0–4.2`
    )
  }
  const references = { ...settings.FileReferences }
  if (references.Motions !== undefined) {
    references.Motions = withoutMotionSounds(references.Motions)
  }
  for (const key of ['Physics', 'Pose', 'UserData', 'DisplayInfo'] as const) {
    const reference = references[key]
    if (typeof reference !== 'string') {
      delete references[key]
      continue
    }
    try {
      if (!(await fetch(resourceUrl(modelPath, reference))).ok) delete references[key]
    } catch {
      delete references[key]
    }
  }
  if (references.Physics === undefined && fallbackPhysics) {
    references.Physics = resourceUrl(modelPath, fallbackPhysics)
  }
  const textures = Array.isArray(references.Textures)
    ? references.Textures.filter((path): path is string => typeof path === 'string')
    : []
  const textureDimensions: RuntimeCompatibility['textureDimensions'] = []
  if (maxTextureSize !== null) {
    for (const path of textures) {
      const textureResponse = await fetch(resourceUrl(modelPath, path))
      if (!textureResponse.ok) {
        throw new Error(`Texture request failed (${textureResponse.status}): ${path}`)
      }
      const bitmap = await createImageBitmap(await textureResponse.blob())
      try {
        textureDimensions.push({ path, width: bitmap.width, height: bitmap.height })
        if (bitmap.width > maxTextureSize || bitmap.height > maxTextureSize) {
          throw new Error(
            `Texture exceeds this renderer's ${maxTextureSize}px limit: ${path} (${bitmap.width}×${bitmap.height})`
          )
        }
      } finally {
        bitmap.close()
      }
    }
  }
  return {
    source: { ...settings, url: modelPath, FileReferences: references },
    compatibility: {
      mocVersion,
      groups: {
        eyeBlink: groupIds(settings, 'EyeBlink'),
        lipSync: groupIds(settings, 'LipSync')
      },
      textures,
      textureDimensions
    }
  }
}

interface RuntimeExpression {
  params: Record<string, number>
  weight: number
  fadeMs: number
  startedAt: number
}

interface RuntimeModelState {
  model: Live2DModel
  inventory: ParamInfo[]
  compatibility: RuntimeCompatibility
  paramIndex: Map<string, number>
  overrides: Map<string, { value: number; weight: number }>
  expression?: RuntimeExpression
}

export class Live2DRuntime implements IRuntime {
  private app: Application
  private model?: Live2DModel
  private inventory: ParamInfo[] = []
  private modelCompatibility: RuntimeCompatibility = {
    mocVersion: null,
    groups: { eyeBlink: [], lipSync: [] },
    motions: {},
    maxTextureSize: null,
    textures: [],
    textureDimensions: []
  }
  private paramIndex = new Map<string, number>()
  // Last-written values, reapplied every frame after the model's own update:
  // motions/physics rewrite parameters each tick, so a one-shot write would
  // flash for a single frame. M2's affect engine replaces this bookkeeping.
  private overrides = new Map<string, { value: number; weight: number }>()
  private expression?: RuntimeExpression

  // Pass a canvas to own a new pixi Application; pass an existing runtime to
  // SHARE its Application, context and ticker (002-D2 A/B). Two WebGL contexts
  // cannot share pixi's URL-keyed texture cache — one context steals the other's
  // textures and a stage goes blank — so both Hiyoris live in one context and
  // split the screen into slots.
  private peers: Live2DRuntime[]
  private active = true
  private displayScale = 1
  private loadGeneration = 0
  private prepared?: {
    id: number
    model: Live2DModel
    inventory: ParamInfo[]
    compatibility: RuntimeCompatibility
  }
  private committed?: {
    id: number
    candidate: Live2DModel
    previous?: RuntimeModelState
  }

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
        // alphaAt() reads the drawing buffer between frames, which is garbage
        // once the compositor has taken it. ponytail: set for both windows —
        // one flag beats threading a mode through the constructor, and at
        // 30fps on a window this size the cost does not show up.
        preserveDrawingBuffer: true,
        resolution: window.devicePixelRatio || 1,
        resizeTo: target.parentElement ?? window
      })
      this.app.ticker.maxFPS = 30 // root SPEC §10: flat cap; verified by the panel readout
      this.peers = [this]
    }
    this.app.ticker.add(this.tick, this, UPDATE_PRIORITY.LOW)
    window.addEventListener('resize', () => {
      this.app.resize()
      this.fit()
    })
  }

  /** Show/hide this stage and re-split the screen between active stages. */
  setActive(on: boolean): void {
    this.active = on
    if (this.model) this.model.visible = on
    for (const p of this.peers) p.fit()
  }

  setDisplayScale(scale: number): void {
    this.displayScale = Number.isFinite(scale) ? Math.min(1.5, Math.max(0.5, scale)) : 1
    this.fit()
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

  async load(modelPath: string, fallbackPhysics?: string): Promise<void> {
    await this.prepareLoad(0, modelPath, fallbackPhysics)
    if (!this.commitLoad(0)) throw new Error('character load commit failed')
    this.finalizeLoad(0)
  }

  async prepareLoad(
    id: number,
    modelPath: string,
    fallbackPhysics?: string
  ): Promise<ParamInfo[]> {
    const generation = ++this.loadGeneration
    if (this.prepared) {
      this.destroy(this.prepared.model)
      this.prepared = undefined
    }
    const gl = (this.app.renderer as Renderer).gl
    const rawMaxTextureSize =
      typeof gl?.getParameter === 'function' && gl.MAX_TEXTURE_SIZE !== undefined
        ? Number(gl.getParameter(gl.MAX_TEXTURE_SIZE))
        : null
    const maxTextureSize =
      rawMaxTextureSize !== null && Number.isFinite(rawMaxTextureSize)
        ? rawMaxTextureSize
        : null
    const preparedSource = await prepareModelSource(
      modelPath,
      fallbackPhysics,
      window.Live2DCubismCore as CubismCore,
      maxTextureSize
    )
    if (generation !== this.loadGeneration) throw new Error('character load was superseded')
    const model = await Live2DModel.from(
      preparedSource.source as Parameters<typeof Live2DModel.from>[0],
      { autoUpdate: false, autoInteract: false }
    )
    try {
      if (generation !== this.loadGeneration) throw new Error('character load was superseded')
      const internal = model.internalModel as unknown as {
        breath?: unknown
        eyeBlink?: unknown
        on(event: string, fn: () => void): void
        coreModel: CoreModel
      }
      internal.breath = undefined
      internal.eyeBlink = undefined
      internal.on('afterMotionUpdate', () => this.writeParams())
      const params = internal.coreModel._model.parameters
      const inventory = Array.from({ length: params.count }, (_, i) => ({
        id: params.ids[i],
        name: params.ids[i],
        min: params.minimumValues[i],
        max: params.maximumValues[i],
        default: params.defaultValues[i]
      }))
      if (
        inventory.some(
          (param) =>
            !param.id ||
            !Number.isFinite(param.min) ||
            !Number.isFinite(param.max) ||
            param.min > param.max ||
            !Number.isFinite(param.default)
        )
      ) {
        throw new Error('renderer returned an invalid body inventory')
      }
      const definitions = model.internalModel.motionManager.definitions as Record<
        string,
        unknown[] | undefined
      >
      this.prepared = {
        id,
        model,
        inventory,
        compatibility: {
          ...preparedSource.compatibility,
          motions: Object.fromEntries(
            Object.entries(definitions ?? {}).map(([group, motions]) => [
              group,
              motions?.length ?? 0
            ])
          ),
          maxTextureSize
        }
      }
      return inventory.map((param) => ({ ...param }))
    } catch (error) {
      this.destroy(model)
      throw error
    }
  }

  commitLoad(id: number): boolean {
    if (this.committed || this.prepared?.id !== id) return false
    const { model, inventory, compatibility } = this.prepared
    this.prepared = undefined
    const previous = this.model
      ? {
          model: this.model,
          inventory: this.inventory,
          compatibility: this.modelCompatibility,
          paramIndex: this.paramIndex,
          overrides: this.overrides,
          expression: this.expression
        }
      : undefined
    this.model = model
    this.inventory = inventory
    this.modelCompatibility = compatibility
    this.paramIndex = new Map(inventory.map((param, index) => [param.id, index]))
    this.overrides = new Map()
    this.expression = undefined
    try {
      for (const peer of this.peers) peer.fit()
      this.app.stage.addChild(model)
      this.committed = { id, candidate: model, previous }
      if (previous) previous.model.visible = false
      return true
    } catch {
      this.restore(previous)
      this.destroy(model)
      return false
    }
  }

  rollbackLoad(id: number): boolean {
    if (this.committed?.id !== id) return false
    const { candidate, previous } = this.committed
    this.committed = undefined
    this.restore(previous)
    this.destroy(candidate)
    try {
      for (const peer of this.peers) peer.fit()
    } catch {
      // The prior model is already restored; layout retry occurs on resize.
    }
    return true
  }

  finalizeLoad(id: number): void {
    if (this.committed?.id !== id) return
    const previous = this.committed.previous
    this.committed = undefined
    if (previous) this.destroy(previous.model)
  }

  cancelLoad(id: number): boolean {
    if (this.prepared?.id !== id) return false
    this.destroy(this.prepared.model)
    this.prepared = undefined
    return true
  }

  private restore(previous?: RuntimeModelState): void {
    if (!previous) {
      this.model = undefined
      this.inventory = []
      this.modelCompatibility = {
        mocVersion: null,
        groups: { eyeBlink: [], lipSync: [] },
        motions: {},
        maxTextureSize: null,
        textures: [],
        textureDimensions: []
      }
      this.paramIndex = new Map()
      this.overrides = new Map()
      this.expression = undefined
      return
    }
    this.model = previous.model
    this.inventory = previous.inventory
    this.modelCompatibility = previous.compatibility
    this.paramIndex = previous.paramIndex
    this.overrides = previous.overrides
    this.expression = previous.expression
    previous.model.visible = this.active
  }

  private destroy(model: Live2DModel): void {
    try {
      model.destroy(DESTROY_MODEL)
    } catch {
      // Resource disposal is finalization and must not break transaction state.
    }
  }

  parameters(): ParamInfo[] {
    return this.inventory
  }

  compatibility(): RuntimeCompatibility {
    return {
      ...this.modelCompatibility,
      groups: {
        eyeBlink: [...this.modelCompatibility.groups.eyeBlink],
        lipSync: [...this.modelCompatibility.groups.lipSync]
      },
      motions: { ...this.modelCompatibility.motions },
      textures: [...this.modelCompatibility.textures],
      textureDimensions: this.modelCompatibility.textureDimensions.map((texture) => ({
        ...texture
      }))
    }
  }

  setParams(batch: Record<string, number>, weight = 1): void {
    for (const [id, value] of Object.entries(batch)) {
      const i = this.paramIndex.get(id)
      if (i === undefined) continue // unknown ids dropped, values clamped below (P7)
      const p = this.inventory[i]
      this.overrides.set(id, { value: clamp(value, p.min, p.max), weight })
    }
  }

  releaseParams(ids: readonly string[]): void {
    if (!this.model) return
    const core = this.core()
    for (const id of ids) {
      const index = this.paramIndex.get(id)
      if (index === undefined) continue
      this.overrides.delete(id)
      core.setParameterValueByIndex(index, this.inventory[index].default, 1)
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
    if (/^lares:\/\//i.test(group)) {
      const manager = this.model?.internalModel.motionManager as unknown
      if (!isCubism4MotionManager(manager)) {
        console.warn('[lares] loose motion unsupported by this runtime')
        return
      }
      const motionIndex = registerLooseMotion(manager, group)
      void manager
        .startMotion(LARES_MOTION_GROUP, motionIndex, priority)
        .catch((error: unknown) => console.warn('[lares] loose motion failed', error))
      return
    }
    void this.model?.motion(group, index, priority)
  }

  hitTest(x: number, y: number): string[] {
    return this.model?.hitTest(x, y) ?? []
  }

  // 003-D3's fallback, measured not guessed: Hiyori's one authored HitArea
  // covers a 96x136 box over her torso and nothing else — no head, no hands —
  // so A6 fails on the authored test and the silhouette itself becomes the
  // hit area. One pixel per 30fps tick; the readback stall is bounded by the
  // caller's throttle, and only the overlay ever calls it.
  alphaAt(x: number, y: number): number {
    const gl = (this.app.renderer as Renderer).gl
    const res = this.app.renderer.resolution
    const px = Math.round(x * res)
    // readPixels counts rows from the bottom; the DOM counts from the top.
    const py = gl.drawingBufferHeight - Math.round(y * res) - 1
    if (px < 0 || py < 0 || px >= gl.drawingBufferWidth || py >= gl.drawingBufferHeight) return 0
    const pixel = new Uint8Array(4)
    gl.readPixels(px, py, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel)
    return pixel[3]
  }

  // Aspect is read off the live display object rather than a stored natural
  // size: fit() only ever applies a UNIFORM scale, so the ratio is the same
  // whatever fit() last did to it.
  larSize(): { width: number; height: number } {
    const aspect = this.model ? this.model.width / this.model.height : 1
    const height = DEFAULT_LAR_HEIGHT * this.displayScale
    return { width: Math.round(height * aspect), height }
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
    const scale = Math.min(
      slotWidth / this.model.width,
      Math.min(height, DEFAULT_LAR_HEIGHT * this.displayScale) / this.model.height
    )
    this.model.scale.set(scale)
    this.model.x = slotX + (slotWidth - this.model.width) / 2
    this.model.y = (height - this.model.height) / 2
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
