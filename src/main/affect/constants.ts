// Root SPEC §4 defaults. All numbers are tunable defaults, not contract.
import type { BaselineState } from './types'

export interface Vec2 {
  valence: number
  arousal: number
}

export const REST_POINT: Vec2 = { valence: 0.1, arousal: 0.25 }
export const DECAY_HALF_LIFE_MS = 45_000
export const MOOD_TAU_MS = 15 * 60_000
export const MOOD_REST_SHIFT = 0.5
export const BASELINE_NUDGES: Partial<Record<BaselineState, Vec2>> = {
  error: { valence: -0.3, arousal: 0.2 },
  awaiting_input: { valence: 0, arousal: 0.15 },
  done: { valence: 0.25, arousal: -0.05 }
}
export const SATURATION_WINDOW_MS = 60_000
export const SATURATION_FACTOR = 0.5
export const PREEMPT_FADE_MS = 300 // consumed by the performance feed, not by engine math
export const CUE_HYSTERESIS = 0.1
export const QUEUE_CAP = 4
