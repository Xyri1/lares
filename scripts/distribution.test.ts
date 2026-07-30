import { mkdir, mkdtemp, rm, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  inspectArtifact,
  packagePreflight,
  selectedDefaultCharacter
} from './distribution.mjs'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function file(path: string, content: string | Buffer = 'fixture'): Promise<void> {
  await mkdir(join(path, '..'), { recursive: true })
  await writeFile(path, content)
}

async function defaultCharacter(root: string): Promise<void> {
  await file(join(root, 'NOTICE'), 'Fixture character notice')
  await file(
    join(root, 'lar.character.json'),
    JSON.stringify({
      format: 'lares/1',
      identity: { name: 'Fixture', license: 'Fixture only' },
      expressions: {},
      renderers: { live2d: { model: 'runtime/model.model3.json', cues: {} } }
    })
  )
  await file(
    join(root, 'runtime/model.model3.json'),
    JSON.stringify({
      FileReferences: { Moc: 'model.moc3', Textures: ['texture.png'] }
    })
  )
  await file(join(root, 'runtime/model.moc3'))
  await file(join(root, 'runtime/texture.png'))
}

function universalMachO(): Buffer {
  const bytes = Buffer.alloc(48)
  bytes.writeUInt32BE(0xcafebabe, 0)
  bytes.writeUInt32BE(2, 4)
  bytes.writeUInt32BE(0x01000007, 8)
  bytes.writeUInt32BE(0x0100000c, 28)
  return bytes
}

function x64Pe(): Buffer {
  const bytes = Buffer.alloc(128)
  bytes.write('MZ', 0)
  bytes.writeUInt32LE(64, 0x3c)
  bytes.write('PE\u0000\u0000', 64)
  bytes.writeUInt16LE(0x8664, 68)
  return bytes
}

async function appResources(resources: string): Promise<void> {
  for (const path of [
    'app/out/main/index.js',
    'app/out/preload/index.js',
    'app/out/renderer/index.html',
    'app/out/renderer/live2dcubismcore.min.js',
    'app/scripts/forwarder.js',
    'app/resources/icon.png',
    'app/package.json',
    'LICENSE',
    'NOTICE'
  ]) {
    await file(join(resources, path))
  }
  await defaultCharacter(join(resources, 'default-character'))
}

describe('distribution inputs', () => {
  it('selects one safe default and fails preflight when runtime inputs are absent', async () => {
    const root = await mkdtemp(join(tmpdir(), 'lares-package-inputs-'))
    roots.push(root)
    expect(() => selectedDefaultCharacter(root, {})).toThrow('build/default-character')
    await file(join(root, 'build/default-character'), 'hiyori\n')
    expect(selectedDefaultCharacter(root, {})).toBe(join(root, 'characters/hiyori'))
    expect(() => selectedDefaultCharacter(root, { LARES_DEFAULT_CHARACTER: '../icegirl' })).toThrow(
      'character'
    )

    for (const path of [
      'out/main/index.js',
      'out/preload/index.js',
      'out/renderer/index.html',
      'out/renderer/live2dcubismcore.min.js',
      'vendor/live2d/live2dcubismcore.min.js',
      'scripts/forwarder.js',
      'resources/icon.png',
      'LICENSE',
      'NOTICE'
    ]) {
      await file(join(root, path))
    }
    await defaultCharacter(join(root, 'characters/hiyori'))
    expect(() => packagePreflight(root, {})).not.toThrow()

    const characterNotice = join(root, 'characters/hiyori/NOTICE')
    await unlink(characterNotice)
    expect(() => packagePreflight(root, {})).toThrow('default-character/NOTICE')
    await file(characterNotice, 'Fixture character notice')

    const texture = join(root, 'characters/hiyori/runtime/texture.png')
    await unlink(texture)
    expect(() => packagePreflight(root, {})).toThrow('Required model resource')
    await file(texture)

    await unlink(join(root, 'vendor/live2d/live2dcubismcore.min.js'))
    expect(() => packagePreflight(root, {})).toThrow('live2dcubismcore')
  })
})

describe('mechanical unpacked-artifact inspection', () => {
  it('accepts universal macOS and x64 Windows artifacts', async () => {
    const root = await mkdtemp(join(tmpdir(), 'lares-artifacts-'))
    roots.push(root)
    const mac = join(root, 'Lares.app')
    await file(join(mac, 'Contents/MacOS/Lares'), universalMachO())
    await appResources(join(mac, 'Contents/Resources'))
    expect(inspectArtifact(mac, 'darwin', 'universal')).toMatchObject({
      platform: 'darwin',
      arch: 'universal'
    })

    const windows = join(root, 'win-unpacked')
    await file(join(windows, 'Lares.exe'), x64Pe())
    await appResources(join(windows, 'resources'))
    expect(inspectArtifact(windows, 'win32', 'x64')).toMatchObject({
      platform: 'win32',
      arch: 'x64'
    })
  })

  it('rejects missing files, wrong architecture, and private/source leakage', async () => {
    const root = await mkdtemp(join(tmpdir(), 'lares-artifact-bad-'))
    roots.push(root)
    const mac = join(root, 'Lares.app')
    await file(join(mac, 'Contents/MacOS/Lares'), universalMachO())
    const resources = join(mac, 'Contents/Resources')
    await appResources(resources)

    await unlink(join(resources, 'NOTICE'))
    expect(() => inspectArtifact(mac, 'darwin', 'universal')).toThrow('NOTICE')
    await file(join(resources, 'NOTICE'))

    await file(join(resources, 'app/characters/icegirl/model.cmo3'))
    expect(() => inspectArtifact(mac, 'darwin', 'universal')).toThrow('forbidden')
    await rm(join(resources, 'app/characters'), { recursive: true })

    await file(join(mac, 'Contents/MacOS/Lares'), x64Pe())
    expect(() => inspectArtifact(mac, 'darwin', 'universal')).toThrow('universal')
  })
})
