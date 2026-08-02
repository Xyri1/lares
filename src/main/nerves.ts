import { Ingestor, type PidProbe, type SessionSummary } from './sessions/ingest'
import type { EventEnvelope } from './sessions/mapEvent'

const MAX_FREEFORM_PARAMS = 24
const AUTHORING_PREVIEW_MS = 60_000

export interface ParamInfo {
  id: string
  name: string
  min: number
  max: number
  default: number
}

export type AuthoringPreview = { params: Record<string, number> }

export interface NervesOptions {
  preview?(value: AuthoringPreview): void
  revertPreview?(): void
}

export interface PreparedNervesCharacter {
  character: string
  inventory: Map<string, ParamInfo>
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

/**
 * Session ingestion, body inventory, and explicit authoring preview — what
 * remains of the brain's body-facing surface after slice 013 retired the
 * cue/emote affect engine (SPEC §7). The feel register and its attribution
 * (feel/register.ts) own the semantic side now; this class is root §3
 * liveness plus the physical parameter inventory a body reports in.
 */
export class Nerves {
  private readonly sessions: Ingestor
  private inventory: Map<string, ParamInfo> | null = null
  private previewExpiresAt: number | null = null

  constructor(
    private character: string,
    pidProbe?: PidProbe,
    private readonly options: NervesOptions = {}
  ) {
    this.sessions = pidProbe ? new Ingestor(pidProbe) : new Ingestor()
  }

  ingest(envelope: EventEnvelope, nowMs: number): void {
    this.sessions.ingest(envelope, nowMs)
  }

  /** Session table state — root §3 liveness and the feel attribution key. */
  sessionState(nowMs: number): SessionSummary {
    return this.sessions.summary(nowMs)
  }

  tick(nowMs: number): void {
    this.sessions.sweep(nowMs)
    if (this.previewExpiresAt !== null && nowMs >= this.previewExpiresAt) {
      this.previewExpiresAt = null
      this.options.revertPreview?.()
    }
  }

  setInventory(raw: unknown): boolean {
    const inventory = parseInventory(raw)
    if (!inventory) return false
    this.inventory = new Map(inventory.map((param) => [param.id, param]))
    return true
  }

  switchCharacter(character: string, inventory: readonly ParamInfo[]): void {
    this.commitCharacter(this.prepareCharacter(character, inventory))
  }

  prepareCharacter(character: string, inventory: readonly ParamInfo[]): PreparedNervesCharacter {
    return { character, inventory: new Map(inventory.map((param) => [param.id, { ...param }])) }
  }

  commitCharacter(prepared: PreparedNervesCharacter): void {
    this.character = prepared.character
    this.inventory = prepared.inventory
    this.previewExpiresAt = null
    try {
      this.options.revertPreview?.()
    } catch {
      // Commit is intentionally nonthrow after the body becomes visible.
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

  /** Explicit user-invoked authoring only (SPEC §8): raw params, held then
   * auto-reverted, or an empty call reverts immediately. */
  previewExpression(raw: unknown, nowMs: number): { status: 'previewing' | 'reverted' } {
    if (!record(raw)) throw new Error('preview_expression arguments must be an object')
    if (Object.keys(raw).length === 0) {
      this.previewExpiresAt = null
      this.options.revertPreview?.()
      return { status: 'reverted' }
    }
    if (!Object.hasOwn(raw, 'params')) throw new Error('params is required')
    const params = this.clampParams(raw.params)
    this.options.preview?.({ params })
    this.previewExpiresAt = nowMs + AUTHORING_PREVIEW_MS
    return { status: 'previewing' }
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

  status(): { active_character: string; protocol_version: 2 } {
    return { active_character: this.character, protocol_version: 2 }
  }
}
