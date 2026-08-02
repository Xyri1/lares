import { existsSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, join, relative, sep } from 'node:path'
import { validateCharacter, type ValidationReport } from './manifest.ts'

const MANIFEST = 'lar.character.json'

function toPackagePath(packageRoot: string, path: string): string {
  return relative(packageRoot, path).split(sep).join('/')
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

/** Writes and validates a lares/1 manifest for one unambiguous raw Live2D tree.
 * Expression/motion assets need no dedicated discovery here: the manifest's
 * own resource catalog (manifest.ts `inspectModel`) reports what the package
 * has regardless of any cue vocabulary (013-D11 retires that workflow). */
export function createManifestFromRawPackage(
  packageRoot: string,
  scanRoot = packageRoot,
  identityName = basename(packageRoot)
): ValidationReport {
  const modelPaths = findModels(scanRoot)
  if (modelPaths.length !== 1) {
    throw new Error(`Expected exactly one .model3.json under ${scanRoot}, found ${modelPaths.length}`)
  }
  const manifestPath = join(packageRoot, MANIFEST)
  writeFileSync(
    manifestPath,
    `${JSON.stringify(
      {
        format: 'lares/1',
        identity: { name: identityName, author: 'Unknown', license: 'Unknown' },
        renderers: { live2d: { model: toPackagePath(packageRoot, modelPaths[0]) } }
      },
      null,
      2
    )}\n`
  )
  const result = validateCharacter(manifestPath)
  if (!result.ok) throw new Error(result.errors.join('\n'))
  return result
}

export function hasCharacterManifest(packageRoot: string): boolean {
  return existsSync(join(packageRoot, MANIFEST))
}
