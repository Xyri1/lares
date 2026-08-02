// Feel → performance mapping (slice SPEC 013 §4). Pure: no Electron, no
// wall clock, no randomness — same (p, anchors, k) always yields the same
// pose, so property tests can freeze it. Placement mirrors synth/: this
// module stays renderer-generic and knows nothing about rig parameters.

import defaultAnchorsJson from './anchors.default.json'

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
