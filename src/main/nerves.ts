import { AffectEngine, type AffectSnapshot, type FreeformExpression } from './affect/engine'
import type { Vec2 } from './affect/constants'
import { Ingestor, type PidProbe, type SessionSummary } from './sessions/ingest'
import type { EventEnvelope } from './sessions/mapEvent'

const DEFAULT_DURATION_S = 6
const MAX_DURATION_S = 30
const MAX_FREEFORM_PARAMS = 24
const EMOTE_SPACING_MS = 2000

interface ParamInfo {
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

export interface CueInfo extends Vec2 {
  name: string
  source: 'bundled'
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function finite(value: unknown, name: string, fallback: number): number {
  if (value === undefined) return fallback
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${name} must be a number`)
  return value
}

export class Nerves {
  private readonly engine: AffectEngine
  private readonly sessions: Ingestor
  private inventory: Map<string, ParamInfo> | null = null
  private readonly lastPlayedAt = new Map<string, number>()

  constructor(
    private readonly character: string,
    private readonly cues: Record<string, Vec2>,
    nowMs: number,
    pidProbe?: PidProbe
  ) {
    this.engine = new AffectEngine(cues, nowMs)
    this.sessions = pidProbe ? new Ingestor(this.engine, pidProbe) : new Ingestor(this.engine)
  }

  ingest(envelope: EventEnvelope, nowMs: number): void {
    this.sessions.ingest(envelope, nowMs)
  }

  tick(nowMs: number): void {
    this.sessions.sweep(nowMs)
    this.engine.tick(nowMs)
    for (const [source, lastPlayedAt] of this.lastPlayedAt) {
      if (nowMs - lastPlayedAt >= EMOTE_SPACING_MS) this.lastPlayedAt.delete(source)
    }
  }

  snapshot(): AffectSnapshot {
    const snapshot = this.engine.snapshot()
    const [head, ...rest] = snapshot.expressionStack
    if (
      !head ||
      typeof head.cueOrFreeform !== 'string' ||
      (head.cueOrFreeform !== 'awaiting_input' && head.cueOrFreeform !== 'error')
    ) {
      return snapshot
    }
    const cue = this.engine.selectCue()
    return cue === null
      ? snapshot
      : { ...snapshot, expressionStack: [{ ...head, cueOrFreeform: cue }, ...rest] }
  }

  setInventory(raw: unknown): boolean {
    if (!Array.isArray(raw)) return false
    const next = new Map<string, ParamInfo>()
    for (const value of raw) {
      if (!record(value)) return false
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
        return false
      }
      next.set(id, { id, name, min, max, default: defaultValue })
    }
    this.inventory = next
    return true
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
      if (typeof raw.cue !== 'string' || !raw.cue || !this.cues[raw.cue]) {
        throw new Error(`unknown cue "${String(raw.cue)}"`)
      }
      if (label !== undefined) throw new Error('label is only valid with params')
      expression = raw.cue
    } else {
      if (!record(raw.params)) throw new Error('params must be an object')
      const entries = Object.entries(raw.params)
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
      ...coordinates,
      source: 'bundled'
    }))
  }

  status(nowMs: number): {
    active_character: string
    sessions: SessionSummary
    protocol_version: 1
    active_expression: string | null
  } {
    const active = this.snapshot().expressionStack[0]?.cueOrFreeform
    return {
      active_character: this.character,
      sessions: this.sessions.summary(nowMs),
      protocol_version: 1,
      active_expression:
        active === undefined
          ? null
          : typeof active === 'string'
            ? active
            : (active.label ?? 'freeform')
    }
  }
}
