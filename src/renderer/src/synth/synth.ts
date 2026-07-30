// Body-side synth (root SPEC §4 idle modulation + slice SPEC §5 rung-(a)
// trend curves). Pure: no pixi, no DOM, no Electron, no wall clock, no
// Math.random — time and randomness are injected, so replay determinism
// (002-D3) holds by construction. Live2D parameter ids arrive as preset
// DATA; this code stays renderer-generic (P6).

/** The slice of the performance feed the synth reads. */
export interface SynthFeed {
  E: { valence: number; arousal: number }
}

export interface TrendBinding {
  id: string
  source: 'valence' | 'arousal'
  gain: number
  offset: number
  /** Scales the whole contribution; defaults to 1. */
  weight?: number
}

/** Mapping preset (slice SPEC §5): data, not code — lives under presets/. */
export interface SynthPreset {
  params: TrendBinding[]
  idle: {
    breath: { id: string; basePeriodMs: number; amplitude: number }
    blink: {
      ids: string[]
      baseIntervalMs: number
      durationMs: number
      /** Eye-openness trend from valence: openness base = 1 + gain·valence. */
      valenceGain: number
    }
    sway: { id: string; baseAmplitude: number; periodMs: number }
  }
}

export function isSynthPreset(value: unknown): value is SynthPreset {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const preset = value as Partial<SynthPreset>
  const finite = (number: unknown): number is number =>
    typeof number === 'number' && Number.isFinite(number)
  if (
    !Array.isArray(preset.params) ||
    preset.params.some(
      (binding) =>
        typeof binding?.id !== 'string' ||
        binding.id === '' ||
        (binding.source !== 'valence' && binding.source !== 'arousal') ||
        !finite(binding.gain) ||
        !finite(binding.offset) ||
        (binding.weight !== undefined && !finite(binding.weight))
    )
  ) {
    return false
  }
  const { breath, blink, sway } = preset.idle ?? {}
  return (
    typeof breath?.id === 'string' &&
    breath.id !== '' &&
    finite(breath.basePeriodMs) &&
    breath.basePeriodMs > 0 &&
    finite(breath.amplitude) &&
    Array.isArray(blink?.ids) &&
    blink.ids.every((id) => typeof id === 'string' && id !== '') &&
    finite(blink.baseIntervalMs) &&
    blink.baseIntervalMs > 0 &&
    finite(blink.durationMs) &&
    blink.durationMs > 0 &&
    finite(blink.valenceGain) &&
    typeof sway?.id === 'string' &&
    sway.id !== '' &&
    finite(sway.baseAmplitude) &&
    finite(sway.periodMs) &&
    sway.periodMs > 0
  )
}

/** Uniform [0,1) source — mulberry32 in replay, Math.random live. */
export type Rng = () => number

// Standard mulberry32 — tiny seeded PRNG, plenty for blink jitter.
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface Synth {
  /**
   * Per-frame parameter values at time tMs (scenario time in replay, wall
   * time live). Output key order is stable: preset param list order, then
   * breath, blink ids, sway — the synth trace's byte format relies on it.
   */
  computeFrame(feed: SynthFeed, tMs: number): Record<string, number>
}

// Stateful across frames (breath phase, blink schedule) but deterministic:
// same preset + rng seed + (feed, tMs) sequence → same outputs.
export function createSynth(preset: SynthPreset, rng: Rng): Synth {
  let lastTMs: number | null = null
  let breathPhase = 0 // cycles
  let nextBlinkAtMs: number | null = null
  let blinkStartedAtMs = -Infinity
  const swayPhaseRad = rng() * 2 * Math.PI // seeded sway phase (slice SPEC §4)

  return {
    computeFrame(feed: SynthFeed, tMs: number): Record<string, number> {
      const { valence, arousal } = feed.E
      const out: Record<string, number> = {}

      // rung-(a) trend curves: value = (offset + gain·source) · weight
      for (const p of preset.params) {
        const src = p.source === 'valence' ? valence : arousal
        out[p.id] = (p.offset + p.gain * src) * (p.weight ?? 1)
      }

      // breath — rate = base · (0.7 + 0.6·arousal); phase accumulates so
      // rate changes bend the wave instead of jumping it.
      const dtMs = lastTMs === null ? 0 : Math.max(0, tMs - lastTMs)
      lastTMs = tMs
      const breath = preset.idle.breath
      breathPhase += ((0.7 + 0.6 * arousal) / breath.basePeriodMs) * dtMs
      out[breath.id] = breath.amplitude * (0.5 - 0.5 * Math.cos(2 * Math.PI * breathPhase))

      // blink — interval = base / (0.6 + 0.8·arousal), jittered ±25% by rng;
      // openness base trends with valence, dips to 0 mid-blink (triangle).
      const blink = preset.idle.blink
      const intervalMs = blink.baseIntervalMs / (0.6 + 0.8 * arousal)
      if (nextBlinkAtMs === null) nextBlinkAtMs = tMs + intervalMs * (0.75 + 0.5 * rng())
      if (tMs >= nextBlinkAtMs) {
        blinkStartedAtMs = tMs
        nextBlinkAtMs = tMs + intervalMs * (0.75 + 0.5 * rng())
      }
      const p01 = (tMs - blinkStartedAtMs) / blink.durationMs
      const envelope = p01 >= 1 ? 1 : p01 < 0.5 ? 1 - 2 * p01 : 2 * p01 - 1
      const openness = (1 + blink.valenceGain * valence) * envelope
      for (const id of blink.ids) out[id] = openness

      // sway — fixed period, seeded phase, amplitude scaled by arousal
      const sway = preset.idle.sway
      out[sway.id] =
        sway.baseAmplitude *
        (0.3 + arousal) *
        Math.sin((2 * Math.PI * tMs) / sway.periodMs + swayPhaseRad)

      return out
    }
  }
}
