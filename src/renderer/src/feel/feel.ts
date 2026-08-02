// Feel → performance mapping (slice SPEC 013 §4). Pure: no Electron, no
// wall clock, no randomness — same (p, anchors, k) always yields the same
// pose, so property tests can freeze it. Placement mirrors synth/: this
// module stays renderer-generic and knows nothing about rig parameters.

import defaultAnchorsJson from './anchors.default.json'
import defaultOperationalJson from './operational.default.json'

/** The twelve performance channels (SPEC §2). Every channel is in [-1, 1]. */
export type Channel =
  | 'mouthCurve'
  | 'mouthOpen'
  | 'browRaise'
  | 'browKnit'
  | 'eyeOpen'
  | 'gazeHeight'
  | 'headPitch'
  | 'lean'
  | 'swayAmplitude'
  | 'breathRate'
  | 'breathDepth'
  | 'blinkRate'

export const CHANNELS: readonly Channel[] = [
  'mouthCurve',
  'mouthOpen',
  'browRaise',
  'browKnit',
  'eyeOpen',
  'gazeHeight',
  'headPitch',
  'lean',
  'swayAmplitude',
  'breathRate',
  'breathDepth',
  'blinkRate'
]

/** One full channel vector — a pose (SPEC §3). */
export type Pose = Record<Channel, number>

/** Sign-ordered (valence, activation, control) corner keys, plus neutral. */
export type CornerKey = '+++' | '++-' | '+-+' | '+--' | '-++' | '-+-' | '--+' | '---'
export type AnchorKey = 'neutral' | CornerKey

export const CORNER_KEYS: readonly CornerKey[] = [
  '+++',
  '++-',
  '+-+',
  '+--',
  '-++',
  '-+-',
  '--+',
  '---'
]
export const ANCHOR_KEYS: readonly AnchorKey[] = ['neutral', ...CORNER_KEYS]

/** Nine authored poses: neutral plus the eight cube corners (SPEC §3). */
export type AnchorSet = Record<AnchorKey, Pose>

/** Character override (SPEC §13): any subset of anchors, any subset of channels per anchor. */
export type AnchorOverrides = Partial<Record<AnchorKey, Partial<Pose>>>

const SIGN: Record<'+' | '-', 1 | -1> = { '+': 1, '-': -1 }

/** Trilinear corner weight w_s(q) = Π_i (1 + q_i·s_i) / 2 (SPEC §4). */
function cornerWeight(key: CornerKey, q: readonly [number, number, number]): number {
  let w = 1
  for (let i = 0; i < 3; i++) w *= (1 + q[i] * SIGN[key[i] as '+' | '-']) / 2
  return w
}

function clamp(x: number): number {
  return x < -1 ? -1 : x > 1 ? 1 : x
}

/**
 * Nine-anchor blend + expressiveness scale (SPEC §4). `p = (v, a, c)` is
 * already-normalized, already-validated input — this module trusts it.
 * `k` defaults to 1; `k ≤ 1` never needs the clamp, `k = 1` is exact.
 */
export function computeTarget(
  p: readonly [number, number, number],
  anchors: AnchorSet,
  k = 1
): Pose {
  const m = Math.max(Math.abs(p[0]), Math.abs(p[1]), Math.abs(p[2]))
  const neutral = anchors.neutral
  const raw = {} as Pose

  if (m === 0) {
    // q = p/m is undefined at the center; the spec fixes target = neutral.
    for (const ch of CHANNELS) raw[ch] = neutral[ch]
  } else {
    const q: [number, number, number] = [p[0] / m, p[1] / m, p[2] / m]
    const weights = CORNER_KEYS.map((key) => cornerWeight(key, q))
    for (const ch of CHANNELS) {
      let t = 0
      for (let i = 0; i < CORNER_KEYS.length; i++) t += weights[i] * anchors[CORNER_KEYS[i]][ch]
      raw[ch] = (1 - m) * neutral[ch] + m * t
    }
  }

  const out = {} as Pose
  for (const ch of CHANNELS) {
    // k === 1 short-circuits so anchor exactness survives floating rounding.
    const scaled = k === 1 ? raw[ch] : neutral[ch] + k * (raw[ch] - neutral[ch])
    out[ch] = clamp(scaled)
  }
  return out
}

/** Per-channel anchor merge (SPEC §13): unspecified channels fall back to the shipped default. */
export function mergeAnchors(defaults: AnchorSet, overrides?: AnchorOverrides): AnchorSet {
  if (!overrides) return defaults
  const merged = {} as AnchorSet
  for (const key of ANCHOR_KEYS) {
    merged[key] = { ...defaults[key], ...overrides[key] }
  }
  return merged
}

/** Shipped default anchor set (SPEC §3), seeded from research/human-feeling-space.md. */
export const DEFAULT_ANCHORS = defaultAnchorsJson as AnchorSet

// ---------------------------------------------------------------------------
// Operational overlay (SPEC §11)
// ---------------------------------------------------------------------------

/** The only two root §3 states that present visually in this slice. */
export type OperationalKey = 'awaiting_input' | 'error'

/** Highest root §3 priority first: awaiting_input outranks error (P10). */
export const OPERATIONAL_KEYS: readonly OperationalKey[] = ['awaiting_input', 'error']

export type OperationalPoses = Record<OperationalKey, Pose>
export type OperationalOverrides = Partial<Record<OperationalKey, Partial<Pose>>>

/** Shipped default overlay poses (SPEC §11). */
export const DEFAULT_OPERATIONAL = defaultOperationalJson as OperationalPoses

/** How much of the shown pose the overlay owns while it is up *(default)*. */
const OVERLAY_WEIGHT = 0.6

/**
 * Composite the operational overlay over a feel target (SPEC §11). States
 * without an overlay pass the target through untouched, so clearing one
 * reveals the unchanged latched target. `k` never reaches this side — an
 * awaiting_input Lar stays loud at any expressiveness (P10).
 */
export function withOverlay(target: Pose, operational: string, poses: OperationalPoses): Pose {
  const key = OPERATIONAL_KEYS.find((candidate) => candidate === operational)
  if (key === undefined) return target
  const overlay = poses[key]
  const out = {} as Pose
  for (const ch of CHANNELS) out[ch] = target[ch] + (overlay[ch] - target[ch]) * OVERLAY_WEIGHT
  return out
}

/** Per-channel overlay merge (SPEC §13) — same rule as `mergeAnchors`. */
export function mergeOperational(
  defaults: OperationalPoses,
  overrides?: OperationalOverrides
): OperationalPoses {
  if (!overrides) return defaults
  const merged = {} as OperationalPoses
  for (const key of OPERATIONAL_KEYS) merged[key] = { ...defaults[key], ...overrides[key] }
  return merged
}

// ---------------------------------------------------------------------------
// Transition (SPEC §6)
// ---------------------------------------------------------------------------

/** The one fixed travel every target and overlay change eases through. */
export const TRANSITION_MS = 700

// Critically damped: ~98% of a step is travelled within TRANSITION_MS (the
// 2% settling time of a critically damped second-order system is ≈ 5.8/ω).
const OMEGA = 6 / TRANSITION_MS

/**
 * One channel of the critically damped ease, exact rather than the usual
 * per-frame approximation — a long frame gap (throttled rAF, 64× replay)
 * lands on the analytic value instead of overshooting.
 */
export function easeStep(
  current: number,
  velocity: number,
  target: number,
  dtMs: number
): { value: number; velocity: number } {
  const d = current - target
  const decay = Math.exp(-OMEGA * dtMs)
  const c = velocity + OMEGA * d
  return {
    value: target + (d + c * dtMs) * decay,
    velocity: (velocity - OMEGA * c * dtMs) * decay
  }
}

// ---------------------------------------------------------------------------
// Character-supplied feel data (SPEC §13)
// ---------------------------------------------------------------------------

/** The character-owned half: anchor and overlay poses, already merged. */
export interface FeelPoses {
  anchors: AnchorSet
  operational: OperationalPoses
}

/** Plus expressiveness `k`, which is app config and is read once at launch. */
export interface FeelConfig extends FeelPoses {
  expressiveness: number
}

export const DEFAULT_FEEL: FeelConfig = {
  anchors: DEFAULT_ANCHORS,
  operational: DEFAULT_OPERATIONAL,
  expressiveness: 1
}

/** Override block shape check for the IPC crossing (P7): known keys, known
 * channels, values in range. Main already validates the same rules at load;
 * this is the body refusing to build a pose out of anything else. */
export function isPoseOverrides(value: unknown, keys: readonly string[]): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  return Object.entries(value).every(
    ([key, pose]) =>
      keys.includes(key) &&
      typeof pose === 'object' &&
      pose !== null &&
      !Array.isArray(pose) &&
      Object.entries(pose as Record<string, unknown>).every(
        ([channel, v]) =>
          (CHANNELS as readonly string[]).includes(channel) &&
          typeof v === 'number' &&
          v >= -1 &&
          v <= 1
      )
  )
}

/** Resolve a character bootstrap payload into the config the stage runs on.
 * Malformed data falls back to the shipped defaults rather than poisoning
 * every pose with NaN. */
export function resolveFeel(raw: {
  anchors?: unknown
  operational?: unknown
  expressiveness?: unknown
}): FeelConfig {
  const k = raw.expressiveness
  return {
    anchors: mergeAnchors(
      DEFAULT_ANCHORS,
      isPoseOverrides(raw.anchors, ANCHOR_KEYS) ? (raw.anchors as AnchorOverrides) : undefined
    ),
    operational: mergeOperational(
      DEFAULT_OPERATIONAL,
      isPoseOverrides(raw.operational, OPERATIONAL_KEYS)
        ? (raw.operational as OperationalOverrides)
        : undefined
    ),
    expressiveness: typeof k === 'number' && Number.isFinite(k) ? Math.min(10, Math.max(0, k)) : 1
  }
}
