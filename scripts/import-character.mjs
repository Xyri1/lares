import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { validateCharacter } from '../src/main/characters/manifest.ts'

const MANIFEST = 'lar.character.json'

function usage() {
  throw new Error('Usage: pnpm run import -- [--check] characters/<name>')
}

function toPackagePath(packageRoot, path) {
  return relative(packageRoot, path).split(sep).join('/')
}

function scan(runtimeRoot, packageRoot) {
  const files = []
  for (const entry of readdirSync(runtimeRoot, { withFileTypes: true })) {
    const path = join(runtimeRoot, entry.name)
    if (entry.isDirectory()) files.push(...scan(path, packageRoot))
    else if (entry.isFile() && (entry.name.endsWith('.exp3.json') || entry.name.endsWith('.motion3.json'))) {
      files.push(toPackagePath(packageRoot, path))
    }
  }
  return files
}

function fileReferences(value) {
  if (Array.isArray(value)) return value.flatMap(fileReferences)
  if (typeof value !== 'object' || value === null) return []
  const record = value
  return [
    ...(typeof record.File === 'string' ? [record.File] : []),
    ...Object.values(record).flatMap(fileReferences)
  ]
}

function modelReferences(modelPath, packageRoot) {
  const model = JSON.parse(readFileSync(modelPath, 'utf8'))
  const refs = model.FileReferences ?? {}
  const modelDir = dirname(modelPath)
  return [
    ...fileReferences(refs.Expressions).map((path) => toPackagePath(packageRoot, resolve(modelDir, path))),
    ...fileReferences(refs.Motions).map((path) => toPackagePath(packageRoot, resolve(modelDir, path)))
  ]
}

function cueName(path) {
  return basename(path).replace(/\.(?:exp3|motion3)\.json$/, '')
}

function report(result) {
  console.log(JSON.stringify(result))
  console.log(`${result.uncalibrated} cues uncalibrated — ask your agent to run the mapping flow.`)
}

export function run(argv) {
  const check = argv.includes('--check')
  const paths = argv.filter((arg) => arg !== '--check' && arg !== '--')
  if (paths.length !== 1) usage()
  const packageRoot = resolve(paths[0])
  const manifestPath = join(packageRoot, MANIFEST)

  if (check) {
    if (!existsSync(manifestPath)) throw new Error(`Character manifest not found: ${manifestPath}`)
    const result = validateCharacter(manifestPath)
    report(result)
    if (!result.ok) throw new Error(result.errors.join('\n'))
    return result
  }
  if (existsSync(manifestPath)) throw new Error(`Character manifest already exists: ${manifestPath}; use --check to validate it`)

  const runtimeRoot = join(packageRoot, 'runtime')
  if (!existsSync(runtimeRoot)) throw new Error(`Runtime directory not found: ${runtimeRoot}`)
  const modelPaths = []
  const findModels = (root) => {
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      const path = join(root, entry.name)
      if (entry.isDirectory()) findModels(path)
      else if (entry.isFile() && entry.name.endsWith('.model3.json')) modelPaths.push(path)
    }
  }
  findModels(runtimeRoot)
  if (modelPaths.length !== 1) throw new Error(`Expected exactly one .model3.json under ${runtimeRoot}, found ${modelPaths.length}`)
  const modelPath = modelPaths[0]
  const pathsByKind = new Map()
  for (const path of [...scan(runtimeRoot, packageRoot), ...modelReferences(modelPath, packageRoot)]) {
    const kind = path.endsWith('.exp3.json') ? 'expression' : path.endsWith('.motion3.json') ? 'motion' : null
    if (kind) pathsByKind.set(path, kind)
  }
  const expressions = {}
  const cues = {}
  for (const [path, kind] of [...pathsByKind.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const name = cueName(path)
    if (Object.hasOwn(cues, name)) throw new Error(`Duplicate cue name ${JSON.stringify(name)} from ${path}`)
    expressions[name] = null
    cues[name] = { [kind]: path }
  }
  writeFileSync(manifestPath, `${JSON.stringify({
    format: 'lares/1',
    identity: { name: basename(packageRoot), author: 'Unknown', license: 'Unknown' },
    expressions,
    renderers: { live2d: { model: toPackagePath(packageRoot, modelPath), cues } }
  }, null, 2)}\n`)
  const result = validateCharacter(manifestPath)
  report(result)
  if (!result.ok) throw new Error(result.errors.join('\n'))
  return result
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    run(process.argv.slice(2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
