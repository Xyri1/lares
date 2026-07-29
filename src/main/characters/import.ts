import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { validateCharacter, type ValidationReport } from './manifest.ts'

const MANIFEST = 'lar.character.json'

function toPackagePath(packageRoot: string, path: string): string {
  return relative(packageRoot, path).split(sep).join('/')
}

function scan(root: string, packageRoot: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name)
    if (entry.isDirectory()) files.push(...scan(path, packageRoot))
    else if (entry.isFile() && (entry.name.endsWith('.exp3.json') || entry.name.endsWith('.motion3.json'))) {
      files.push(toPackagePath(packageRoot, path))
    }
  }
  return files
}

function findModels(root: string): string[] {
  const models: string[] = []
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name)
    if (entry.isDirectory()) models.push(...findModels(path))
    else if (entry.isFile() && entry.name.endsWith('.model3.json')) models.push(path)
  }
  return models
}

function fileReferences(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(fileReferences)
  if (typeof value !== 'object' || value === null) return []
  const record = value as Record<string, unknown>
  return [
    ...(typeof record.File === 'string' ? [record.File] : []),
    ...Object.values(record).flatMap(fileReferences)
  ]
}

function modelReferences(modelPath: string, packageRoot: string): string[] {
  const model = JSON.parse(readFileSync(modelPath, 'utf8')) as { FileReferences?: { Expressions?: unknown; Motions?: unknown } }
  const refs = model.FileReferences ?? {}
  const modelDir = dirname(modelPath)
  return [
    ...fileReferences(refs.Expressions).map((path) => toPackagePath(packageRoot, resolve(modelDir, path))),
    ...fileReferences(refs.Motions).map((path) => toPackagePath(packageRoot, resolve(modelDir, path)))
  ]
}

function cueName(path: string): string {
  return basename(path).replace(/\.(?:exp3|motion3)\.json$/, '')
}

/** Writes and validates a lares/1 manifest for one unambiguous raw Live2D tree. */
export function createManifestFromRawPackage(
  packageRoot: string,
  scanRoot = packageRoot,
  identityName = basename(packageRoot)
): ValidationReport {
  const modelPaths = findModels(scanRoot)
  if (modelPaths.length !== 1) {
    throw new Error(`Expected exactly one .model3.json under ${scanRoot}, found ${modelPaths.length}`)
  }
  const modelPath = modelPaths[0]
  const pathsByKind = new Map<string, 'expression' | 'motion'>()
  for (const path of [...scan(scanRoot, packageRoot), ...modelReferences(modelPath, packageRoot)]) {
    const kind = path.endsWith('.exp3.json') ? 'expression' : path.endsWith('.motion3.json') ? 'motion' : null
    if (kind) pathsByKind.set(path, kind)
  }
  const expressions: Record<string, null> = {}
  const cues: Record<string, { expression: string } | { motion: string }> = {}
  for (const [path, kind] of [...pathsByKind.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const name = cueName(path)
    if (Object.hasOwn(cues, name)) throw new Error(`Duplicate cue name ${JSON.stringify(name)} from ${path}`)
    expressions[name] = null
    cues[name] = kind === 'expression' ? { expression: path } : { motion: path }
  }
  const manifestPath = join(packageRoot, MANIFEST)
  writeFileSync(
    manifestPath,
    `${JSON.stringify({
      format: 'lares/1',
      identity: { name: identityName, author: 'Unknown', license: 'Unknown' },
      expressions,
      renderers: { live2d: { model: toPackagePath(packageRoot, modelPath), cues } }
    }, null, 2)}\n`
  )
  const result = validateCharacter(manifestPath)
  if (!result.ok) throw new Error(result.errors.join('\n'))
  return result
}

export function hasCharacterManifest(packageRoot: string): boolean {
  return existsSync(join(packageRoot, MANIFEST))
}
