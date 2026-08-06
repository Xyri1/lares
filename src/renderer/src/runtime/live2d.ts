import * as PIXI from 'pixi.js'
import { Application, Renderer, Ticker, UPDATE_PRIORITY } from 'pixi.js'
import { install } from '@pixi/unsafe-eval'
import { Live2DModel, MotionPriority } from 'pixi-live2d-display/cubism4'
import type { IRuntime, ManagedMotionPlan, ParamInfo, RuntimeCompatibility } from './iface'
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
  values: number[]
  count: number
}

// Part opacities have no core default array; the authored state is whatever
// the freshly loaded model carries, snapshotted at prepareLoad.
interface CorePartStruct {
  ids: string[]
  opacities: number[]
  count: number
}

interface CoreModel {
  setParameterValueByIndex(index: number, value: number, weight?: number): void
  setPartOpacityByIndex(index: number, opacity: number): void
  update(): void
  _model: { parameters: CoreParamStruct; parts: CorePartStruct }
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
  partDefaults: number[]
  pendingManaged?: ManagedState
}

// Fixed body-choreography source constants (slice 014 SPEC §5) plus the
// library's fade defaults (pixi-live2d-display config values, mirrored here
// so the idle-preload race check needs no config import).
const SETTLE_MS = 700
const FINISH_GRACE_MS = 250
const IDLE_FADE_S = 2
const NORMAL_FADE_S = 0.5

function smooth01(t: number): number {
  if (t <= 0) return 0
  if (t >= 1) return 1
  return t * t * (3 - 2 * t)
}

interface SettleState {
  elapsedMs: number
  from: number[]
  fromParts: number[]
  /** true: cancellation family — unwired params and Parts ease to defaults.
   *  false: natural completion — they persist as the settled arm organization. */
  toDefaults: boolean
  done: boolean
}

interface ManagedState {
  faceIds: Set<string>
  /** Parameter ids the motion's curves author — the only ids displacement may
   *  scale (SPEC §5). null when the loaded asset exposes no curve list. */
  authoredIds: Set<string> | null
  displacement: number
  tempo: number
  phase: 'starting' | 'playing' | 'settling'
  startPending: boolean
  elapsedMs: number
  deadlineMs: number
  settle?: SettleState
  resolve: ((finished: boolean) => void) | null
  motion?: ManagedMotionLike
  sourceLoop?: boolean
  sourceFadeIn?: number
  sourceFadeOut?: number
}

interface ManagedMotionLike {
  getDuration?(): number
  isLoop?(): boolean
  setIsLoop?(loop: boolean): void
  getFadeInTime?(): number
  setFadeInTime?(seconds: number): void
  getFadeOutTime?(): number
  setFadeOutTime?(seconds: number): void
  _motionData?: { curves?: Array<{ type: number; id: string }> }
}

interface Cubism4ManagerLike {
  playing: boolean
  groups: { idle: string }
  startMotion(group: string, index: number, priority?: number): Promise<boolean>
  stopAllMotions(): void
  motionGroups?: Record<string, Array<ManagedMotionLike | null | undefined>>
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

  // Managed choreography (slice 014): at most one phrase, plus whether a
  // completed phrase left Parts away from their authored defaults.
  private managed?: ManagedState
  private partsDirty = false
  private partDefaults: number[] = []
  private warnedRefs = new Set<string>()

  private displayScale = 1
  private loadGeneration = 0
  private prepared?: {
    id: number
    model: Live2DModel
    inventory: ParamInfo[]
    compatibility: RuntimeCompatibility
    partDefaults: number[]
  }
  private committed?: {
    id: number
    candidate: Live2DModel
    previous?: RuntimeModelState
  }

  constructor(target: HTMLCanvasElement) {
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
    this.app.ticker.add(this.tick, this, UPDATE_PRIORITY.LOW)
    window.addEventListener('resize', () => {
      this.app.resize()
      this.fit()
    })
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

  async load(modelPath: string, fallbackPhysics?: string, choreographed?: boolean): Promise<void> {
    await this.prepareLoad(0, modelPath, fallbackPhysics, choreographed)
    if (!this.commitLoad(0)) throw new Error('character load commit failed')
    this.finalizeLoad(0)
  }

  async prepareLoad(
    id: number,
    modelPath: string,
    fallbackPhysics?: string,
    choreographed?: boolean
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
      if (choreographed) {
        // Lares owns which registered motion plays (014 §7). Blank the idle
        // group before the model ever updates so random idle cannot
        // self-select; done this early it also stops later loads from baking
        // the 2 s idle fade default into cached motions.
        const manager = model.internalModel.motionManager as unknown as Cubism4ManagerLike
        manager.groups.idle = ''
      }
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
      const parts = internal.coreModel._model.parts
      const partDefaults = Array.from({ length: parts.count }, (_, i) => parts.opacities[i])
      this.prepared = {
        id,
        model,
        inventory,
        partDefaults,
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
    const { model, inventory, compatibility, partDefaults } = this.prepared
    this.prepared = undefined
    const previous: RuntimeModelState | undefined = this.model
      ? {
          model: this.model,
          inventory: this.inventory,
          compatibility: this.modelCompatibility,
          paramIndex: this.paramIndex,
          overrides: this.overrides,
          expression: this.expression,
          partDefaults: this.partDefaults,
          pendingManaged: undefined
        }
      : undefined
    const interrupted = this.managed
    const managedStopped = this.abortManaged()
    if (previous && interrupted && (!managedStopped || interrupted.phase === 'starting')) {
      previous.pendingManaged = interrupted
    }
    this.partsDirty = false
    this.warnedRefs.clear()
    this.model = model
    this.inventory = inventory
    this.modelCompatibility = compatibility
    this.paramIndex = new Map(inventory.map((param, index) => [param.id, index]))
    this.overrides = new Map()
    this.expression = undefined
    this.partDefaults = partDefaults
    try {
      this.fit()
      this.app.stage.addChild(model)
      this.committed = { id, candidate: model, previous }
      if (previous) previous.model.visible = false
      return true
    } catch {
      this.restore(previous)
      this.resetRestoredBody(previous?.pendingManaged)
      this.destroy(model)
      return false
    }
  }

  rollbackLoad(id: number): boolean {
    if (this.committed?.id !== id) return false
    const { candidate, previous } = this.committed
    this.committed = undefined
    this.abortManaged()
    this.partsDirty = false
    this.restore(previous)
    // Rollback restores AND resets the old body (SPEC §6): an earlier phrase's
    // Part organization or unwired parameter pose must not survive it. The
    // stage's sticky overrides re-land the wired targets on the next frame.
    this.resetRestoredBody(previous?.pendingManaged)
    this.destroy(candidate)
    try {
      this.fit()
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
      this.partDefaults = []
      return
    }
    this.model = previous.model
    this.inventory = previous.inventory
    this.modelCompatibility = previous.compatibility
    this.paramIndex = previous.paramIndex
    this.overrides = previous.overrides
    this.expression = previous.expression
    this.partDefaults = previous.partDefaults
    previous.model.visible = true
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
    const hadManaged = this.managed !== undefined
    const core = this.core()
    this.inventory.forEach((p, i) => core.setParameterValueByIndex(i, p.default, 1))
    // Parts only when a managed phrase touched them — a character without
    // choreography keeps its slice 013 reset behavior unchanged (SPEC §3).
    if (this.partsDirty || hadManaged) {
      this.partDefaults.forEach((opacity, i) => core.setPartOpacityByIndex(i, opacity))
      this.partsDirty = false
    }
    this.overrides.clear()
    this.expression = undefined
    // Reset values first; if the SDK stop throws, containment captures and
    // keeps those defaults instead of letting the live motion resume.
    this.abortManaged(true)
  }

  applyExpression(ref: string | Record<string, number>, weight: number, fadeMs: number): void {
    if (typeof ref === 'string') {
      // Hiyori ships no .exp3.json; the ref form lands with the first model that does (A7).
      throw new Error(`expression refs are not supported yet (got "${ref}") — pass a raw param map`)
    }
    this.expression = { params: ref, weight, fadeMs, startedAt: performance.now() }
  }

  async playManagedMotion(plan: ManagedMotionPlan): Promise<boolean> {
    const manager = this.model?.internalModel.motionManager as unknown as
      | Cubism4ManagerLike
      | undefined
    if (!manager) return false
    // Never uncover a previous motion while a new asset loads. If its stop
    // fails, keep the default containment and let a later trigger retry.
    if (!this.abortManaged(true)) return false
    let resolveFn!: (finished: boolean) => void
    const promise = new Promise<boolean>((resolve) => {
      resolveFn = resolve
    })
    const state: ManagedState = {
      faceIds: new Set(plan.faceParamIds),
      authoredIds: null,
      displacement: plan.displacement,
      tempo: plan.tempo,
      phase: 'starting',
      startPending: true,
      elapsedMs: 0,
      deadlineMs: 0,
      resolve: resolveFn
    }
    this.managed = state

    let started = false
    try {
      started = await manager.startMotion(plan.group, plan.index, MotionPriority.FORCE)
    } catch {
      started = false
    }
    state.startPending = false
    const motion = manager.motionGroups?.[plan.group]?.[plan.index]
    try {
      const sourceLoop = motion?.isLoop?.()
      if (typeof sourceLoop === 'boolean' && motion?.setIsLoop) {
        motion.setIsLoop(false)
        state.motion = motion
        state.sourceLoop = sourceLoop
      }
    } catch {
      // The duration watchdog still enforces one cycle if loop mutation fails.
    }
    if (this.managed !== state || state.phase !== 'starting') {
      // Superseded or cancelled while the file loaded (cancellation reuses
      // this state object as its settle, hence the phase check); whoever took
      // over already resolved our promise. Contain the stray start.
      let stopped = true
      if (started) {
        try {
          manager.stopAllMotions()
        } catch {
          stopped = false
          // Contained (SPEC §6): stop failures never block the next phrase.
        }
      }
      if (stopped) this.restoreManagedMotion(state)
      return promise
    }
    const durationS = started && motion?.getDuration ? motion.getDuration() : NaN
    if (!started || !Number.isFinite(durationS) || durationS <= 0) {
      const ref = `${plan.group}[${plan.index}]`
      if (!this.warnedRefs.has(ref)) {
        this.warnedRefs.add(ref)
        console.warn(`[lares] choreography phrase failed to start: ${ref}`)
      }
      let stopped = true
      if (started) {
        try {
          manager.stopAllMotions()
        } catch {
          stopped = false
          // Contained; the settle below still restores defaults.
        }
      }
      state.resolve = null
      // A motion may have written parameters/Parts before the SDK reports its
      // unusable duration. Always settle the actual live values; the no-write
      // failure case is a harmless zero-distance settle.
      if (started && this.model) {
        if (stopped) this.restoreManagedMotion(state)
        this.beginSettle(state, true)
      } else {
        this.restoreManagedMotion(state)
        this.managed = undefined
      }
      resolveFn(false)
      return promise
    }
    // A motion cached while the idle group was still live baked the library's
    // 2 s idle fade default (the preload race the E5 harness flagged); managed
    // phrases use the normal fade. Authored Meta fades are never rewritten.
    try {
      if (motion?.getFadeInTime?.() === IDLE_FADE_S && motion.setFadeInTime) {
        state.motion = motion
        state.sourceFadeIn = IDLE_FADE_S
        motion.setFadeInTime(NORMAL_FADE_S)
      }
      if (motion?.getFadeOutTime?.() === IDLE_FADE_S && motion.setFadeOutTime) {
        state.motion = motion
        state.sourceFadeOut = IDLE_FADE_S
        motion.setFadeOutTime(NORMAL_FADE_S)
      }
    } catch {
      // The phrase remains playable with the asset's authored fade.
    }
    // Displacement may scale only the parameters this motion authors (SPEC
    // §5): a non-authored parameter holds its persisted value frame to frame,
    // and rescaling that compounds it toward rig default.
    const curves = motion?._motionData?.curves
    state.authoredIds = Array.isArray(curves)
      ? new Set(curves.filter((curve) => curve.type === 1).map((curve) => curve.id))
      : null
    if (state.authoredIds === null && plan.displacement !== 1) {
      const ref = `${plan.group}[${plan.index}]`
      if (!this.warnedRefs.has(ref)) {
        this.warnedRefs.add(ref)
        console.warn(`[lares] no curve list on ${ref}; phrase plays undisplaced`)
      }
    }
    state.phase = 'playing'
    // One authored cycle: the loaded asset's duration at our tempo, plus the
    // fixed grace, bounds a finish that never arrives (SPEC §6).
    state.deadlineMs = (durationS / plan.tempo) * 1000 + FINISH_GRACE_MS
    this.partsDirty = true
    return promise
  }

  cancelManagedMotion(): void {
    const mm = this.managed
    if (!this.model) {
      this.abortManaged()
      return
    }
    if (mm && mm.phase !== 'settling') {
      const manager = this.model.internalModel.motionManager as unknown as Cubism4ManagerLike
      let stopped = true
      try {
        manager.stopAllMotions()
      } catch {
        stopped = false
        // Contained (SPEC §6): a stop failure must not prevent settlement.
      }
      if (stopped) this.restoreManagedMotion(mm)
      mm.resolve?.(false)
      mm.resolve = null
      this.beginSettle(mm, true)
      return
    }
    if (mm?.phase === 'settling') {
      if (!mm.settle?.toDefaults) {
        // Upgrade a completion settle: Parts and unwired parameters now ease
        // to the character defaults, re-captured from the actual live values.
        this.beginSettle(mm, true)
      }
      return
    }
    if (this.partsDirty) {
      // No phrase active, but a completed one left its Part organization.
      this.beginDefaultContainment()
    }
  }

  private abortManaged(containFailure = false): boolean {
    const mm = this.managed
    if (!mm) return true
    this.managed = undefined
    let stopped = true
    if (this.model) {
      try {
        ;(this.model.internalModel.motionManager as unknown as Cubism4ManagerLike).stopAllMotions()
      } catch {
        stopped = false
        // Contained: transaction/reset paths must never throw from here.
      }
    }
    mm.resolve?.(false)
    mm.resolve = null
    if (!stopped && containFailure && this.model) this.beginSettle(mm, true)
    else if (stopped) this.restoreManagedMotion(mm)
    return stopped
  }

  private restoreManagedMotion(state: ManagedState): void {
    const motion = state.motion
    const loop = state.sourceLoop
    const fadeIn = state.sourceFadeIn
    const fadeOut = state.sourceFadeOut
    state.sourceLoop = undefined
    state.sourceFadeIn = undefined
    state.sourceFadeOut = undefined
    try {
      if (loop !== undefined) motion?.setIsLoop?.(loop)
    } catch {
      // Cached-motion cleanup must not break reset or transaction paths.
    }
    try {
      if (fadeIn !== undefined) motion?.setFadeInTime?.(fadeIn)
    } catch {
      // Same containment rule for cached fade cleanup.
    }
    try {
      if (fadeOut !== undefined) motion?.setFadeOutTime?.(fadeOut)
    } catch {
      // Same containment rule for cached fade cleanup.
    }
    state.motion = undefined
  }

  /** Capture actual live values and start the fixed settle (SPEC §7): wired
   *  parameters ease to their still-current targets, unwired ones and Parts
   *  ease to defaults on the cancellation family or persist on completion. */
  private beginSettle(state: ManagedState, toDefaults: boolean): void {
    const core = this.core()
    const params = core._model.parameters
    const parts = core._model.parts
    state.phase = 'settling'
    state.settle = {
      elapsedMs: 0,
      from: Array.from({ length: this.inventory.length }, (_, i) => params.values[i]),
      fromParts: Array.from({ length: parts.count }, (_, i) => parts.opacities[i]),
      toDefaults,
      done: false
    }
    this.managed = state
  }

  private beginDefaultContainment(): void {
    const state: ManagedState = {
      faceIds: new Set(),
      authoredIds: null,
      displacement: 1,
      tempo: 1,
      phase: 'settling',
      startPending: false,
      elapsedMs: 0,
      deadlineMs: 0,
      resolve: null
    }
    this.beginSettle(state, true)
  }

  private resetRestoredBody(pendingManaged?: ManagedState): void {
    if (!this.model) return
    try {
      const core = this.core()
      this.inventory.forEach((p, i) => core.setParameterValueByIndex(i, p.default, 1))
      this.partDefaults.forEach((opacity, i) => core.setPartOpacityByIndex(i, opacity))
    } catch {
      // Contained: rollback must never throw past transaction state.
    }
    if (!pendingManaged) return
    try {
      ;(this.model.internalModel.motionManager as unknown as Cubism4ManagerLike).stopAllMotions()
      if (pendingManaged.startPending) this.beginSettle(pendingManaged, true)
      else this.restoreManagedMotion(pendingManaged)
    } catch {
      try {
        this.beginSettle(pendingManaged, true)
      } catch {
        // The restored body remains usable even if its private SDK state is malformed.
      }
    }
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
    const dt = this.app.ticker.deltaMS
    const mm = this.managed
    // Feeds the model's delta budget; the actual update (and our writeParams
    // hook inside it) runs when pixi renders the model. Tempo scales this
    // shared delta while a phrase plays — the E5-proven mechanism: authored
    // phase relationships and the downstream physics response scale together
    // (SPEC §5); breath/blink/sway live on the stage clock and are untouched.
    this.model.update(mm?.phase === 'playing' ? dt * mm.tempo : dt)
    if (!mm || this.managed !== mm) return
    if (mm.phase === 'playing') {
      mm.elapsedMs += dt
      const manager = this.model.internalModel.motionManager as unknown as Cubism4ManagerLike
      if (!manager.playing || mm.elapsedMs >= mm.deadlineMs) {
        let stopFailed = false
        if (manager.playing) {
          // Watchdog: the finish never arrived; force one-cycle semantics.
          try {
            manager.stopAllMotions()
          } catch {
            stopFailed = true
            // Contained: settlement still proceeds from live values.
          }
        }
        if (!stopFailed) this.restoreManagedMotion(mm)
        mm.resolve?.(true)
        mm.resolve = null
        this.beginSettle(mm, stopFailed)
      }
    } else if (mm.phase === 'settling' && mm.settle) {
      if (mm.settle.done) {
        if (mm.startPending) return
        if (mm.settle.toDefaults) {
          this.partsDirty = false
          // A contained stop failure may leave the SDK motion alive. Keep the
          // completed settle owning its final values until the manager stops.
          const manager = this.model.internalModel.motionManager as unknown as Cubism4ManagerLike
          if (manager.playing) return
        }
        this.restoreManagedMotion(mm)
        this.managed = undefined
      } else {
        mm.settle.elapsedMs += dt
      }
    }
  }

  // Called from inside the model's update pass — see the hook in load().
  // Ordering is the ownership contract (SPEC §7): displacement rescale of the
  // motion's primary writes, then the settle blend, then feel-owned overrides
  // (face wins over motion by coming later), then expression — all before
  // physics/pose evaluate.
  private writeParams(): void {
    const core = this.core()
    const mm = this.managed
    const managerPlaying =
      mm?.phase === 'playing' &&
      (this.model?.internalModel.motionManager as unknown as Cubism4ManagerLike | undefined)
        ?.playing === true
    // Scale only parameters this motion authors, and only frames it actually
    // wrote: a persisted (non-authored, or finish-frame) value rescaled every
    // frame would compound toward rig default instead of holding.
    if (mm?.phase === 'playing' && mm.displacement !== 1 && managerPlaying && mm.authoredIds) {
      const values = core._model.parameters.values
      for (const id of mm.authoredIds) {
        const i = this.paramIndex.get(id)
        if (i === undefined) continue
        const p = this.inventory[i]
        const scaled = p.default + (values[i] - p.default) * mm.displacement
        core.setParameterValueByIndex(i, clamp(scaled, p.min, p.max), 1)
      }
    }
    if (mm?.phase === 'settling' && mm.settle) {
      const s = mm.settle
      const w = smooth01(s.elapsedMs / SETTLE_MS)
      for (let i = 0; i < this.inventory.length; i++) {
        const p = this.inventory[i]
        if (mm.faceIds.has(p.id)) continue
        const override = this.overrides.get(p.id)
        const target = override ? override.value : s.toDefaults ? p.default : null
        if (target === null) continue // completed phrase: unwired values persist
        core.setParameterValueByIndex(i, s.from[i] + (target - s.from[i]) * w, 1)
      }
      if (s.toDefaults) {
        const parts = core._model.parts
        for (let i = 0; i < parts.count; i++) {
          const d = this.partDefaults[i] ?? 1
          core.setPartOpacityByIndex(i, s.fromParts[i] + (d - s.fromParts[i]) * w)
        }
      }
      if (w >= 1) s.done = true
    }
    for (const [id, o] of this.overrides) {
      // While a phrase starts/plays the motion owns non-face parameters; while
      // it settles the blend above owns them. Face overrides always land.
      if (mm && !mm.faceIds.has(id)) continue
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

  private fit(): void {
    if (!this.model) return
    const { width, height } = this.app.screen
    this.model.scale.set(1)
    const scale = Math.min(
      width / this.model.width,
      Math.min(height, DEFAULT_LAR_HEIGHT * this.displayScale) / this.model.height
    )
    this.model.scale.set(scale)
    this.model.x = (width - this.model.width) / 2
    this.model.y = (height - this.model.height) / 2
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
