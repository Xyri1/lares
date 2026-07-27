// Affect engine — pure state, no Electron, no wall clock. Time arrives from the
// caller; decay math is Δt-based so correctness does not require exact 100ms steps.
import type { BaselineState } from './types'
import {
  BASELINE_NUDGES,
  CUE_HYSTERESIS,
  DECAY_HALF_LIFE_MS,
  MOOD_REST_SHIFT,
  MOOD_TAU_MS,
  QUEUE_CAP,
  REST_POINT,
  SATURATION_FACTOR,
  SATURATION_WINDOW_MS,
  type Vec2
} from './constants'

export interface FreeformExpression {
  params: Record<string, number>
  label?: string
}

export interface ExpressionEntry {
  cueOrFreeform: string | FreeformExpression
  weight: number
  expiryMs: number
}

export interface AffectSnapshot {
  E: Vec2
  M: Vec2
  baselineState: BaselineState
  expressionStack: ExpressionEntry[]
}

const PREEMPTING_STATES: ReadonlySet<BaselineState> = new Set(['awaiting_input', 'error'])

function clamp(v: Vec2): Vec2 {
  return {
    valence: Math.min(1, Math.max(-1, v.valence)),
    arousal: Math.min(1, Math.max(0, v.arousal))
  }
}

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.valence - b.valence, a.arousal - b.arousal)
}

export class AffectEngine {
  private E: Vec2 = { ...REST_POINT }
  private M: Vec2 = { ...REST_POINT }
  private baselineState: BaselineState = 'idle'
  private queue: ExpressionEntry[] = []
  private preempting: ExpressionEntry | null = null
  private lastTickMs: number
  private saturation = new Map<string, { cue: string; count: number; lastMs: number }>()
  private selectedCue: string | null = null

  constructor(
    private cues: Record<string, Vec2>,
    nowMs: number
  ) {
    this.lastTickMs = nowMs
  }

  tick(nowMs: number): void {
    const dtMs = nowMs - this.lastTickMs
    this.lastTickMs = nowMs
    if (dtMs > 0) {
      // decay toward the mood-shifted rest point E0' = E0 + shift·(M − E0)
      const rest: Vec2 = {
        valence: REST_POINT.valence + MOOD_REST_SHIFT * (this.M.valence - REST_POINT.valence),
        arousal: REST_POINT.arousal + MOOD_REST_SHIFT * (this.M.arousal - REST_POINT.arousal)
      }
      const keep = 0.5 ** (dtMs / DECAY_HALF_LIFE_MS)
      this.E = clamp({
        valence: rest.valence + (this.E.valence - rest.valence) * keep,
        arousal: rest.arousal + (this.E.arousal - rest.arousal) * keep
      })
      // mood: EMA of E
      const alpha = 1 - Math.exp(-dtMs / MOOD_TAU_MS)
      this.M = {
        valence: this.M.valence + (this.E.valence - this.M.valence) * alpha,
        arousal: this.M.arousal + (this.E.arousal - this.M.arousal) * alpha
      }
    }
    this.queue = this.queue.filter((e) => e.expiryMs > nowMs)
    for (const [source, entry] of this.saturation) {
      if (nowMs - entry.lastMs >= SATURATION_WINDOW_MS) this.saturation.delete(source)
    }
  }

  applyCueNudge(cue: string, source: string, nowMs: number, intensity = 1): void {
    const def = this.cues[cue]
    if (!def) return
    const prev = this.saturation.get(source)
    const count =
      prev && prev.cue === cue && nowMs - prev.lastMs < SATURATION_WINDOW_MS ? prev.count + 1 : 1
    this.saturation.set(source, { cue, count, lastMs: nowMs })
    const scale = intensity * SATURATION_FACTOR ** (count - 1)
    this.E = clamp({
      valence: this.E.valence + def.valence * scale,
      arousal: this.E.arousal + def.arousal * scale
    })
  }

  setBaselineState(state: BaselineState): void {
    if (state === this.baselineState) return
    this.baselineState = state
    const nudge = BASELINE_NUDGES[state]
    if (nudge) {
      this.E = clamp({
        valence: this.E.valence + nudge.valence,
        arousal: this.E.arousal + nudge.arousal
      })
    }
    // awaiting_input/error preempt the queue; the queue itself is untouched, so
    // it resumes (minus tick-expired entries) when the baseline moves on.
    this.preempting = PREEMPTING_STATES.has(state)
      ? { cueOrFreeform: state, weight: 1, expiryMs: Infinity }
      : null
  }

  enqueueExpression(
    cueOrFreeform: ExpressionEntry['cueOrFreeform'],
    weight: number,
    nowMs: number,
    durationMs: number
  ): boolean {
    this.queue = this.queue.filter((entry) => entry.expiryMs > nowMs)
    if (this.queue.length >= QUEUE_CAP) return false
    const startsAt = Math.max(nowMs, this.queue.at(-1)?.expiryMs ?? nowMs)
    this.queue.push({ cueOrFreeform, weight, expiryMs: startsAt + durationMs })
    return true
  }

  clearExpressions(): void {
    this.queue = []
  }

  selectCue(): string | null {
    let best: string | null = null
    let bestDist = Infinity
    for (const [name, pos] of Object.entries(this.cues)) {
      const d = dist(pos, this.E)
      if (d < bestDist) {
        best = name
        bestDist = d
      }
    }
    if (best === null) return null
    const current = this.selectedCue
    if (current !== null && current !== best && this.cues[current]) {
      // hysteresis: switch only when the new nearest wins by more than the margin
      if (dist(this.cues[current], this.E) - bestDist <= CUE_HYSTERESIS) return current
    }
    this.selectedCue = best
    return best
  }

  snapshot(): AffectSnapshot {
    const stack = this.preempting ? [this.preempting, ...this.queue] : this.queue
    return {
      E: { ...this.E },
      M: { ...this.M },
      baselineState: this.baselineState,
      expressionStack: stack.map((entry) => ({
        ...entry,
        cueOrFreeform:
          typeof entry.cueOrFreeform === 'string'
            ? entry.cueOrFreeform
            : {
                ...entry.cueOrFreeform,
                params: { ...entry.cueOrFreeform.params }
              }
      }))
    }
  }
}
