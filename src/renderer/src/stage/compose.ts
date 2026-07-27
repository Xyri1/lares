// Expression compositing (root SPEC §4 expression stack, slice SPEC §5).
// Pure: no DOM, no Live2D, no wall clock, no randomness — time arrives as
// `tMs` and the fade state is threaded in and out, so the replay path stays
// deterministic by construction (002-D3).
//
// Precedence, lowest to highest — every driven parameter is composed here and
// nowhere else, so preview and playback cannot disagree:
//
//   1. model defaults      — for parameters no layer below the top drives
//   2. trend curves        }  the synth's per-frame output, arriving as `base`
//   3. idle modulation     }  (breath / blink / sway are already folded in)
//   4. expression stack    — the feed's stack, front entry wins
//   5. preview override    — a panel preview is just an entry pushed in front
//
// Only the front *resolvable* entry drives the face at a time; switching
// entries (including a preempting awaiting_input/error baseline, which main
// resolves to a real cue name before it reaches us) cross-fades from whatever
// was on screen to the new one over FADE_MS.

/** One expression-stack entry as it crosses the feed (root SPEC §4). */
export interface StackEntry {
  cueOrFreeform: string | { params: Record<string, number>; label?: string }
  weight: number
  expiryMs: number
}

/** Cue name → raw parameter set, straight from the manifest. Cue→params
 * resolution is body-side knowledge and stays here (P6). */
export type CueParams = Readonly<Record<string, Readonly<Record<string, number>>>>

/** = PREEMPT_FADE_MS in src/main/affect/constants.ts. One number covers both
 * cases: a preempt replacing the current expression is just another switch. */
export const FADE_MS = 300

/** Cross-fade state, threaded frame to frame. Opaque to callers. */
export interface FadeState {
  /** Stable visual key currently faded in, '' for "nothing". */
  key: string
  weight: number
  params: Record<string, number>
  /** Composed values of the previous overlay, frozen at the switch instant. */
  from: Record<string, number>
  sinceMs: number
}

export function initialFade(): FadeState {
  return { key: '', weight: 1, params: {}, from: {}, sinceMs: -Infinity }
}

interface ActiveExpression {
  key: string
  params: Readonly<Record<string, number>>
  weight: number
}

/** First renderable, unexpired cue or opaque freeform knob set. */
function activeEntry(
  stack: readonly StackEntry[],
  cues: CueParams,
  tMs: number
): ActiveExpression | null {
  for (const e of stack) {
    // A non-number expiry (Infinity survives IPC, null survives a JSON round
    // trip) means "no expiry" — never "expired" (P7: tolerate the wire).
    const expiry = typeof e.expiryMs === 'number' ? e.expiryMs : Infinity
    if (expiry <= tMs) continue
    if (typeof e.cueOrFreeform === 'string') {
      const params = cues[e.cueOrFreeform]
      if (params) return { key: `cue:${e.cueOrFreeform}`, params, weight: e.weight }
      continue
    }
    const params = e.cueOrFreeform.params
    const key = Object.keys(params)
      .sort()
      .map((id) => `${id}:${params[id]}`)
      .join('|')
    return { key: `freeform:${key}`, params, weight: e.weight }
  }
  return null
}

/** Absolute target value of one overlay parameter: the cue value pulled
 * `weight` of the way from whatever the layers below produced. */
function overlayTarget(
  overlay: Readonly<Record<string, number>>,
  weight: number,
  id: string,
  below: number
): number {
  const v = overlay[id]
  return v === undefined ? below : below + (v - below) * weight
}

/**
 * Compose one frame.
 *
 * @param base    synth output for this frame (trend curves + idle modulation)
 * @param defaults model parameter defaults, for ids no lower layer drives
 * @param stack   the feed's expression stack, front first (preview prepended)
 * @param tMs     frame time — scenario time in replay, wall time live
 * @param prev    fade state from the previous frame
 */
export function composeFrame(
  cues: CueParams,
  base: Record<string, number>,
  defaults: Readonly<Record<string, number>>,
  stack: readonly StackEntry[],
  tMs: number,
  prev: FadeState
): { params: Record<string, number>; state: FadeState } {
  const below = (id: string): number => base[id] ?? defaults[id] ?? 0
  const active = activeEntry(stack, cues, tMs)
  const key = active?.key ?? ''
  const weight = active ? active.weight : 1
  const params = active ? { ...active.params } : {}

  let state = prev
  if (key !== prev.key || weight !== prev.weight) {
    // Freeze what is on screen right now and fade from there to the new target.
    const from: Record<string, number> = {}
    const k = fadeFactor(prev, tMs)
    for (const id of overlayIds(prev.from, prev.params)) {
      const a = prev.from[id] ?? below(id)
      const b = overlayTarget(prev.params, prev.weight, id, below(id))
      from[id] = a + (b - a) * k
    }
    state = { key, weight, params, from, sinceMs: tMs }
  }

  const k = fadeFactor(state, tMs)
  const result = { ...base }
  for (const id of overlayIds(state.from, state.params)) {
    const a = state.from[id] ?? below(id)
    const b = overlayTarget(state.params, state.weight, id, below(id))
    result[id] = a + (b - a) * k
  }
  // Once the fade has landed, the outgoing set has reached its resting value
  // (the layer below, i.e. the model default for cue-only ids) and can be
  // dropped — the last frame emitted it, so nothing is left stranded.
  if (k >= 1 && Object.keys(state.from).length > 0) {
    state = { ...state, from: {} }
  }
  return { params: result, state }
}

function fadeFactor(state: FadeState, tMs: number): number {
  if (!Number.isFinite(state.sinceMs)) return 1
  const k = (tMs - state.sinceMs) / FADE_MS
  return k <= 0 ? 0 : k >= 1 ? 1 : k
}

// Union of the outgoing set and the incoming cue's set, outgoing first, so
// key order in the composed frame is a pure function of the inputs (the synth
// trace's byte format depends on it).
function overlayIds(
  from: Readonly<Record<string, number>>,
  overlay: Readonly<Record<string, number>>
): string[] {
  const ids = Object.keys(from)
  const seen = new Set(ids)
  for (const id of Object.keys(overlay)) if (!seen.has(id)) ids.push(id)
  return ids
}
