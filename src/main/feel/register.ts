// Feel register (slice 013 SPEC §§1, 9, 12, 13) — the latched tuple per
// session key, its durable file format, attribution of an MCP call to a
// session, and the live feed's on-change gate. Pure: no Electron, no clock, no
// IO. Time and persistence arrive from the caller. The register is a latch:
// nothing but a valid report writes it, and nothing decays it (013-D7).
import type { SessionRow } from '../sessions/ingest'

/** Wire integers in {-2..2} — stored and fed raw, never normalized (§12). */
export type FeelTuple = { valence: number; activation: number; control: number }

export type Latch = FeelTuple & { at: number }

/** `feel.json`, format v1 (§12). */
export type FeelFile = { v: 1; latches: Record<string, Latch> }

/** One report per attributed session per 2s (§8, default). */
export const FEEL_SPACING_MS = 2000

/** Storage hygiene for old sessions, never decay (§12, default). */
export const LATCH_CAPACITY = 64

export type FeelResult = { status: 'latched' } | { status: 'rejected'; waitMs: number }

const AXES = ['valence', 'activation', 'control'] as const

/**
 * P7: ingress is validated here as well as by the tool schema — three required
 * integers in {-2..2}, or nothing. Extra properties are the schema's business.
 */
export function parseTuple(raw: unknown): FeelTuple | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const value = raw as Record<string, unknown>
  const tuple = { valence: 0, activation: 0, control: 0 }
  for (const axis of AXES) {
    const n = value[axis]
    if (typeof n !== 'number' || !Number.isInteger(n) || n < -2 || n > 2) return null
    tuple[axis] = n
  }
  return tuple
}

/** Parses `feel.json`; anything malformed yields an empty register (§12). */
export function parseFeelFile(raw: unknown): Map<string, Latch> {
  const latches = new Map<string, Latch>()
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return latches
  const stored = (raw as Record<string, unknown>).v === 1 ? (raw as FeelFile).latches : undefined
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) return latches
  for (const [key, value] of Object.entries(stored as Record<string, unknown>)) {
    const tuple = parseTuple(value)
    if (!tuple || key.startsWith('mcp:')) continue
    const at = (value as Record<string, unknown>).at
    if (typeof at !== 'number' || !Number.isFinite(at)) continue
    latches.set(key, { ...tuple, at })
  }
  return latches
}

export class FeelRegister {
  private readonly latches = new Map<string, Latch>()

  /** `persist` receives the storable file on every accepted report. */
  constructor(private readonly persist: (file: FeelFile) => void = () => {}) {}

  /** Boot restore (§12, 013-S9) — no new report, no clock. */
  restore(latches: Iterable<[string, Latch]>): void {
    for (const [key, latch] of latches) this.latches.set(key, latch)
    this.evict()
  }

  /**
   * A valid tuple atomically replaces the key's value; an invalid one throws
   * and a rate-capped one is refused with the wait — neither touches the
   * latch, and there is no partial update (§1, §8).
   */
  tryFeel(key: string, raw: unknown, nowMs: number): FeelResult {
    const tuple = parseTuple(raw)
    if (!tuple) throw new Error('valence, activation and control must be integers from -2 to 2')
    const held = this.latches.get(key)
    // A stored timestamp ahead of the clock must not lock the key out forever.
    const sinceMs = held === undefined ? Infinity : nowMs - held.at
    if (sinceMs >= 0 && sinceMs < FEEL_SPACING_MS) {
      return { status: 'rejected', waitMs: FEEL_SPACING_MS - sinceMs }
    }
    this.latches.set(key, { ...tuple, at: nowMs })
    this.evict()
    this.persist(this.file())
    return { status: 'latched' }
  }

  /** Checkpoint and status lookup for one session key (§8, §10). */
  get(key: string): Latch | undefined {
    return this.latches.get(key)
  }

  /** Display selection v1: the most recent valid report across all keys (§9). */
  displayed(): Latch | undefined {
    let best: Latch | undefined
    for (const latch of this.latches.values()) if (!best || latch.at > best.at) best = latch
    return best
  }

  /** The storable half — volatile `mcp:*` keys never reach disk (§9, §12). */
  file(): FeelFile {
    const latches: Record<string, Latch> = {}
    for (const [key, latch] of this.latches) {
      if (!key.startsWith('mcp:')) latches[key] = { ...latch }
    }
    return { v: 1, latches }
  }

  // Keeps the most recent LATCH_CAPACITY keys by `at`, so the displayed key is
  // retained by definition. ponytail: linear scan per eviction, fine at 64.
  private evict(): void {
    while (this.latches.size > LATCH_CAPACITY) {
      let oldest: string | undefined
      let oldestAt = Infinity
      for (const [key, latch] of this.latches) {
        if (latch.at < oldestAt) {
          oldestAt = latch.at
          oldest = key
        }
      }
      this.latches.delete(oldest!)
    }
  }
}

/**
 * On-change gate for the live feed (§13). A tick emits only when the displayed
 * tuple or the resolved operational state moved — a change the session sweep
 * produced included. `reset` forces the next tick through, for whenever
 * something else has owned the channel or a body has just come up.
 */
export class FeedGate {
  private last: string | null = null

  changed(feel: FeelTuple | null, operational: string): boolean {
    const key = JSON.stringify([feel, operational])
    if (key === this.last) return false
    this.last = key
    return true
  }

  reset(): void {
    this.last = null
  }
}

/**
 * MCP carries no harness session id (§9): attribute a call to the session
 * whose turn is open, else to the most recently active one; several candidates
 * resolve to the most recent. An empty table returns null and the caller
 * latches under a volatile `mcp:` key — a documented degradation, never
 * patched by guessing.
 */
export function attribute(rows: readonly SessionRow[]): string | null {
  const open = rows.filter((row) => row.turnOpen)
  let best: SessionRow | undefined
  for (const row of open.length > 0 ? open : rows) {
    if (!best || row.last_event_at >= best.last_event_at) best = row
  }
  return best === undefined ? null : `${best.harness}:${best.session_id}`
}
