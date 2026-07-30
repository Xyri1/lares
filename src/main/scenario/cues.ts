import type { Vec2 } from '../affect/constants'

// Slice defaults (slice SPEC §7) — the tuning harness's own cue vocabulary,
// originally Hiyori's authored starter set (M2a). The golden scenarios under
// scenarios/ emote these names, so the coordinates are frozen for replay
// determinism; they are independent of whichever character package ships.
export const SCENARIO_CUES: Record<string, Vec2> = {
  neutral: { valence: 0.1, arousal: 0.25 },
  focused: { valence: 0.2, arousal: 0.45 },
  frustrated: { valence: -0.5, arousal: 0.65 },
  dejected: { valence: -0.6, arousal: 0.2 },
  alert: { valence: 0.05, arousal: 0.7 },
  pleased: { valence: 0.55, arousal: 0.45 },
  weary: { valence: -0.15, arousal: 0.15 }
}
