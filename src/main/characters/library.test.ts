import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
  truncateSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  bundledPackageRoot,
  discardManagedCharacter,
  ensureManagedCharacterLibrary,
  importCharacterPackage,
  listCharacterPackages
} from './library'

const VALID = {
  format: 'lares/1',
  identity: { name: 'Hiyori', license: 'Live2D FML notice' },
  renderers: { live2d: { model: 'runtime/Hiyori.model3.json' } }
}

function writePackage(root: string, name = 'hiyori'): string {
  const packageRoot = join(root, name)
  mkdirSync(join(packageRoot, 'runtime'), { recursive: true })
  writeFileSync(join(packageRoot, 'lar.character.json'), JSON.stringify(VALID))
  writeFileSync(
    join(packageRoot, 'runtime', 'Hiyori.model3.json'),
    JSON.stringify({
      FileReferences: { Moc: 'Hiyori.moc3', Textures: ['Hiyori.png'] }
    })
  )
  writeFileSync(join(packageRoot, 'runtime', 'Hiyori.moc3'), 'moc')
  writeFileSync(join(packageRoot, 'runtime', 'Hiyori.png'), 'png')
  return packageRoot
}

function writeRawPackage(root: string, name = 'raw'): string {
  const packageRoot = join(root, name)
  const modelRoot = join(packageRoot, 'assets', 'model')
  mkdirSync(join(modelRoot, 'expressions'), { recursive: true })
  mkdirSync(join(modelRoot, 'motions'), { recursive: true })
  writeFileSync(
    join(modelRoot, 'lar.model3.json'),
    JSON.stringify({
      FileReferences: {
        Moc: 'lar.moc3',
        Textures: ['lar.png'],
        Expressions: [{ File: 'expressions/indexed-expression.exp3.json' }],
        Motions: { Idle: [{ File: 'motions/indexed-motion.motion3.json' }] }
      }
    })
  )
  writeFileSync(join(modelRoot, 'lar.moc3'), 'moc')
  writeFileSync(join(modelRoot, 'lar.png'), 'png')
  writeFileSync(join(modelRoot, 'expressions', 'indexed-expression.exp3.json'), JSON.stringify({ Parameters: [] }))
  writeFileSync(join(modelRoot, 'expressions', 'loose-expression.exp3.json'), JSON.stringify({ Parameters: [] }))
  writeFileSync(join(modelRoot, 'motions', 'indexed-motion.motion3.json'), '{}')
  writeFileSync(join(modelRoot, 'motions', 'loose-motion.motion3.json'), '{}')
  return packageRoot
}

describe('managed character library', () => {
  it('seeds an empty managed root once without overwriting it later', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'lares-library-'))
    const managedRoot = join(workspace, 'managed')
    const bundledRoot = writePackage(workspace, 'bundled')

    expect(ensureManagedCharacterLibrary(managedRoot, bundledRoot)).toEqual({ seeded: true })
    const copiedManifest = join(managedRoot, 'bundled', 'lar.character.json')
    expect(existsSync(copiedManifest)).toBe(true)

    const modified = JSON.stringify({
      userModified: true,
      FileReferences: { Moc: 'Hiyori.moc3', Textures: ['Hiyori.png'] }
    })
    writeFileSync(join(managedRoot, 'bundled', 'runtime', 'Hiyori.model3.json'), modified)
    expect(ensureManagedCharacterLibrary(managedRoot, bundledRoot)).toEqual({ seeded: false })
    expect(readFileSync(join(managedRoot, 'bundled', 'runtime', 'Hiyori.model3.json'), 'utf8')).toBe(modified)
  })

  it('imports a ready package as a validated managed copy', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'lares-library-'))
    const source = writePackage(workspace, 'source')
    writeFileSync(join(source, 'notice.txt'), 'keep me')

    const imported = importCharacterPackage(join(workspace, 'managed'), source)
    expect(imported).toMatchObject({ ok: true, character: { name: 'Hiyori' } })
    if (imported.ok) {
      expect(imported.manifestPath.startsWith(join(workspace, 'managed'))).toBe(true)
      expect(readFileSync(join(imported.manifestPath, '..', 'notice.txt'), 'utf8')).toBe('keep me')
      expect(existsSync(imported.character.live2d.model)).toBe(true)
    }
  })

  it('preserves authored cue mappings on package import and adds none on raw import', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'lares-library-'))
    const managedRoot = join(workspace, 'managed')
    const authored = writePackage(workspace, 'authored')
    writeFileSync(
      join(authored, 'lar.character.json'),
      JSON.stringify({
        ...VALID,
        expressions: { smile: { valence: 0.6, arousal: 0.4 } },
        cueMappings: { relief: 'smile', satisfaction: 'smile' },
        renderers: {
          live2d: {
            ...VALID.renderers.live2d,
            cues: { smile: { params: { ParamMouthForm: 1 } } }
          }
        }
      })
    )

    const imported = importCharacterPackage(managedRoot, authored)
    expect(imported).toMatchObject({
      ok: true,
      character: { cueMappings: { relief: 'smile', satisfaction: 'smile' } }
    })

    // Raw import discovers assets under artist names only; semantic meaning
    // comes solely from the explicit calibration workflow (011-D5).
    const raw = importCharacterPackage(managedRoot, writeRawPackage(workspace))
    expect(raw).toMatchObject({ ok: true, character: { cueMappings: {} } })
    if (raw.ok) {
      expect(raw.character.report.mappedCues).toEqual([])
      expect(JSON.parse(readFileSync(raw.manifestPath, 'utf8')).cueMappings).toBeUndefined()
    }
  })

  it('leaves an already-managed package unmigrated when the library is re-checked', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'lares-library-'))
    const managedRoot = join(workspace, 'managed')
    const bundledRoot = writePackage(workspace, 'bundled')
    expect(ensureManagedCharacterLibrary(managedRoot, bundledRoot)).toEqual({ seeded: true })

    const managedManifest = join(managedRoot, 'bundled', 'lar.character.json')
    const before = readFileSync(managedManifest, 'utf8')
    expect(ensureManagedCharacterLibrary(managedRoot, bundledRoot)).toEqual({ seeded: false })
    expect(readFileSync(managedManifest, 'utf8')).toBe(before)
    expect(JSON.parse(before).cueMappings).toBeUndefined()
  })

  it('discards only a direct managed package after a failed activation', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'lares-library-'))
    const managedRoot = join(workspace, 'managed')
    const source = writePackage(workspace, 'source')
    const imported = importCharacterPackage(managedRoot, source)
    expect(imported).toMatchObject({ ok: true })
    if (!imported.ok) return

    discardManagedCharacter(managedRoot, imported.manifestPath)
    expect(existsSync(join(managedRoot, 'source'))).toBe(false)
    expect(() =>
      discardManagedCharacter(managedRoot, join(source, 'lar.character.json'))
    ).toThrow('Refusing to discard character outside the managed root')
    expect(existsSync(source)).toBe(true)
  })

  it('refuses a symlinked source directory without adding it to the library', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'lares-library-'))
    const source = writePackage(workspace, 'source')
    const linkedSource = join(workspace, 'linked-source')
    const managedRoot = join(workspace, 'managed')
    symlinkSync(source, linkedSource)

    expect(importCharacterPackage(managedRoot, linkedSource)).toMatchObject({ ok: false })
    expect(existsSync(join(managedRoot, 'linked-source'))).toBe(false)
  })

  it('bounds imported package size before copying it into managed storage', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'lares-library-'))
    const source = writePackage(workspace, 'oversized')
    const managedRoot = join(workspace, 'managed')
    const oversized = join(source, 'oversized.bin')
    writeFileSync(oversized, '')
    truncateSync(oversized, 1024 * 1024 * 1024 + 1)

    const result = importCharacterPackage(managedRoot, source)
    expect(result).toMatchObject({ ok: false })
    if (!result.ok) expect(result.error).toContain('exceeds 1 GiB')
    expect(existsSync(join(managedRoot, 'oversized'))).toBe(false)
  })

  it('hides and clears the reserved staging namespace before deciding whether to seed', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'lares-library-'))
    const managedRoot = join(workspace, 'managed')
    writePackage(join(managedRoot, '.staging'), 'interrupted')
    const bundledRoot = writePackage(workspace, 'bundled')

    expect(listCharacterPackages(managedRoot)).toEqual([])
    expect(ensureManagedCharacterLibrary(managedRoot, bundledRoot)).toEqual({ seeded: true })
    expect(existsSync(join(managedRoot, '.staging', 'interrupted'))).toBe(false)
  })

  it('keeps a valid managed package whose name contains staging', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'lares-library-'))
    const managedRoot = join(workspace, 'managed')
    const packageRoot = writePackage(managedRoot, 'foo.staging-bar')
    const bundledRoot = writePackage(workspace, 'bundled')

    expect(listCharacterPackages(managedRoot).map((entry) => entry.label)).toEqual(['Hiyori'])
    expect(ensureManagedCharacterLibrary(managedRoot, bundledRoot)).toEqual({ seeded: false })
    expect(existsSync(packageRoot)).toBe(true)
  })

  it('imports one recursive raw model without flattening and harvests indexed plus loose assets', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'lares-library-'))
    const imported = importCharacterPackage(join(workspace, 'managed'), writeRawPackage(workspace))

    expect(imported).toMatchObject({ ok: true, character: { name: 'raw' } })
    if (imported.ok) {
      const manifest = JSON.parse(readFileSync(imported.manifestPath, 'utf8'))
      expect(manifest.renderers.live2d.model).toBe('assets/model/lar.model3.json')
      expect(manifest.renderers.live2d.cues).toEqual({
        'indexed-expression': { expression: 'assets/model/expressions/indexed-expression.exp3.json' },
        'loose-expression': { expression: 'assets/model/expressions/loose-expression.exp3.json' },
        'indexed-motion': { motion: 'assets/model/motions/indexed-motion.motion3.json' },
        'loose-motion': { motion: 'assets/model/motions/loose-motion.motion3.json' }
      })
      expect(existsSync(join(imported.manifestPath, '..', 'assets', 'model', 'lar.model3.json'))).toBe(true)
    }
  })

  it('refuses zero or multiple raw models without adding either to the library', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'lares-library-'))
    const managedRoot = join(workspace, 'managed')
    const zero = join(workspace, 'zero')
    const two = join(workspace, 'two')
    mkdirSync(zero)
    mkdirSync(two)
    writeFileSync(join(two, 'first.model3.json'), '{}')
    writeFileSync(join(two, 'second.model3.json'), '{}')

    const zeroResult = importCharacterPackage(managedRoot, zero)
    const twoResult = importCharacterPackage(managedRoot, two)
    expect(zeroResult).toMatchObject({ ok: false })
    expect(twoResult).toMatchObject({ ok: false })
    if (!zeroResult.ok) expect(zeroResult.error).toContain('Expected exactly one .model3.json')
    if (!twoResult.ok) expect(twoResult.error).toContain('Expected exactly one .model3.json')
    expect(existsSync(join(managedRoot, 'zero'))).toBe(false)
    expect(existsSync(join(managedRoot, 'two'))).toBe(false)
  })

  it('retains same-named imports with numbered inventory labels', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'lares-library-'))
    const managedRoot = join(workspace, 'managed')
    const first = importCharacterPackage(managedRoot, writePackage(join(workspace, 'one'), 'character'))
    const second = importCharacterPackage(managedRoot, writePackage(join(workspace, 'two'), 'character'))

    expect(first).toMatchObject({ ok: true })
    expect(second).toMatchObject({ ok: true })
    expect(listCharacterPackages(managedRoot).map((entry: { label: string }) => entry.label)).toEqual(['Hiyori', 'Hiyori (2)'])
  })

  it('resolves the packaged default separately from the development selection', () => {

    expect(bundledPackageRoot('/app', '/resources', true, 'ignored')).toBe('/resources/default-character')
    expect(bundledPackageRoot('/app', '/resources', false, 'alternate')).toBe('/app/characters/alternate')
  })
})
