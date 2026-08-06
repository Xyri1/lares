// Phrase planner (slice 014 SPEC §§4–5). Pure: same (feel, choreography)
// always yields the same plan. Like computeTarget, it trusts
// already-normalized, already-validated input — no clock, no runtime state,
// no asset semantics ever reach selection.

import { CORNER_KEYS, cornerWeight, type Channel, type CornerKey } from './feel'

/** The six channels the feel target keeps writing while a phrase plays
 *  (SPEC §7); their wired rig parameters win over the motion's curves. */
export const FACE_CHANNELS: readonly Channel[] = [
  'mouthCurve',
  'mouthOpen',
  'browRaise',
  'browKnit',
  'eyeOpen',
  'gazeHeight'
]

/** One registered model motion (validated against the model3 at load). */
export interface ChoreographyRef {
  group: string
  index: number
}

/** A character's corner→motion map; missing corners use the fallback. */
export interface ChoreographyMap {
  fallback: ChoreographyRef
  anchors?: Partial<Record<CornerKey, ChoreographyRef>>
}

/** One complete phrase: which motion, how committed, how fast (SPEC §5). */
export interface PhrasePlan {
  group: string
  index: number
  displacement: number
  tempo: number
}

/**
 * Select the one phrase for a displayed feel, or none (SPEC §4). A corner
 * wins only when its projected trilinear weight exceeds 0.5 — the weights
 * sum to 1, so that is automatically the strict unique maximum; ties,
 * axis-only directions, and missing corner mappings all use the fallback.
 */
export function planPhrase(
  p: readonly [number, number, number] | null,
  choreography: ChoreographyMap | null | undefined
): PhrasePlan | null {
  if (!choreography || p === null) return null
  const { fallback, anchors } = choreography

  const m = Math.max(Math.abs(p[0]), Math.abs(p[1]), Math.abs(p[2]))
  if (m === 0) {
    // Semantic neutral: the fallback plays untouched (SPEC §5).
    return { group: fallback.group, index: fallback.index, displacement: 1, tempo: 1 }
  }

  const q: [number, number, number] = [p[0] / m, p[1] / m, p[2] / m]
  const corner = CORNER_KEYS.find((key) => cornerWeight(key, q) > 0.5)
  const ref = (corner !== undefined && anchors?.[corner]) || fallback
  return {
    group: ref.group,
    index: ref.index,
    displacement: 0.5 + 0.5 * m,
    tempo: 1 + 0.15 * p[1]
  }
}
