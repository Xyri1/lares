import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { basename, join } from 'node:path'
import { createManifestFromRawPackage, hasCharacterManifest } from './import'
import { loadCharacter, type ManifestResult } from './manifest'

const MANIFEST = 'lar.character.json'
const STAGING_DIRECTORY = '.staging'

function isStagingEntry(name: string): boolean {
  return name === STAGING_DIRECTORY
}

function clearStaging(root: string): void {
  if (!existsSync(root)) return
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (isStagingEntry(entry.name)) rmSync(join(root, entry.name), { recursive: true, force: true })
  }
}

export function bundledPackageRoot(
  appPath: string,
  resourcesPath: string,
  packaged: boolean,
  developmentDefault: string
): string {
  return packaged ? join(resourcesPath, 'default-character') : join(appPath, 'characters', developmentDefault)
}

function hasValidCharacter(root: string): boolean {
  return existsSync(root) && readdirSync(root, { withFileTypes: true }).some((entry) => {
    if (!entry.isDirectory() || isStagingEntry(entry.name)) return false
    return loadCharacter(join(root, entry.name, MANIFEST)).ok
  })
}

function destinationFor(root: string, source: string): string {
  const base = basename(source)
  let candidate = join(root, base)
  for (let suffix = 2; existsSync(candidate); suffix++) candidate = join(root, `${base}-${suffix}`)
  return candidate
}

function copyValidatedCharacter(
  root: string,
  source: string
): { manifestPath: string; character: Extract<ManifestResult, { ok: true }> } {
  const sourceStat = lstatSync(source)
  if (sourceStat.isSymbolicLink()) throw new Error('Import requires an extracted directory, not a symbolic link')
  if (!sourceStat.isDirectory()) throw new Error('Import requires an extracted directory')
  mkdirSync(root, { recursive: true })
  const destination = destinationFor(root, source)
  const stagingRoot = join(root, STAGING_DIRECTORY)
  const staging = join(stagingRoot, randomUUID())
  try {
    mkdirSync(stagingRoot, { recursive: true })
    cpSync(source, staging, { recursive: true })
    if (!hasCharacterManifest(staging)) createManifestFromRawPackage(staging, staging, basename(source))
    const copiedCharacter = loadCharacter(join(staging, MANIFEST))
    if (!copiedCharacter.ok) throw new Error(copiedCharacter.error)
    renameSync(staging, destination)
    return { manifestPath: join(destination, MANIFEST), character: copiedCharacter }
  } catch (error) {
    rmSync(staging, { recursive: true, force: true })
    throw error
  }
}

/** Seeds the managed library only when it has no valid character package. */
export function ensureManagedCharacterLibrary(root: string, bundledPackageRoot: string): { seeded: boolean } {
  clearStaging(root)
  if (hasValidCharacter(root)) return { seeded: false }
  copyValidatedCharacter(root, bundledPackageRoot)
  return { seeded: true }
}

/** Copies a ready, validated package into the managed library. */
export function importCharacterPackage(
  root: string,
  source: string
):
  | { ok: true; manifestPath: string; character: Extract<ManifestResult, { ok: true }> }
  | { ok: false; error: string } {
  try {
    return { ok: true, ...copyValidatedCharacter(root, source) }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/** Lists valid managed packages with deterministic labels for duplicate names. */
export function listCharacterPackages(
  root: string
): { manifestPath: string; character: Extract<ManifestResult, { ok: true }>; label: string }[] {
  if (!existsSync(root)) return []
  const packages = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !isStagingEntry(entry.name))
    .map((entry) => ({ manifestPath: join(root, entry.name, MANIFEST), character: loadCharacter(join(root, entry.name, MANIFEST)) }))
    .filter((entry): entry is { manifestPath: string; character: Extract<ManifestResult, { ok: true }> } => entry.character.ok)
    .sort((a, b) => a.manifestPath.localeCompare(b.manifestPath))
  const names = new Map<string, number>()
  return packages.map((entry) => {
    const count = (names.get(entry.character.name) ?? 0) + 1
    names.set(entry.character.name, count)
    return { ...entry, label: count === 1 ? entry.character.name : `${entry.character.name} (${count})` }
  })
}
