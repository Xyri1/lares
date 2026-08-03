// The brain's feel half (013 SPEC §§8–12): durable storage, MCP attribution,
// the prompt-submit checkpoint lookup, and the on-change live feed. Electron —
// windows, the session table, the clock — arrives through `FeelDeps`, so the
// whole file runs under vitest without an app.
import { readFileSync } from 'node:fs'
import { errorMessage } from '../errors'
import { atomicWrite } from '../fs'
import type { AffectFeedMessage } from '../scenario/player'
import type { SessionSummary } from '../sessions/ingest'
import {
  attribute,
  FeedGate,
  FeelRegister,
  FEEL_SPACING_MS,
  parseFeelFile,
  type FeelFile,
  type Latch
} from './register'

// A body starts listening for the feed a beat after it takes the channel: at
// boot, and again after a character switch, which resets its pose to the new
// neutral (§6). A single on-change message can sail past that gap, leaving the
// Lar neutral with a live overlay dropped (013-S9, P10). Resend every tick for
// a short window instead.
// ponytail: fixed window; a body:ready handshake would be exact if it drifts.
const FEED_WARMUP_MS = 2000

export interface FeelDeps {
  /** `userData/feel.json` (§12). */
  path: string
  /** The session table at `nowMs`: attribution and operational state (§9, §11). */
  state(nowMs: number): SessionSummary
  /** Defaults to an atomic write of `path`. */
  persist?(file: FeelFile): void
  warn?(message: string): void
  trace?(event: {
    source: 'feel'
    action: 'accepted' | 'rejected'
    session: string
    detail?: string
    feel?: { valence: number; activation: number; control: number }
  }): void
}

export interface Feel {
  /** The caller's attributed session and its latch — the feel half of `status()`. */
  attributed(mcpSessionId: string, nowMs: number): { session: string; feel: Latch | null }
  /** Validate, attribute, latch, persist; returns the acknowledgement sentence
   * (§8). Throws the tool error for an invalid tuple or a rate-capped call;
   * either way the latch is untouched. */
  report(args: unknown, mcpSessionId: string, nowMs: number): string
  /** Checkpoint lookup for one session key (§10) — keyed, never attributed. */
  checkpoint(sessionKey: string): Latch | undefined
  /** The feed message this tick owes the body, or null while nothing moved. */
  feed(nowMs: number): AffectFeedMessage | null
  /** Something else owns the channel; the next feed goes out regardless. */
  resetFeed(): void
  /** A body just took (or re-took) the channel: resend for a short window. */
  resend(nowMs: number): void
}

export function createFeel(deps: FeelDeps): Feel {
  const warn = deps.warn ?? ((message: string) => console.warn(message))
  const persist =
    deps.persist ??
    ((file: FeelFile) => {
      void atomicWrite(deps.path, file).catch((error) =>
        warn(`[lares] cannot write ${deps.path}: ${errorMessage(error)}`)
      )
    })
  const register = new FeelRegister(persist)

  // Boot restore (§12): a malformed or unreadable file starts empty with a
  // warning, never a crash. A missing file is the normal first run.
  try {
    const latches = parseFeelFile(JSON.parse(readFileSync(deps.path, 'utf8')))
    if (latches === null) warn(`[lares] ignoring malformed ${deps.path}; starting with no latches`)
    else register.restore(latches)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      warn(`[lares] ignoring unreadable ${deps.path}: ${errorMessage(error)}`)
    }
  }

  const gate = new FeedGate()
  let warmUntil = 0

  const attributed = (
    mcpSessionId: string,
    nowMs: number
  ): { session: string; feel: Latch | null } => {
    // An unattributable call still performs, under a volatile `mcp:` key (§9).
    const session = attribute(deps.state(nowMs).sessions) ?? `mcp:${mcpSessionId}`
    return { session, feel: register.get(session) ?? null }
  }

  return {
    attributed,
    report(args, mcpSessionId, nowMs) {
      const { session } = attributed(mcpSessionId, nowMs)
      let result
      try {
        result = register.tryFeel(session, args, nowMs)
      } catch (error) {
        deps.trace?.({ source: 'feel', action: 'rejected', session, detail: errorMessage(error) })
        throw error
      }
      if (result.status === 'rejected') {
        deps.trace?.({
          source: 'feel',
          action: 'rejected',
          session,
          detail: `spacing ${result.waitMs}ms`
        })
        throw new Error(
          `one feel per session every ${FEEL_SPACING_MS / 1000}s; wait ${Math.ceil(result.waitMs / 1000)}s`
        )
      }
      const latch = register.get(session)!
      deps.trace?.({
        source: 'feel',
        action: 'accepted',
        session,
        feel: {
          valence: latch.valence,
          activation: latch.activation,
          control: latch.control
        }
      })
      // §8: one short sentence naming the stored tuple. The session key is
      // internal bookkeeping and never crosses to the model.
      return `Latched valence ${latch.valence}, activation ${latch.activation}, control ${latch.control}.`
    },
    checkpoint(sessionKey) {
      // Volatile keys drive the display but never produce a checkpoint (§9, §10).
      return sessionKey.startsWith('mcp:') ? undefined : register.get(sessionKey)
    },
    feed(nowMs) {
      const latch = register.displayed()
      const feel =
        latch === undefined
          ? null
          : { valence: latch.valence, activation: latch.activation, control: latch.control }
      const operational = deps.state(nowMs).baseline
      if (nowMs < warmUntil) gate.reset()
      if (!gate.changed(feel, operational)) return null
      return { tick: Math.floor(nowMs / 100), feel, operational }
    },
    resetFeed() {
      gate.reset()
    },
    resend(nowMs) {
      warmUntil = nowMs + FEED_WARMUP_MS
    }
  }
}
