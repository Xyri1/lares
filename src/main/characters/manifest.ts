import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import type { Vec2 } from '../affect/constants'

export interface Live2dBlock {
  model: string
  [key: string]: unknown
}

export type ManifestResult =
  | { ok: true; name: string; live2d: Live2dBlock; expressions: Record<string, Vec2> }
  | { ok: false; error: string }

// M1a checks only (slice SPEC §4): format, identity.name/license, model file
// exists. Slice 002 step 5 adds expressions (affect coords) + cue param-set
// shape validation. Full schema validation lands in M4. On success the
// live2d block is returned with `model` resolved to an absolute path; the
// renderer receives only this block plus expressions over IPC (P6 — raw
// paths travel no further than the block).
export function loadCharacter(manifestPath: string): ManifestResult {
  if (!existsSync(manifestPath)) {
    return { ok: false, error: `Character manifest not found: ${manifestPath}` }
  }

  let json: unknown
  try {
    json = JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch (err) {
    return {
      ok: false,
      error: `Character manifest is not valid JSON (${manifestPath}): ${(err as Error).message}`
    }
  }

  const m = json as {
    format?: unknown
    identity?: { name?: unknown; license?: unknown }
    expressions?: unknown
    renderers?: { live2d?: Record<string, unknown> }
  }

  if (m.format !== 'lares/1') {
    return { ok: false, error: `Unsupported manifest format ${JSON.stringify(m.format)} — expected "lares/1"` }
  }
  const name = m.identity?.name
  if (typeof name !== 'string' || name === '') {
    return { ok: false, error: 'Manifest missing identity.name' }
  }
  if (typeof m.identity?.license !== 'string' || m.identity.license === '') {
    return { ok: false, error: 'Manifest missing identity.license' }
  }
  const live2d = m.renderers?.live2d
  if (!live2d || typeof live2d.model !== 'string') {
    return { ok: false, error: 'Manifest missing renderers.live2d.model' }
  }

  const modelPath = resolve(dirname(manifestPath), live2d.model)
  if (!existsSync(modelPath)) {
    return {
      ok: false,
      error: `Model file not found: ${modelPath} — run "pnpm fetch-assets" to download the bundled assets`
    }
  }

  const expressionsResult = parseExpressions(m.expressions)
  if (!expressionsResult.ok) return expressionsResult

  const cuesResult = validateCues(live2d.cues)
  if (!cuesResult.ok) return cuesResult

  return {
    ok: true,
    name,
    live2d: { ...live2d, model: modelPath },
    expressions: expressionsResult.expressions
  }
}

// expressions: { "<cue>": { valence: [-1,1], arousal: [0,1] } } — renderer-
// neutral affect coordinates (root SPEC §5). Missing block defaults to empty.
function parseExpressions(
  raw: unknown
): { ok: true; expressions: Record<string, Vec2> } | { ok: false; error: string } {
  if (raw === undefined) return { ok: true, expressions: {} }
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, error: 'Manifest expressions must be an object' }
  }
  const expressions: Record<string, Vec2> = {}
  for (const [cue, coord] of Object.entries(raw as Record<string, unknown>)) {
    const c = coord as { valence?: unknown; arousal?: unknown } | null
    const valence = c?.valence
    const arousal = c?.arousal
    if (typeof valence !== 'number' || valence < -1 || valence > 1) {
      return { ok: false, error: `expressions.${cue}.valence must be a number in [-1,1]` }
    }
    if (typeof arousal !== 'number' || arousal < 0 || arousal > 1) {
      return { ok: false, error: `expressions.${cue}.arousal must be a number in [0,1]` }
    }
    expressions[cue] = { valence, arousal }
  }
  return { ok: true, expressions }
}

// renderers.live2d.cues: { "<cue>": { params: {...} } } — the raw param
// variant is the only one validated (the only one Hiyori uses this slice);
// `expression`/`motion` variants pass through unchecked until a model uses them.
function validateCues(raw: unknown): { ok: true } | { ok: false; error: string } {
  if (raw === undefined) return { ok: true }
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, error: 'Manifest renderers.live2d.cues must be an object' }
  }
  for (const [cue, def] of Object.entries(raw as Record<string, unknown>)) {
    const params = (def as { params?: unknown } | null)?.params
    if (params === undefined) continue
    if (typeof params !== 'object' || params === null) {
      return { ok: false, error: `renderers.live2d.cues.${cue}.params must be an object` }
    }
    for (const [param, value] of Object.entries(params as Record<string, unknown>)) {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return { ok: false, error: `renderers.live2d.cues.${cue}.params.${param} must be a finite number` }
      }
    }
  }
  return { ok: true }
}
