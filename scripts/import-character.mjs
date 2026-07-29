import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { validateCharacter } from '../src/main/characters/manifest.ts'
import { createManifestFromRawPackage } from '../src/main/characters/import.ts'

const MANIFEST = 'lar.character.json'

function usage() {
  throw new Error('Usage: pnpm run import -- [--check] characters/<name>')
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
  const result = createManifestFromRawPackage(packageRoot, runtimeRoot)
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
