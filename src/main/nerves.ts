import { AffectEngine, type AffectSnapshot, type FreeformExpression } from './affect/engine'
import type { CueCoordinates } from './characters/manifest'
import { Ingestor, type PidProbe, type SessionSummary } from './sessions/ingest'
import type { EventEnvelope } from './sessions/mapEvent'

const DEFAULT_DURATION_S = 6
const MAX_DURATION_S = 30
const MAX_FREEFORM_PARAMS = 24
const EMOTE_SPACING_MS = 2000
const AUTHORING_PREVIEW_MS = 60_000

export interface ParamInfo {
  id: string
  name: string
  min: number
  max: number
  default: number
}

export interface EmoteResult {
  status: 'played' | 'coalesced'
  warning?: string
}

export interface CueInfo {
  name: string
  valence: number | null
  arousal: number | null
  calibrated: boolean
  source: 'bundled' | 'authored' | 'raw'
}

export type CuePlayback = { params: Record<string, number> } | { motion: string }
export type AuthoringPreview = { params: Record<string, number> } | { cue: string }

export interface NervesOptions {
  cueSources?: Readonly<Record<string, CueInfo['source']>>
  resolveCue?: (
    cue: string,
    defaults: Readonly<Record<string, number>>,
    inventory: ReadonlyMap<string, ParamInfo>
  ) => CuePlayback | undefined
  preview?(value: AuthoringPreview): void
  revertPreview?(): void
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseInventory(raw: unknown): ParamInfo[] | null {
  if (!Array.isArray(raw)) return null
  const inventory: ParamInfo[] = []
  for (const value of raw) {
    if (!record(value)) return null
    const { id, name, min, max, default: defaultValue } = value
    if (
      typeof id !== 'string' ||
      !id ||
      typeof name !== 'string' ||
      typeof min !== 'number' ||
      !Number.isFinite(min) ||
      typeof max !== 'number' ||
      !Number.isFinite(max) ||
      min > max ||
      typeof defaultValue !== 'number' ||
      !Number.isFinite(defaultValue)
    ) {
      return null
    }
    inventory.push({ id, name, min, max, default: defaultValue })
  }
  return inventory
}

function finite(value: unknown, name: string, fallback: number): number {
  if (value === undefined) return fallback
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${name} must be a number`)
  return value
}

export class Nerves {
  private readonly engine: AffectEngine
  private readonly sessions: Ingestor
  private readonly cues: Record<string, CueCoordinates>
  private inventory: Map<string, ParamInfo> | null = null
  private readonly resolvedCues = new Map<string, CuePlayback>()
  private cueErrors: string[] = []
  private cueSources: Record<string, CueInfo['source']>
  private readonly lastPlayedAt = new Map<string, number>()
  private previewExpiresAt: number | null = null

  constructor(
    private character: string,
    cues: Record<string, CueCoordinates>,
    nowMs: number,
    pidProbe?: PidProbe,
    private readonly options: NervesOptions = {}
  ) {
    this.cues = { ...cues }
    this.engine = new AffectEngine(this.cues, nowMs)
    this.sessions = pidProbe ? new Ingestor(this.engine, pidProbe) : new Ingestor(this.engine)
    this.cueSources = { ...options.cueSources }
  }

  ingest(envelope: EventEnvelope, nowMs: number): void {
    this.sessions.ingest(envelope, nowMs)
  }

  tick(nowMs: number): void {
    this.sessions.sweep(nowMs)
    this.engine.tick(nowMs)
    if (this.previewExpiresAt !== null && nowMs >= this.previewExpiresAt) {
      this.previewExpiresAt = null
      this.options.revertPreview?.()
    }
    for (const [source, lastPlayedAt] of this.lastPlayedAt) {
      if (nowMs - lastPlayedAt >= EMOTE_SPACING_MS) this.lastPlayedAt.delete(source)
    }
  }

  snapshot(): AffectSnapshot {
    const snapshot = this.engine.snapshot()
    const [head, ...rest] = snapshot.expressionStack
    let resolved = snapshot
    if (
      head &&
      typeof head.cueOrFreeform === 'string' &&
      (head.cueOrFreeform === 'awaiting_input' || head.cueOrFreeform === 'error')
    ) {
      const cue = this.engine.selectCue()
      if (cue !== null) {
        resolved = {
          ...snapshot,
          expressionStack: [{ ...head, cueOrFreeform: cue }, ...rest]
        }
      }
    }
    return {
      ...resolved,
      expressionStack: resolved.expressionStack.map((entry) => {
        if (typeof entry.cueOrFreeform !== 'string') return entry
        const playback = this.resolvedCues.get(entry.cueOrFreeform)
        return playback && 'params' in playback
          ? {
              ...entry,
              cueOrFreeform: { params: { ...playback.params }, label: entry.cueOrFreeform }
            }
          : entry
      })
    }
  }

  setInventory(raw: unknown): boolean {
    const inventory = parseInventory(raw)
    if (!inventory) return false
    this.inventory = new Map(inventory.map((param) => [param.id, param]))
    this.resolveCues()
    return true
  }

  reloadCues(
    cues: Record<string, CueCoordinates>,
    sources: Readonly<Record<string, CueInfo['source']>>
  ): void {
    for (const cue of Object.keys(this.cues)) delete this.cues[cue]
    Object.assign(this.cues, cues)
    this.cueSources = { ...sources }
    this.resolveCues()
  }

  switchCharacter(
    character: string,
    cues: Record<string, CueCoordinates>,
    sources: Readonly<Record<string, CueInfo['source']>>,
    inventory: readonly ParamInfo[]
  ): void {
    this.character = character
    this.inventory = new Map(inventory.map((param) => [param.id, { ...param }]))
    this.reloadCues(cues, sources)
    this.engine.clearExpressions()
    this.lastPlayedAt.clear()
    this.previewExpiresAt = null
    this.options.revertPreview?.()
  }

  cueValidationErrors(): string[] {
    return [...this.cueErrors]
  }

  private resolveCues(): void {
    this.resolvedCues.clear()
    this.cueErrors = []
    if (!this.options.resolveCue || !this.inventory) return
    const defaults = Object.fromEntries(
      [...this.inventory].map(([id, info]) => [id, info.default])
    )
    for (const cue of Object.keys(this.cues)) {
      let resolved: CuePlayback | undefined
      try {
        resolved = this.options.resolveCue(cue, defaults, this.inventory)
      } catch (error) {
        this.cueErrors.push(error instanceof Error ? error.message : String(error))
        continue
      }
      if (!resolved) continue
      if ('motion' in resolved) {
        this.resolvedCues.set(cue, resolved)
        continue
      }
      const params: Record<string, number> = {}
      for (const [id, value] of Object.entries(resolved.params)) {
        const info = this.inventory.get(id)
        if (info && Number.isFinite(value)) {
          params[id] = Math.min(info.max, Math.max(info.min, value))
        }
      }
      if (Object.keys(params).length > 0) this.resolvedCues.set(cue, { params })
    }
  }

  listParameters(): Array<{
    id: string
    display_name: string
    min: number
    max: number
    default: number
  }> {
    if (this.inventory === null) throw new Error('body inventory is not available yet')
    return [...this.inventory.values()].map(({ id, name, min, max, default: defaultValue }) => ({
      id,
      display_name: name,
      min,
      max,
      default: defaultValue
    }))
  }

  previewExpression(raw: unknown, nowMs: number): { status: 'previewing' | 'reverted' | 'played' } {
    if (!record(raw)) throw new Error('preview_expression arguments must be an object')
    if (Object.keys(raw).length === 0) {
      this.previewExpiresAt = null
      this.options.revertPreview?.()
      return { status: 'reverted' }
    }
    const hasCue = Object.hasOwn(raw, 'cue')
    const hasParams = Object.hasOwn(raw, 'params')
    if (hasCue === hasParams) throw new Error('exactly one of cue or params is required')
    if (this.inventory === null) throw new Error('body inventory is not available yet')

    if (hasParams) {
      const params = this.clampParams(raw.params)
      this.options.preview?.({ params })
      this.previewExpiresAt = nowMs + AUTHORING_PREVIEW_MS
      return { status: 'previewing' }
    }

    if (typeof raw.cue !== 'string' || !raw.cue || !Object.hasOwn(this.cues, raw.cue)) {
      throw new Error(`unknown cue "${String(raw.cue)}"`)
    }
    const playback = this.resolvedCues.get(raw.cue)
    if (playback && 'params' in playback) {
      this.options.preview?.({ params: playback.params })
      this.previewExpiresAt = nowMs + AUTHORING_PREVIEW_MS
      return { status: 'previewing' }
    }
    if (playback && 'motion' in playback) {
      this.options.preview?.({ cue: raw.cue })
      this.previewExpiresAt = null
      return { status: 'played' }
    }
    throw new Error(`cue "${raw.cue}" has no parameters in the active body`)
  }

  clampParams(raw: unknown): Record<string, number> {
    if (!record(raw)) throw new Error('params must be an object')
    const entries = Object.entries(raw)
    if (entries.length > MAX_FREEFORM_PARAMS) {
      throw new Error(`params exceeds the ${MAX_FREEFORM_PARAMS}-parameter cap`)
    }
    if (this.inventory === null) throw new Error('body inventory is not available yet')
    const params: Record<string, number> = {}
    for (const [id, value] of entries) {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(`params.${id} must be a number`)
      }
      const info = this.inventory.get(id)
      if (info) params[id] = Math.min(info.max, Math.max(info.min, value))
    }
    if (Object.keys(params).length === 0) throw new Error('params contains no known body parameters')
    return params
  }

  emote(raw: unknown, source: string, nowMs: number): EmoteResult {
    if (!record(raw)) throw new Error('emote arguments must be an object')
    const hasCue = Object.hasOwn(raw, 'cue')
    const hasParams = Object.hasOwn(raw, 'params')
    if (hasCue === hasParams) throw new Error('exactly one of cue or params is required')

    const durationS = Math.min(MAX_DURATION_S, Math.max(0, finite(raw.duration_s, 'duration_s', DEFAULT_DURATION_S)))
    const queue = raw.queue ?? true
    if (typeof queue !== 'boolean') throw new Error('queue must be a boolean')
    const intensity = Math.min(1, Math.max(0, finite(raw.intensity, 'intensity', 1)))
    const label = raw.label
    if (label !== undefined && (typeof label !== 'string' || label.length > 80)) {
      throw new Error('label must be a string of at most 80 characters')
    }

    let expression: string | FreeformExpression
    let warning: string | undefined
    if (hasCue) {
      if (typeof raw.cue !== 'string' || !raw.cue || !Object.hasOwn(this.cues, raw.cue)) {
        throw new Error(`unknown cue "${String(raw.cue)}"`)
      }
      if (label !== undefined) throw new Error('label is only valid with params')
      expression = raw.cue
    } else {
      const params = this.clampParams(raw.params)
      expression = { params, ...(label === undefined ? {} : { label }) }
      if (raw.intensity !== undefined) warning = 'intensity is ignored for params'
    }

    const lastPlayedAt = this.lastPlayedAt.get(source)
    if (lastPlayedAt !== undefined && nowMs - lastPlayedAt < EMOTE_SPACING_MS) {
      if (typeof expression === 'string') {
        this.engine.applyCueNudge(expression, source, nowMs, intensity)
      }
      return { status: 'coalesced', ...(warning === undefined ? {} : { warning }) }
    }

    if (!queue) this.engine.clearExpressions()
    if (!this.engine.enqueueExpression(expression, typeof expression === 'string' ? intensity : 1, nowMs, durationS * 1000)) {
      throw new Error('expression queue is full')
    }
    if (typeof expression === 'string') {
      this.engine.applyCueNudge(expression, source, nowMs, intensity)
    }
    this.lastPlayedAt.set(source, nowMs)
    return { status: 'played', ...(warning === undefined ? {} : { warning }) }
  }

  listCues(): CueInfo[] {
    return Object.entries(this.cues).map(([name, coordinates]) => ({
      name,
      valence: coordinates?.valence ?? null,
      arousal: coordinates?.arousal ?? null,
      calibrated: coordinates !== null,
      source: this.cueSources[name] ?? 'bundled'
    }))
  }

  status(nowMs: number): {
    active_character: string
    sessions: SessionSummary
    protocol_version: 1
    active_expression: string | null
    uncalibrated_cues: number
  } {
    const active = this.snapshot().expressionStack[0]?.cueOrFreeform
    return {
      active_character: this.character,
      sessions: this.sessions.summary(nowMs),
      protocol_version: 1,
      uncalibrated_cues: Object.values(this.cues).filter((cue) => cue === null).length,
      active_expression:
        active === undefined
          ? null
          : typeof active === 'string'
            ? active
            : (active.label ?? 'freeform')
    }
  }
}
