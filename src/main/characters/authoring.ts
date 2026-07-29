import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmdirSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Vec2 } from '../affect/constants'
import { errorMessage } from '../errors'
import { validateCharacter, type ValidationReport } from './manifest'

export type AuthoringResult = { ok: true; report: ValidationReport } | { ok: false; error: string }
export interface ExpressionUpdate { affect?: Vec2; params?: Record<string, number> }

type ManifestDocument = {
  expressions?: Record<string, Vec2 | null>
  renderers: { live2d: { cues?: Record<string, unknown> } }
}

function failure(error: string): AuthoringResult {
  return { ok: false, error }
}

function safeName(name: unknown): string | null {
  if (typeof name !== 'string' || name === '' || name !== name.trim() || name.endsWith('.') || name.endsWith(' ')) return 'Expression name is not a safe filename'
  if (name === '.' || name === '..' || /[<>:"/\\|?*\u0000-\u001f]/.test(name) || Buffer.byteLength(name) > 245) return 'Expression name is not a safe filename'
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(name)) return 'Expression name is not a safe filename'
  return null
}

function validAffect(value: unknown): string | null {
  const affect = value as Partial<Vec2> | null
  if (typeof affect?.valence !== 'number' || !Number.isFinite(affect.valence) || affect.valence < -1 || affect.valence > 1) return 'Affect valence must be a finite number in [-1,1]'
  if (typeof affect.arousal !== 'number' || !Number.isFinite(affect.arousal) || affect.arousal < 0 || affect.arousal > 1) return 'Affect arousal must be a finite number in [0,1]'
  return null
}

function validParams(value: unknown): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return 'Expression params must be an object'
  for (const [id, parameter] of Object.entries(value)) {
    if (id === '' || typeof parameter !== 'number' || !Number.isFinite(parameter)) return 'Expression params must have non-empty IDs and finite values'
  }
  return null
}

function isInside(root: string, path: string): boolean {
  const rel = relative(root, path)
  return rel !== '' && !rel.startsWith(`..${sep}`) && rel !== '..' && !rel.startsWith('../')
}

function authoredRootError(packageRoot: string, authoredRoot: string): string | null {
  if (!existsSync(authoredRoot)) return null
  try {
    return isInside(realpathSync(packageRoot), realpathSync(authoredRoot))
      ? null
      : 'Authored expression directory escapes the character package'
  } catch {
    return 'Authored expression directory is invalid'
  }
}

function atomicWrite(path: string, body: string): void {
  const temp = join(dirname(path), `.${randomUUID()}.tmp`)
  try {
    writeFileSync(temp, body, { encoding: 'utf8', flag: 'wx' })
    renameSync(temp, path)
  } catch (error) {
    if (existsSync(temp)) unlinkSync(temp)
    throw error
  }
}

function expressionJson(params: Record<string, number>): string {
  return JSON.stringify({
    Type: 'Live2D Expression',
    Parameters: Object.entries(params).map(([Id, Value]) => ({ Id, Value, Blend: 'Overwrite' }))
  }, null, 2) + '\n'
}

function readManifest(manifestPath: string): ManifestDocument | AuthoringResult {
  const report = validateCharacter(manifestPath)
  if (!report.ok) return failure(report.errors[0])
  try {
    return JSON.parse(readFileSync(manifestPath, 'utf8')) as ManifestDocument
  } catch (error) {
    return failure(`Cannot read character manifest: ${errorMessage(error)}`)
  }
}

function isResult(value: ManifestDocument | AuthoringResult): value is AuthoringResult {
  return 'ok' in value
}

function validateStaged(manifestPath: string, manifest: ManifestDocument): ValidationReport {
  const temp = join(dirname(manifestPath), `.${randomUUID()}.tmp`)
  try {
    writeFileSync(temp, JSON.stringify(manifest, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' })
    return validateCharacter(temp)
  } finally {
    if (existsSync(temp)) unlinkSync(temp)
  }
}

function commitManifest(manifestPath: string, manifest: ManifestDocument): AuthoringResult {
  const staged = validateStaged(manifestPath, manifest)
  if (!staged.ok) return failure(staged.errors[0])
  atomicWrite(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
  const report = validateCharacter(manifestPath)
  return report.ok ? { ok: true, report } : failure(report.errors[0])
}

function clonedManifest(manifest: ManifestDocument): ManifestDocument {
  return structuredClone(manifest)
}

function authoredCueCount(cues: Record<string, unknown>): number {
  return Object.values(cues).filter((cue) => {
    const expression = (cue as { expression?: unknown })?.expression
    return typeof expression === 'string' && expression.startsWith('authored/')
  }).length
}

/** Creates a new authored exp3 expression and its manifest cue. */
export function saveExpression(manifestPath: string, name: string, params: Record<string, number>, affect: Vec2): AuthoringResult {
  const nameError = safeName(name) ?? validParams(params) ?? validAffect(affect)
  if (nameError) return failure(nameError)
  const manifest = readManifest(manifestPath)
  if (isResult(manifest)) return manifest
  const cues = manifest.renderers.live2d.cues ?? {}
  const coordinates = manifest.expressions ?? {}
  if (Object.hasOwn(cues, name) || Object.hasOwn(coordinates, name)) return failure(`Cue already exists: ${name}`)
  if (authoredCueCount(cues) >= 50) return failure('A character package may have at most 50 authored expressions')

  const packageRoot = dirname(manifestPath)
  const authoredRoot = join(packageRoot, 'authored')
  const expressionPath = join(authoredRoot, `${name}.exp3.json`)
  if (!isInside(authoredRoot, expressionPath) || existsSync(expressionPath)) return failure(`Authored expression already exists: ${name}`)
  const authoredExisted = existsSync(authoredRoot)
  const rootError = authoredRootError(packageRoot, authoredRoot)
  if (rootError) return failure(rootError)
  try {
    mkdirSync(authoredRoot, { recursive: true })
    const createdRootError = authoredRootError(packageRoot, authoredRoot)
    if (createdRootError) throw new Error(createdRootError)
    atomicWrite(expressionPath, expressionJson(params))
    const next = clonedManifest(manifest)
    next.renderers.live2d.cues = { ...(next.renderers.live2d.cues ?? {}), [name]: { expression: `authored/${name}.exp3.json` } }
    next.expressions = { ...(next.expressions ?? {}), [name]: { ...affect } }
    const result = commitManifest(manifestPath, next)
    if (result.ok) return result
    unlinkSync(expressionPath)
    if (!authoredExisted) rmdirSync(authoredRoot)
    return result
  } catch (error) {
    if (existsSync(expressionPath)) unlinkSync(expressionPath)
    if (!authoredExisted && existsSync(authoredRoot)) rmdirSync(authoredRoot)
    return failure(`Cannot save expression: ${errorMessage(error)}`)
  }
}

/** Updates calibration for any cue, or sliders for an existing authored cue. */
export function updateExpression(manifestPath: string, name: string, update: ExpressionUpdate): AuthoringResult {
  const nameError = safeName(name)
  if (nameError) return failure(nameError)
  if (!update || (update.affect === undefined && update.params === undefined)) return failure('Provide affect or params to update an expression')
  const affectError = update.affect === undefined ? null : validAffect(update.affect)
  const paramsError = update.params === undefined ? null : validParams(update.params)
  if (affectError ?? paramsError) return failure(affectError ?? paramsError ?? 'Invalid expression update')

  const manifest = readManifest(manifestPath)
  if (isResult(manifest)) return manifest
  const cue = manifest.renderers.live2d.cues?.[name]
  if (!cue) return failure(`Unknown cue: ${name}`)
  const expression = (cue as { expression?: unknown }).expression
  if (update.params !== undefined && (typeof expression !== 'string' || !expression.startsWith('authored/'))) return failure('Slider updates are allowed only for authored expressions')

  const next = clonedManifest(manifest)
  if (update.affect !== undefined) next.expressions = { ...(next.expressions ?? {}), [name]: { ...update.affect } }
  if (update.params === undefined) {
    try {
      return commitManifest(manifestPath, next)
    } catch (error) {
      return failure(`Cannot update expression: ${errorMessage(error)}`)
    }
  }

  const packageRoot = dirname(manifestPath)
  const expressionPath = resolve(packageRoot, expression as string)
  const authoredRoot = resolve(packageRoot, 'authored')
  if (!isInside(authoredRoot, expressionPath) || !existsSync(expressionPath)) return failure('Authored expression path is invalid')
  const rootError = authoredRootError(packageRoot, authoredRoot)
  if (
    rootError ||
    !isInside(realpathSync(authoredRoot), realpathSync(expressionPath))
  ) {
    return failure(rootError ?? 'Authored expression path is invalid')
  }
  const staged = validateStaged(manifestPath, next)
  if (!staged.ok) return failure(staged.errors[0])
  const previous = readFileSync(expressionPath, 'utf8')
  try {
    atomicWrite(expressionPath, expressionJson(update.params))
    atomicWrite(manifestPath, JSON.stringify(next, null, 2) + '\n')
    const report = validateCharacter(manifestPath)
    return report.ok ? { ok: true, report } : failure(report.errors[0])
  } catch (error) {
    try {
      atomicWrite(expressionPath, previous)
    } catch {
      return failure('Cannot update expression and could not restore its previous authored file')
    }
    return failure(`Cannot update expression: ${errorMessage(error)}`)
  }
}
