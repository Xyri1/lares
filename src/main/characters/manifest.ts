import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { Vec2 } from '../affect/constants'
import {
  CANONICAL_CUES,
  isCanonicalCue,
  missingCues,
  type CanonicalCue,
  type CueMappings
} from '../cues'
import { parseExp3File } from './exp3.ts'

export type CueCoordinates = Vec2 | null

export type CueDefinition =
  | { params: Record<string, number> }
  | { expression: string }
  | { motion: string }

export interface Live2dBlock {
  model: string
  cues?: Record<string, CueDefinition>
  performance?: SynthPreset
  [key: string]: unknown
}

export interface SynthPreset {
  params: {
    id: string
    source: 'valence' | 'arousal'
    gain: number
    offset: number
    weight?: number
  }[]
  idle: {
    breath: { id: string; basePeriodMs: number; amplitude: number }
    blink: {
      ids: string[]
      baseIntervalMs: number
      durationMs: number
      valenceGain: number
    }
    sway: { id: string; baseAmplitude: number; periodMs: number }
  }
}

export interface ResourceCatalog {
  moc: string | null
  textures: string[]
  expressions: { registered: string[]; loose: string[] }
  motions: { registered: string[]; loose: string[] }
  physics: { registered: string | null; fallback: string | null; loose: string[] }
  sidecars: {
    pose: string | null
    userData: string | null
    displayInfo: string | null
  }
  hitAreas: number
  audio: { referenced: string[]; missing: string[] }
  ignored: string[]
}

export interface BodyCapabilities {
  parameters: {
    id: string
    name: string
    min: number
    max: number
    default: number
  }[]
  groups: { eyeBlink: string[]; lipSync: string[] }
  motions: Record<string, number>
  maxTextureSize: number | null
  textures: string[]
  textureDimensions: { path: string; width: number; height: number }[]
  performanceGaps: string[]
}

export interface ValidationReport {
  ok: boolean
  errors: string[]
  warnings: string[]
  degradations: string[]
  entryPoint: string | null
  mocVersion: number | null
  resources: ResourceCatalog
  performance: { configured: boolean; parameterIds: string[] }
  body: BodyCapabilities | null
  cues: { expression: number; motion: number; authored: number; raw: number }
  calibrated: number
  uncalibrated: number
  /** Canonical readiness (011-D10), beside the raw performance counts above. */
  mappedCues: CanonicalCue[]
  missingCues: CanonicalCue[]
}

export type ManifestResult =
  | {
      ok: true
      name: string
      live2d: Live2dBlock
      expressions: Record<string, CueCoordinates>
      cueMappings: CueMappings
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
  cueMappings: CueMappings
}

const EMPTY_RESOURCES: ResourceCatalog = {
  moc: null,
  textures: [],
  expressions: { registered: [], loose: [] },
  motions: { registered: [], loose: [] },
  physics: { registered: null, fallback: null, loose: [] },
  sidecars: { pose: null, userData: null, displayInfo: null },
  hitAreas: 0,
  audio: { referenced: [], missing: [] },
  ignored: []
}

function errorReport(error: string): ValidationReport {
  return {
    ok: false,
    errors: [error],
    warnings: [],
    degradations: [],
    entryPoint: null,
    mocVersion: null,
    resources: EMPTY_RESOURCES,
    performance: { configured: false, parameterIds: [] },
    body: null,
    cues: { expression: 0, motion: 0, authored: 0, raw: 0 },
    calibrated: 0,
    uncalibrated: 0,
    mappedCues: [],
    missingCues: [...CANONICAL_CUES]
  }
}

function isReport(value: unknown): value is ValidationReport {
  return typeof value === 'object' && value !== null && 'errors' in value
}

function isInside(root: string, path: string): boolean {
  const rel = relative(root, path)
  return rel !== '' && !rel.startsWith(`..${sep}`) && rel !== '..' && !rel.startsWith('..' + '/')
}

function packagePath(packageRoot: string, path: string): string {
  return relative(packageRoot, path).split(sep).join('/')
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
    cueMappings?: unknown
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
  const mappings = parseCueMappings(m.cueMappings)
  if (isReport(mappings)) return mappings
  const performance = parsePerformance(live2d.performance)
  if (isReport(performance)) return performance
  return {
    name: m.identity.name,
    live2d: {
      ...live2d,
      model: live2d.model,
      cues: cues.cues,
      ...(performance.performance ? { performance: performance.performance } : {})
    },
    expressions: expressions.expressions,
    cueMappings: mappings.cueMappings
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function positive(value: unknown): value is number {
  return finite(value) && value > 0
}

function parsePerformance(
  value: unknown
): { performance?: SynthPreset } | ValidationReport {
  if (value === undefined) return {}
  if (!record(value) || !Array.isArray(value.params) || !record(value.idle)) {
    return errorReport('renderers.live2d.performance must use the synth preset shape')
  }
  const params: SynthPreset['params'] = []
  for (const [index, raw] of value.params.entries()) {
    if (
      !record(raw) ||
      typeof raw.id !== 'string' ||
      raw.id === '' ||
      (raw.source !== 'valence' && raw.source !== 'arousal') ||
      !finite(raw.gain) ||
      !finite(raw.offset) ||
      (raw.weight !== undefined && !finite(raw.weight))
    ) {
      return errorReport(`renderers.live2d.performance.params[${index}] is invalid`)
    }
    params.push({
      id: raw.id,
      source: raw.source,
      gain: raw.gain,
      offset: raw.offset,
      ...(raw.weight === undefined ? {} : { weight: raw.weight })
    })
  }
  const breath = value.idle.breath
  const blink = value.idle.blink
  const sway = value.idle.sway
  if (
    !record(breath) ||
    typeof breath.id !== 'string' ||
    breath.id === '' ||
    !positive(breath.basePeriodMs) ||
    !finite(breath.amplitude) ||
    !record(blink) ||
    !Array.isArray(blink.ids) ||
    blink.ids.some((id) => typeof id !== 'string' || id === '') ||
    !positive(blink.baseIntervalMs) ||
    !positive(blink.durationMs) ||
    !finite(blink.valenceGain) ||
    !record(sway) ||
    typeof sway.id !== 'string' ||
    sway.id === '' ||
    !finite(sway.baseAmplitude) ||
    !positive(sway.periodMs)
  ) {
    return errorReport('renderers.live2d.performance.idle is invalid')
  }
  return {
    performance: {
      params,
      idle: {
        breath: {
          id: breath.id,
          basePeriodMs: breath.basePeriodMs,
          amplitude: breath.amplitude
        },
        blink: {
          ids: blink.ids as string[],
          baseIntervalMs: blink.baseIntervalMs,
          durationMs: blink.durationMs,
          valenceGain: blink.valenceGain
        },
        sway: {
          id: sway.id,
          baseAmplitude: sway.baseAmplitude,
          periodMs: sway.periodMs
        }
      }
    }
  }
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

/** Partial by design (011-D5): an incomplete mapping is valid but not ready. */
function parseCueMappings(raw: unknown): { ok: true; cueMappings: CueMappings } | ValidationReport {
  if (raw === undefined) return { ok: true, cueMappings: {} }
  if (!record(raw)) return errorReport('Manifest cueMappings must be an object')
  const cueMappings: CueMappings = {}
  for (const [cue, performance] of Object.entries(raw)) {
    if (!isCanonicalCue(cue)) {
      return errorReport(
        `cueMappings.${cue} is not a canonical cue — expected one of ${CANONICAL_CUES.join(', ')}`
      )
    }
    if (typeof performance !== 'string' || performance === '') {
      return errorReport(`cueMappings.${cue} must name a character performance`)
    }
    cueMappings[cue] = performance
  }
  return { ok: true, cueMappings }
}

function pathShapeError(path: string, label: string): string | null {
  if (path.includes('\0')) return `${label} contains a NUL byte`
  if (
    path === '' ||
    isAbsolute(path) ||
    /^[a-z][a-z0-9+.-]*:/i.test(path) ||
    path.includes('\\') ||
    path.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')
  ) {
    return `${label} must be a normalized package-relative path: ${path}`
  }
  return null
}

function exactCase(root: string, path: string): boolean {
  let current = root
  for (const segment of relative(root, path).split(sep)) {
    if (!readdirSync(current).some((entry) => entry === segment)) return false
    current = join(current, segment)
  }
  return true
}

function pathError(packageRoot: string, path: string, label: string): string | null {
  const shapeError = pathShapeError(path, label)
  if (shapeError) return shapeError
  const absolute = resolve(packageRoot, path)
  if (!isInside(packageRoot, absolute)) return `${label} escapes character package: ${path}`
  if (!existsSync(absolute)) return `${label} not found: ${absolute}`
  if (!exactCase(packageRoot, absolute)) return `${label} has incorrect path case: ${path}`
  let current = packageRoot
  for (const segment of relative(packageRoot, absolute).split(sep)) {
    current = join(current, segment)
    if (lstatSync(current).isSymbolicLink()) return `${label} uses a symbolic link: ${path}`
  }
  return isInside(realpathSync(packageRoot), realpathSync(absolute))
    ? null
    : `${label} escapes character package through a link: ${path}`
}

export function nestedFileReferences(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(nestedFileReferences)
  if (typeof value !== 'object' || value === null) return []
  const record = value as Record<string, unknown>
  return [
    ...(typeof record.File === 'string' ? [record.File] : []),
    ...Object.values(record).flatMap(nestedFileReferences)
  ]
}

function nestedValues(value: unknown, key: string): string[] {
  if (Array.isArray(value)) return value.flatMap((entry) => nestedValues(entry, key))
  if (!record(value)) return []
  return [
    ...(typeof value[key] === 'string' ? [value[key] as string] : []),
    ...Object.values(value).flatMap((entry) => nestedValues(entry, key))
  ]
}

interface ModelDocument {
  FileReferences?: Record<string, unknown>
  Groups?: unknown
  HitAreas?: unknown
}

interface ModelInspection {
  resources: ResourceCatalog
  errors: string[]
  warnings: string[]
  degradations: string[]
  required: string[]
  optional: string[]
}

function scanPackageFiles(root: string, packageRoot: string, errors: string[]): string[] {
  const files: string[] = []
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name)
    if (entry.isSymbolicLink()) {
      errors.push(`Character package contains a symbolic link: ${packagePath(packageRoot, path)}`)
    } else if (entry.isDirectory()) {
      files.push(...scanPackageFiles(path, packageRoot, errors))
    } else if (entry.isFile()) {
      files.push(packagePath(packageRoot, path))
    }
  }
  return files
}

function inspectModel(packageRoot: string, modelPath: string): ModelInspection | string {
  let model: ModelDocument
  try {
    model = JSON.parse(readFileSync(modelPath, 'utf8'))
  } catch (error) {
    return `Model file is not valid JSON (${modelPath}): ${(error as Error).message}`
  }
  if (!record(model)) return `Model file must contain a JSON object: ${modelPath}`
  const refs = record(model.FileReferences) ? model.FileReferences : {}
  const modelDir = dirname(modelPath)
  const fromModel = (path: string): string =>
    packagePath(packageRoot, resolve(modelDir, path))
  const registeredExpressions = [...new Set(nestedFileReferences(refs.Expressions).map(fromModel))].sort()
  const registeredMotions = [...new Set(nestedFileReferences(refs.Motions).map(fromModel))].sort()
  const referencedAudio = [...new Set(nestedValues(refs.Motions, 'Sound').map(fromModel))].sort()
  const moc = typeof refs.Moc === 'string' ? fromModel(refs.Moc) : null
  const textures = Array.isArray(refs.Textures)
    ? [...new Set(refs.Textures.filter((path): path is string => typeof path === 'string').map(fromModel))].sort()
    : []
  const registeredPhysics = typeof refs.Physics === 'string' ? fromModel(refs.Physics) : null
  const errors: string[] = []
  const files = scanPackageFiles(packageRoot, packageRoot, errors).sort()
  const looseExpressions = files
    .filter((path) => path.endsWith('.exp3.json') && !registeredExpressions.includes(path))
  const looseMotions = files
    .filter((path) => path.endsWith('.motion3.json') && !registeredMotions.includes(path))
  const loosePhysics = files
    .filter((path) => path.endsWith('.physics3.json') && path !== registeredPhysics)
  const registeredPhysicsUsable =
    registeredPhysics !== null &&
    pathError(packageRoot, registeredPhysics, 'Registered physics') === null
  const fallbackPhysics = !registeredPhysicsUsable && loosePhysics.length === 1
    ? loosePhysics[0]
    : null
  if (!registeredPhysicsUsable && loosePhysics.length > 1) {
    errors.push(`Multiple unregistered physics files are ambiguous: ${loosePhysics.join(', ')}`)
  }
  if (!moc) errors.push('Model FileReferences.Moc is required')
  if (textures.length === 0) errors.push('Model FileReferences.Textures must contain at least one texture')
  const pose = typeof refs.Pose === 'string' ? fromModel(refs.Pose) : null
  const userData = typeof refs.UserData === 'string' ? fromModel(refs.UserData) : null
  const displayInfo = typeof refs.DisplayInfo === 'string' ? fromModel(refs.DisplayInfo) : null
  const hitAreas = Array.isArray(model.HitAreas) ? model.HitAreas.length : 0
  const missingAudio = referencedAudio.filter((path) => !existsSync(resolve(packageRoot, path)))
  const warnings = [
    ...missingAudio.map((path) => `Motion audio is missing; animation remains playable: ${path}`),
    ...files
      .filter((path) => path.endsWith('.vtube.json'))
      .map((path) => `Ignored VTube Studio metadata: ${path}`)
  ]
  const degradations = [
    ...(registeredPhysicsUsable || fallbackPhysics ? [] : ['physics unavailable']),
    ...(pose ? [] : ['pose unavailable']),
    ...(userData ? [] : ['user data unavailable']),
    ...(displayInfo ? [] : ['display info unavailable']),
    ...(hitAreas > 0 ? [] : ['hit areas unavailable; using silhouette fallback'])
  ]
  return {
    resources: {
      moc,
      textures,
      expressions: { registered: registeredExpressions, loose: looseExpressions },
      motions: { registered: registeredMotions, loose: looseMotions },
      physics: { registered: registeredPhysics, fallback: fallbackPhysics, loose: loosePhysics },
      sidecars: { pose, userData, displayInfo },
      hitAreas,
      audio: { referenced: referencedAudio, missing: missingAudio },
      ignored: files.filter((path) => path.endsWith('.vtube.json'))
    },
    errors,
    warnings,
    degradations,
    required: [...(moc ? [moc] : []), ...textures],
    optional: [
      ...[registeredPhysics, pose, userData, displayInfo].filter((path): path is string => path !== null),
      ...registeredExpressions,
      ...registeredMotions
    ]
  }
}

/** Validates a package without Electron or renderer dependencies. */
export function validateCharacter(manifestPath: string): ValidationReport {
  const parsed = parseManifest(manifestPath)
  if (isReport(parsed)) return parsed
  const packageRoot = dirname(manifestPath)
  const errors: string[] = []
  const warnings: string[] = []
  const degradations: string[] = []
  let resources = EMPTY_RESOURCES
  const modelError = pathError(packageRoot, parsed.live2d.model, 'Model file')
  if (modelError) errors.push(modelError)
  if (modelError?.includes('not found')) {
    errors[errors.length - 1] += ' — run "pnpm fetch-assets" to download the bundled assets'
  }
  if (!modelError) {
    const modelPath = resolve(packageRoot, parsed.live2d.model)
    const inspection = inspectModel(packageRoot, modelPath)
    if (typeof inspection === 'string') {
      errors.push(inspection)
    } else {
      resources = inspection.resources
      errors.push(...inspection.errors)
      warnings.push(...inspection.warnings)
      degradations.push(...inspection.degradations)
      for (const reference of inspection.required) {
        const referenceError = pathError(packageRoot, reference, 'Required model resource')
        if (referenceError) errors.push(referenceError)
      }
      for (const reference of inspection.optional) {
        const referenceError = pathError(packageRoot, reference, 'Optional model resource')
        if (referenceError) {
          warnings.push(referenceError)
          degradations.push(`optional resource unavailable: ${reference}`)
        }
      }
    }
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
  for (const [cue, performance] of Object.entries(parsed.cueMappings)) {
    if (!Object.hasOwn(parsed.expressions, performance)) {
      errors.push(`cueMappings.${cue} names unknown performance ${JSON.stringify(performance)}`)
    } else if (parsed.expressions[performance] === null) {
      errors.push(`cueMappings.${cue} names uncalibrated performance ${JSON.stringify(performance)}`)
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
  const missing = missingCues(
    parsed.cueMappings,
    (performance) => (parsed.expressions[performance] ?? null) !== null
  )
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    degradations: [...new Set(degradations)],
    entryPoint: modelError ? null : parsed.live2d.model,
    mocVersion: null,
    resources,
    performance: {
      configured: parsed.live2d.performance !== undefined,
      parameterIds: parsed.live2d.performance
        ? [
            ...new Set([
              ...parsed.live2d.performance.params.map((binding) => binding.id),
              parsed.live2d.performance.idle.breath.id,
              ...parsed.live2d.performance.idle.blink.ids,
              parsed.live2d.performance.idle.sway.id
            ])
          ]
        : []
    },
    body: null,
    cues,
    calibrated: values.filter((value) => value !== null).length,
    uncalibrated: values.filter((value) => value === null).length,
    mappedCues: CANONICAL_CUES.filter((cue) => !missing.includes(cue)),
    missingCues: missing
  }
}

/** Adds body-only findings to the same report produced by static validation. */
export function mergeRuntimeCompatibility(
  report: ValidationReport,
  parameters: BodyCapabilities['parameters'],
  value: unknown
): boolean {
  if (!record(value)) return false
  const groups = value.groups
  const motions = value.motions
  const strings = (input: unknown): input is string[] =>
    Array.isArray(input) && input.every((entry) => typeof entry === 'string')
  if (
    !Number.isInteger(value.mocVersion) ||
    (value.mocVersion as number) < 1 ||
    (value.mocVersion as number) > 4 ||
    !record(groups) ||
    !strings(groups.eyeBlink) ||
    !strings(groups.lipSync) ||
    !record(motions) ||
    Object.values(motions).some(
      (count) => !Number.isSafeInteger(count) || (count as number) < 0
    ) ||
    (value.maxTextureSize !== null &&
      (!finite(value.maxTextureSize) || value.maxTextureSize <= 0)) ||
    !strings(value.textures) ||
    !Array.isArray(value.textureDimensions) ||
    value.textureDimensions.some(
      (texture) =>
        !record(texture) ||
        typeof texture.path !== 'string' ||
        !positive(texture.width) ||
        !positive(texture.height)
    )
  ) {
    return false
  }
  const parameterIds = new Set(parameters.map((parameter) => parameter.id))
  report.mocVersion = value.mocVersion as number
  report.body = {
    parameters: parameters.map((parameter) => ({ ...parameter })),
    groups: {
      eyeBlink: [...groups.eyeBlink],
      lipSync: [...groups.lipSync]
    },
    motions: { ...(motions as Record<string, number>) },
    maxTextureSize: value.maxTextureSize as number | null,
    textures: [...value.textures],
    textureDimensions: value.textureDimensions.map((texture) => ({
      path: texture.path as string,
      width: texture.width as number,
      height: texture.height as number
    })),
    performanceGaps: report.performance.parameterIds.filter((id) => !parameterIds.has(id))
  }
  return true
}

export function loadCharacter(manifestPath: string): ManifestResult {
  const parsed = parseManifest(manifestPath)
  if (isReport(parsed)) return { ok: false, error: parsed.errors[0], report: parsed }
  const report = validateCharacter(manifestPath)
  if (!report.ok) return { ok: false, error: report.errors[0], report }
  return {
    ok: true,
    name: parsed.name,
    live2d: {
      ...parsed.live2d,
      model: resolve(dirname(manifestPath), parsed.live2d.model),
      ...(report.resources.physics.fallback
        ? { fallbackPhysics: report.resources.physics.fallback }
        : {})
    },
    expressions: parsed.expressions,
    cueMappings: parsed.cueMappings,
    report
  }
}

export function selectCharacterManifest(charactersRoot: string): CharacterSelection {
  if (!existsSync(charactersRoot)) return { ok: false, error: `Characters directory not found: ${charactersRoot}` }
  const manifests = readdirSync(charactersRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(charactersRoot, entry.name, 'lar.character.json')))
    .map((entry) => join(charactersRoot, entry.name, 'lar.character.json'))
    .filter((manifestPath) => loadCharacter(manifestPath).ok)
    .sort()
  if (manifests.length === 0) return { ok: false, error: `No character package found under ${charactersRoot}` }
  return {
    ok: true,
    manifestPath: manifests[0],
    ...(manifests.length > 1 ? { warning: `Multiple character packages found; using ${manifests[0]}` } : {})
  }
}
