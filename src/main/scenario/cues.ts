import type { Vec2 } from '../affect/constants'

// Slice defaults (slice SPEC §7) — the character manifest
// (characters/hiyori/lar.character.json `expressions` block) is the runtime
// source of these coordinates; this fixture exists so scenario code (and its
// tests) can construct an AffectEngine without an async/Electron-flavored
// manifest load. cues.test.ts asserts the two stay in agreement.
export const SCENARIO_CUES: Record<string, Vec2> = {
  neutral: { valence: 0.1, arousal: 0.25 },
  focused: { valence: 0.2, arousal: 0.45 },
  frustrated: { valence: -0.5, arousal: 0.65 },
  dejected: { valence: -0.6, arousal: 0.2 },
  alert: { valence: 0.05, arousal: 0.7 },
  pleased: { valence: 0.55, arousal: 0.45 },
  weary: { valence: -0.15, arousal: 0.15 }
}
