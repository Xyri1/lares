/**
 * Slice 011: the agent-facing protocol vocabulary (011-D4) plus the adapter
 * helpers that translate it into the active character's own performance names
 * (011-D12). Nerves, the affect engine and the scenario harness never see a
 * canonical cue — resolution happens above them.
 */

export const CANONICAL_CUES = [
  'discovery',
  'uncertainty',
  'concern',
  'frustration',
  'relief',
  'satisfaction'
] as const

export type CanonicalCue = (typeof CANONICAL_CUES)[number]
export type CueMappings = Partial<Record<CanonicalCue, string>>

export type PerformanceKind = 'params' | 'expression' | 'motion'
export type PerformanceSource = 'bundled' | 'authored' | 'raw'

// Structural rather than imported from characters/manifest: that module needs
// CANONICAL_CUES for validation, and a one-way dependency is cheaper than a
// cycle. ponytail: widen only if a fourth definition kind ever appears.
type Definition = { params: unknown } | { expression: unknown } | { motion: unknown }

/** The raw performance inventory Nerves reports, before protocol shaping. */
export interface PerformanceInput {
  name: string
  valence: number | null
  arousal: number | null
  source: PerformanceSource
}

export interface Performance {
  name: string
  kind: PerformanceKind
  source: PerformanceSource
  affect: { valence: number; arousal: number } | null
  mapped_cues: CanonicalCue[]
}

export function isCanonicalCue(value: unknown): value is CanonicalCue {
  return (CANONICAL_CUES as readonly unknown[]).includes(value)
}

/** Canonical order — never insertion, never host locale. */
export function missingCues(
  mappings: CueMappings,
  calibrated: (performance: string) => boolean
): CanonicalCue[] {
  return CANONICAL_CUES.filter((cue) => {
    const performance = mappings[cue]
    return performance === undefined || !calibrated(performance)
  })
}

export function performanceKind(definition: Definition | undefined): PerformanceKind {
  if (definition && 'motion' in definition) return 'motion'
  if (definition && 'params' in definition) return 'params'
  return 'expression'
}

// Unicode code-point order (SPEC §4): plain `<` compares UTF-16 code units,
// which would sort an astral name before a U+E000..U+FFFF one.
function byCodePoint(a: string, b: string): number {
  const left = [...a]
  const right = [...b]
  for (let index = 0; index < Math.min(left.length, right.length); index++) {
    const difference = left[index].codePointAt(0)! - right[index].codePointAt(0)!
    if (difference !== 0) return difference
  }
  return left.length - right.length
}

export function performanceInventory(
  performances: readonly PerformanceInput[],
  definitions: Readonly<Record<string, Definition>>,
  mappings: CueMappings
): { performances: Performance[]; missing_cues: CanonicalCue[] } {
  const affect = new Map(
    performances.map((entry) => [
      entry.name,
      entry.valence === null || entry.arousal === null
        ? null
        : { valence: entry.valence, arousal: entry.arousal }
    ])
  )
  return {
    performances: performances
      .map((entry) => ({
        name: entry.name,
        kind: performanceKind(definitions[entry.name]),
        source: entry.source,
        affect: affect.get(entry.name) ?? null,
        mapped_cues: CANONICAL_CUES.filter((cue) => mappings[cue] === entry.name)
      }))
      .sort((a, b) => byCodePoint(a.name, b.name)),
    missing_cues: missingCues(mappings, (name) => (affect.get(name) ?? null) !== null)
  }
}

/**
 * Fails closed before Nerves so an incomplete character mutates neither affect
 * nor playback, and never asks the agent for an artist name (011-D10).
 */
export function resolveCanonicalCue(
  value: unknown,
  mappings: CueMappings,
  missing: readonly CanonicalCue[]
): { cue: CanonicalCue; performance: string } {
  if (!isCanonicalCue(value)) {
    throw new Error(`unknown cue "${String(value)}" — expected one of ${CANONICAL_CUES.join(', ')}`)
  }
  const performance = mappings[value]
  if (missing.length > 0 || performance === undefined) {
    const unresolved = missing.length > 0 ? missing : [value]
    throw new Error(`character_not_calibrated: missing ${unresolved.join(', ')}`)
  }
  return { cue: value, performance }
}

/** The `status` half of tool-contract v2: the valid partial mapping and the gap. */
export function statusMappings(
  mappings: CueMappings,
  missing: readonly CanonicalCue[]
): { cue_mappings: CueMappings; missing_cues: CanonicalCue[] } {
  const cue_mappings: CueMappings = {}
  for (const cue of CANONICAL_CUES) {
    const performance = mappings[cue]
    if (performance !== undefined && !missing.includes(cue)) cue_mappings[cue] = performance
  }
  return { cue_mappings, missing_cues: [...missing] }
}
