// Body-side synth (slice 013 SPEC §§5–6): the performance target pose in,
// rig parameter values out. Pure: no pixi, no DOM, no Electron, no wall
// clock, no Math.random — time and randomness are injected, so replay
// determinism (002-D3) holds by construction. Live2D parameter ids arrive as
// preset DATA and channel names are renderer-neutral; this code stays
// renderer-generic (P6).

import { CHANNELS, easeStep, type Channel, type Pose } from '../feel/feel'

/** The slice of the performance feed the synth reads: one target pose. */
export interface SynthFeed {
  pose: Pose
}

/** One static channel wired to a rig parameter (SPEC §5). */
export interface ParamBinding {
  id: string
  source: Channel
  gain: number
  offset: number
}

/** Adapter wiring (SPEC §5/§13): data, not code — lives under presets/ and
 * in each character's `renderers.live2d.performance` block. */
export interface SynthPreset {
  params: ParamBinding[]
  idle: {
    breath: { id: string; basePeriodMs: number; amplitude: number }
    blink: { ids: string[]; baseIntervalMs: number; durationMs: number }
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
        !(CHANNELS as readonly string[]).includes(binding.source) ||
        !finite(binding.gain) ||
        !finite(binding.offset)
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
   * breath, blink ids, sway, each id appearing at its first position — the
   * synth trace's byte format relies on it.
   */
  computeFrame(feed: SynthFeed, tMs: number): Record<string, number>
}

// Stateful across frames (eased pose, breath phase, blink schedule) but
// deterministic: same preset + rng seed + (feed, tMs) sequence → same
// outputs. Writer randomness (blink jitter, sway phase) is mechanical
// renderer state and never reaches the pure mapping (SPEC §5).
export function createSynth(preset: SynthPreset, rng: Rng): Synth {
  let lastTMs: number | null = null
  let pose: Pose | null = null
  const velocity = {} as Pose
  let breathPhase = 0 // cycles
  let nextBlinkAtMs: number | null = null
  let blinkStartedAtMs = -Infinity
  const swayPhaseRad = rng() * 2 * Math.PI // seeded sway phase (slice SPEC §4)

  return {
    computeFrame(feed: SynthFeed, tMs: number): Record<string, number> {
      const dtMs = lastTMs === null ? 0 : Math.max(0, tMs - lastTMs)
      lastTMs = tMs

      // One fixed critically damped ease for every change, target and overlay
      // alike (SPEC §6). The first frame snaps: nothing is on screen to
      // travel from.
      if (pose === null) {
        pose = { ...feed.pose }
        for (const ch of CHANNELS) velocity[ch] = 0
      } else {
        for (const ch of CHANNELS) {
          const step = easeStep(pose[ch], velocity[ch], feed.pose[ch], dtMs)
          pose[ch] = step.value
          velocity[ch] = step.velocity
        }
      }

      const out: Record<string, number> = {}

      // static channels: value = offset + gain·channel
      for (const p of preset.params) out[p.id] = p.offset + p.gain * pose[p.source]

      // breath — period shortens with breathRate, depth scales amplitude
      // (SPEC §13). Phase accumulates so a rate change bends the wave
      // instead of jumping it.
      const breath = preset.idle.breath
      breathPhase += dtMs / (breath.basePeriodMs * (1 - 0.35 * pose.breathRate))
      out[breath.id] =
        breath.amplitude *
        (1 + 0.5 * pose.breathDepth) *
        (0.5 - 0.5 * Math.cos(2 * Math.PI * breathPhase))

      // blink — interval shortens with blinkRate, jittered ±25% by rng. The
      // envelope multiplies whatever the eyeOpen wiring already produced for
      // these ids (1 where the character wires none), so the static channel
      // survives its own blink.
      const blink = preset.idle.blink
      const intervalMs = blink.baseIntervalMs * (1 - 0.4 * pose.blinkRate)
      if (nextBlinkAtMs === null) nextBlinkAtMs = tMs + intervalMs * (0.75 + 0.5 * rng())
      if (tMs >= nextBlinkAtMs) {
        blinkStartedAtMs = tMs
        nextBlinkAtMs = tMs + intervalMs * (0.75 + 0.5 * rng())
      }
      const p01 = (tMs - blinkStartedAtMs) / blink.durationMs
      const envelope = p01 >= 1 ? 1 : p01 < 0.5 ? 1 - 2 * p01 : 2 * p01 - 1
      for (const id of blink.ids) out[id] = (out[id] ?? 1) * envelope

      // sway — fixed period, seeded phase; channel −1 is still.
      const sway = preset.idle.sway
      out[sway.id] =
        sway.baseAmplitude *
        (1 + pose.swayAmplitude) *
        Math.sin((2 * Math.PI * tMs) / sway.periodMs + swayPhaseRad)

      return out
    }
  }
}
