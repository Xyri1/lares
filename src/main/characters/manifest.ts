import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import type { Vec2 } from '../affect/constants'
import { parseExp3File } from './exp3.ts'

export type CueCoordinates = Vec2 | null

export type CueDefinition =
  | { params: Record<string, number> }
  | { expression: string }
  | { motion: string }

export interface Live2dBlock {
  model: string
  cues?: Record<string, CueDefinition>
  [key: string]: unknown
}

export interface ValidationReport {
  ok: boolean
  errors: string[]
  cues: { expression: number; motion: number; authored: number; raw: number }
  calibrated: number
  uncalibrated: number
}

export type ManifestResult =
  | {
      ok: true
      name: string
      live2d: Live2dBlock
      expressions: Record<string, CueCoordinates>
      report: ValidationReport
    }
  | { ok: false; error: string; report?: ValidationReport }

export type CharacterSelection =
  | { ok: true; manifestPath: string; warning?: string }
  | { ok: false; error: string }

interface ParsedManifest {
  name: string
  live2d: Live2dBlock
  expressions: Record<string, CueCoordinates>
}

function errorReport(error: string): ValidationReport {
  return { ok: false, errors: [error], cues: { expression: 0, motion: 0, authored: 0, raw: 0 }, calibrated: 0, uncalibrated: 0 }
}

function isReport(value: unknown): value is ValidationReport {
  return typeof value === 'object' && value !== null && 'errors' in value
}

function isInside(root: string, path: string): boolean {
  const rel = relative(root, path)
  return rel !== '' && !rel.startsWith(`..${sep}`) && rel !== '..' && !rel.startsWith('..' + '/')
}

function parseManifest(manifestPath: string): ParsedManifest | ValidationReport {
  if (!existsSync(manifestPath)) return errorReport(`Character manifest not found: ${manifestPath}`)

  let json: unknown
  try {
    json = JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch (err) {
    return errorReport(`Character manifest is not valid JSON (${manifestPath}): ${(err as Error).message}`)
  }

  const m = json as {
    format?: unknown
    identity?: { name?: unknown; license?: unknown }
    expressions?: unknown
    renderers?: { live2d?: Record<string, unknown> }
  }
  if (m.format !== 'lares/1') return errorReport(`Unsupported manifest format ${JSON.stringify(m.format)} — expected "lares/1"`)
  if (typeof m.identity?.name !== 'string' || m.identity.name === '') return errorReport('Manifest missing identity.name')
  if (typeof m.identity.license !== 'string' || m.identity.license === '') return errorReport('Manifest missing identity.license')
  const live2d = m.renderers?.live2d
  if (!live2d || typeof live2d.model !== 'string') return errorReport('Manifest missing renderers.live2d.model')

  const expressions = parseExpressions(m.expressions)
  if (isReport(expressions)) return expressions
  const cues = parseCues(live2d.cues)
  if (isReport(cues)) return cues
  return { name: m.identity.name, live2d: { ...live2d, model: live2d.model, cues: cues.cues }, expressions: expressions.expressions }
}

function parseExpressions(raw: unknown): { ok: true; expressions: Record<string, CueCoordinates> } | ValidationReport {
  if (raw === undefined) return { ok: true, expressions: {} }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return errorReport('Manifest expressions must be an object')
  const expressions: Record<string, CueCoordinates> = {}
  for (const [cue, coord] of Object.entries(raw as Record<string, unknown>)) {
    if (coord === null) {
      expressions[cue] = null
      continue
    }
    const c = coord as { valence?: unknown; arousal?: unknown } | null
    if (typeof c?.valence !== 'number' || !Number.isFinite(c.valence) || c.valence < -1 || c.valence > 1) {
      return errorReport(`expressions.${cue}.valence must be a number in [-1,1]`)
    }
    if (typeof c.arousal !== 'number' || !Number.isFinite(c.arousal) || c.arousal < 0 || c.arousal > 1) {
      return errorReport(`expressions.${cue}.arousal must be a number in [0,1]`)
    }
    expressions[cue] = { valence: c.valence, arousal: c.arousal }
  }
  return { ok: true, expressions }
}

function parseCues(raw: unknown): { ok: true; cues: Record<string, CueDefinition> } | ValidationReport {
  if (raw === undefined) return { ok: true, cues: {} }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return errorReport('Manifest renderers.live2d.cues must be an object')
  const cues: Record<string, CueDefinition> = {}
  for (const [cue, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return errorReport(`renderers.live2d.cues.${cue} must be an object`)
    const def = value as { params?: unknown; expression?: unknown; motion?: unknown }
    const keys = ['params', 'expression', 'motion'].filter((key) => def[key as keyof typeof def] !== undefined)
    if (keys.length !== 1) return errorReport(`renderers.live2d.cues.${cue} must contain exactly one of params, expression, or motion`)
    if (def.params !== undefined) {
      if (typeof def.params !== 'object' || def.params === null || Array.isArray(def.params)) return errorReport(`renderers.live2d.cues.${cue}.params must be an object`)
      for (const [param, value] of Object.entries(def.params as Record<string, unknown>)) {
        if (typeof value !== 'number' || !Number.isFinite(value)) return errorReport(`renderers.live2d.cues.${cue}.params.${param} must be a finite number`)
      }
      cues[cue] = { params: def.params as Record<string, number> }
    } else if (typeof def.expression === 'string' && def.expression !== '') {
      cues[cue] = { expression: def.expression }
    } else if (typeof def.motion === 'string' && def.motion !== '') {
      cues[cue] = { motion: def.motion }
    } else {
      return errorReport(`renderers.live2d.cues.${cue}.${keys[0]} must be a non-empty string`)
    }
  }
  return { ok: true, cues }
}

function pathError(packageRoot: string, path: string, label: string): string | null {
  const absolute = resolve(packageRoot, path)
  if (!isInside(packageRoot, absolute)) return `${label} escapes character package: ${path}`
  if (!existsSync(absolute)) return `${label} not found: ${absolute}`
  return isInside(realpathSync(packageRoot), realpathSync(absolute))
    ? null
    : `${label} escapes character package through a symbolic link: ${path}`
}

/** Validates a package without Electron or renderer dependencies. */
export function validateCharacter(manifestPath: string): ValidationReport {
  const parsed = parseManifest(manifestPath)
  if (isReport(parsed)) return parsed
  const packageRoot = dirname(manifestPath)
  const errors: string[] = []
  const modelError = pathError(packageRoot, parsed.live2d.model, 'Model file')
  if (modelError) errors.push(modelError)
  if (modelError?.includes('not found')) {
    errors[errors.length - 1] += ' — run "pnpm fetch-assets" to download the bundled assets'
  }
  const cues = { expression: 0, motion: 0, authored: 0, raw: 0 }
  const definitions = parsed.live2d.cues ?? {}
  for (const name of Object.keys(parsed.expressions)) {
    if (!Object.hasOwn(definitions, name)) {
      errors.push(`Cue ${JSON.stringify(name)} has affect coordinates but no Live2D mapping`)
    }
  }
  for (const name of Object.keys(definitions)) {
    if (!Object.hasOwn(parsed.expressions, name)) {
      errors.push(`Cue ${JSON.stringify(name)} has a Live2D mapping but no affect coordinates`)
    }
  }
  for (const [name, cue] of Object.entries(definitions)) {
    if ('params' in cue) {
      cues.raw++
      continue
    }
    const kind = 'expression' in cue ? 'expression' : 'motion'
    const path = cue[kind]
    const referenceError = pathError(packageRoot, path, `Cue ${JSON.stringify(name)} ${kind}`)
    if (referenceError) errors.push(referenceError)
    if (kind === 'expression') {
      if (path.startsWith('authored/')) cues.authored++
      else cues.expression++
      if (!referenceError) {
        const result = parseExp3File(resolve(packageRoot, path))
        if (!result.ok) errors.push(`Cue ${JSON.stringify(name)} expression is invalid: ${result.error}`)
      }
    } else {
      cues.motion++
    }
  }
  const values = Object.values(parsed.expressions)
  return {
    ok: errors.length === 0,
    errors,
    cues,
    calibrated: values.filter((value) => value !== null).length,
    uncalibrated: values.filter((value) => value === null).length
  }
}

export function loadCharacter(manifestPath: string): ManifestResult {
  const parsed = parseManifest(manifestPath)
  if (isReport(parsed)) return { ok: false, error: parsed.errors[0], report: parsed }
  const report = validateCharacter(manifestPath)
  if (!report.ok) return { ok: false, error: report.errors[0], report }
  return {
    ok: true,
    name: parsed.name,
    live2d: { ...parsed.live2d, model: resolve(dirname(manifestPath), parsed.live2d.model) },
    expressions: parsed.expressions,
    report
  }
}

export function selectCharacterManifest(charactersRoot: string): CharacterSelection {
  if (!existsSync(charactersRoot)) return { ok: false, error: `Characters directory not found: ${charactersRoot}` }
  const manifests = readdirSync(charactersRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(charactersRoot, entry.name, 'lar.character.json')))
    .map((entry) => join(charactersRoot, entry.name, 'lar.character.json'))
    .sort()
  if (manifests.length === 0) return { ok: false, error: `No character package found under ${charactersRoot}` }
  return {
    ok: true,
    manifestPath: manifests[0],
    ...(manifests.length > 1 ? { warning: `Multiple character packages found; using ${manifests[0]}` } : {})
  }
}
