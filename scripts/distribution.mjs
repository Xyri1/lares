import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync
} from 'node:fs'
import { createRequire } from 'node:module'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { validateCharacter } from '../src/main/characters/manifest.ts'

const REQUIRED_INPUTS = [
  'out/main/index.js',
  'out/preload/index.js',
  'out/renderer/index.html',
  'out/renderer/live2dcubismcore.min.js',
  'vendor/live2d/live2dcubismcore.min.js',
  'scripts/forwarder.js',
  'resources/icon.png',
  'LICENSE',
  'NOTICE'
]

function requireFile(path, label = path) {
  if (!existsSync(path) || !lstatSync(path).isFile()) {
    throw new Error(`Missing distribution input: ${label}`)
  }
}

function filesUnder(root) {
  const files = []
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isSymbolicLink()) throw new Error(`Symlinks are forbidden in artifacts: ${path}`)
      if (entry.isDirectory()) visit(path)
      else if (entry.isFile()) files.push(path)
    }
  }
  visit(root)
  return files
}

function archivedAppPaths(path) {
  const require = createRequire(import.meta.url)
  const builder = dirname(require.resolve('electron-builder/package.json'))
  const asar = require(require.resolve('@electron/asar', { paths: [builder] }))
  return asar.listPackage(path).map((entry) => entry.replace(/^[/\\]/, '').replaceAll('\\', '/'))
}

function validateDefaultCharacter(root) {
  const manifestPath = join(root, 'lar.character.json')
  requireFile(manifestPath, 'default-character/lar.character.json')
  requireFile(join(root, 'NOTICE'), 'default-character/NOTICE')
  const report = validateCharacter(manifestPath)
  if (!report.ok) throw new Error(`Invalid default character: ${report.errors.join('; ')}`)
}

export function selectedDefaultCharacter(root, env = process.env) {
  const selection = join(resolve(root), 'build', 'default-character')
  if (!env.LARES_DEFAULT_CHARACTER) requireFile(selection, 'build/default-character')
  const name = env.LARES_DEFAULT_CHARACTER || readFileSync(selection, 'utf8').trim()
  if (!/^[A-Za-z0-9._-]+$/.test(name) || name === '.' || name === '..') {
    throw new Error(`Invalid default character name: ${name}`)
  }
  return join(resolve(root), 'characters', name)
}

export function packagePreflight(root, env = process.env) {
  const project = resolve(root)
  for (const input of REQUIRED_INPUTS) requireFile(join(project, input), input)
  const character = selectedDefaultCharacter(project, env)
  validateDefaultCharacter(character)
  for (const path of filesUnder(character)) {
    if (/\.(?:cmo3|can3)$/i.test(path)) {
      throw new Error(`Source-only character file is forbidden: ${path}`)
    }
  }
  return { character }
}

function inspectUniversalMachO(path) {
  const bytes = readFileSync(path)
  const magic = bytes.length >= 8 ? bytes.readUInt32BE(0) : 0
  const entrySize = magic === 0xcafebabe ? 20 : magic === 0xcafebabf ? 32 : 0
  if (!entrySize) throw new Error('Lares executable is not a universal Mach-O')
  const count = bytes.readUInt32BE(4)
  const architectures = new Set()
  for (let index = 0; index < count; index += 1) {
    const offset = 8 + index * entrySize
    if (offset + 4 > bytes.length) throw new Error('Lares universal Mach-O header is truncated')
    architectures.add(bytes.readUInt32BE(offset))
  }
  if (!architectures.has(0x01000007) || !architectures.has(0x0100000c)) {
    throw new Error('Lares executable is not universal x64 + arm64')
  }
}

function inspectX64Pe(path) {
  const bytes = readFileSync(path)
  if (bytes.length < 70 || bytes.toString('ascii', 0, 2) !== 'MZ') {
    throw new Error('Lares executable is not a Windows PE file')
  }
  const header = bytes.readUInt32LE(0x3c)
  if (
    header + 6 > bytes.length ||
    bytes.toString('binary', header, header + 4) !== 'PE\u0000\u0000' ||
    bytes.readUInt16LE(header + 4) !== 0x8664
  ) {
    throw new Error('Lares executable is not Windows x64')
  }
}

export function inspectArtifact(artifact, platform, arch) {
  const root = resolve(artifact)
  let resources
  if (platform === 'darwin') {
    if (arch !== 'universal' || !root.endsWith('.app')) {
      throw new Error('Expected a universal macOS .app artifact')
    }
    const executable = join(root, 'Contents', 'MacOS', 'Lares')
    requireFile(executable, 'Contents/MacOS/Lares')
    inspectUniversalMachO(executable)
    resources = join(root, 'Contents', 'Resources')
  } else if (platform === 'win32') {
    if (arch !== 'x64') throw new Error('Expected a Windows x64 artifact')
    const executable = join(root, 'Lares.exe')
    requireFile(executable, 'Lares.exe')
    inspectX64Pe(executable)
    resources = join(root, 'resources')
  } else {
    throw new Error(`Unsupported artifact platform: ${platform}`)
  }

  const requiredApp = [
    'out/main/index.js',
    'out/preload/index.js',
    'out/renderer/index.html',
    'out/renderer/live2dcubismcore.min.js',
    'scripts/forwarder.js',
    'resources/icon.png',
    'package.json'
  ]
  const archive = join(resources, 'app.asar')
  const unpacked = join(resources, 'app')
  const appPaths = existsSync(archive)
    ? archivedAppPaths(archive)
    : filesUnder(unpacked).map((path) => relative(unpacked, path).replaceAll(sep, '/'))
  for (const path of requiredApp) {
    if (!appPaths.includes(path)) throw new Error(`Missing distribution input: app/${path}`)
  }
  for (const path of ['default-character/lar.character.json', 'LICENSE', 'NOTICE']) {
    requireFile(join(resources, path), path)
  }
  validateDefaultCharacter(join(resources, 'default-character'))

  const paths = [
    ...filesUnder(resources).map((path) => relative(resources, path).replaceAll(sep, '/')),
    ...appPaths.map((path) => `app/${path}`)
  ]
  const manifests = paths.filter((path) => path.endsWith('/lar.character.json'))
  if (
    manifests.length !== 1 ||
    manifests[0] !== 'default-character/lar.character.json'
  ) {
    throw new Error(`Expected exactly one selected default character; found ${manifests.join(', ')}`)
  }
  const forbidden = paths.find(
    (path) =>
      path.toLowerCase().includes('icegirl') ||
      path.split('/').some((part) => part.toLowerCase() === 'characters') ||
      /\.(?:cmo3|can3)$/i.test(path)
  )
  if (forbidden) throw new Error(`Artifact contains forbidden content: ${forbidden}`)
  return { platform, arch, resources, files: paths.length }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : ''
if (import.meta.url === invokedPath) {
  const args = process.argv.slice(2)
  if (args[1] === '--') args.splice(1, 1)
  const [command, target, platform, arch] = args
  try {
    const result =
      command === 'preflight'
        ? packagePreflight(target || resolve(dirname(fileURLToPath(import.meta.url)), '..'))
        : command === 'inspect' && target && platform && arch
          ? inspectArtifact(target, platform, arch)
          : null
    if (!result) throw new Error('Usage: distribution.mjs preflight <root> | inspect <artifact> <darwin|win32> <universal|x64>')
    console.log(JSON.stringify(result))
  } catch (error) {
    console.error(`[lares] ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}
