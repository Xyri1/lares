import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadCharacter, selectCharacterManifest, validateCharacter } from './manifest'

const VALID = {
  format: 'lares/1',
  identity: { name: 'Hiyori', license: 'Live2D FML notice' },
  renderers: { live2d: { model: 'runtime/Hiyori.model3.json' } }
}

function writePackage(manifest: unknown, withModel = true): string {
  const dir = mkdtempSync(join(tmpdir(), 'lares-manifest-'))
  const path = join(dir, 'lar.character.json')
  writeFileSync(path, typeof manifest === 'string' ? manifest : JSON.stringify(manifest))
  if (withModel) {
    mkdirSync(join(dir, 'runtime'))
    writeFileSync(join(dir, 'runtime', 'Hiyori.model3.json'), '{}')
  }
  return path
}

describe('loadCharacter', () => {
  it('accepts a valid manifest and resolves the model path', () => {
    const result = loadCharacter(writePackage(VALID))
    expect(result).toMatchObject({ ok: true, name: 'Hiyori' })
    if (result.ok) {
      expect(result.live2d.model).toMatch(/Hiyori\.model3\.json$/)
      expect(result.live2d.model).not.toBe('runtime/Hiyori.model3.json') // absolute now
    }
  })

  it('rejects an unsupported format', () => {
    const result = loadCharacter(writePackage({ ...VALID, format: 'lares/2' }))
    expect(result).toMatchObject({ ok: false })
    if (!result.ok) expect(result.error).toContain('lares/2')
  })

  it('rejects a missing identity.license', () => {
    const result = loadCharacter(writePackage({ ...VALID, identity: { name: 'Hiyori' } }))
    expect(result).toMatchObject({ ok: false, error: 'Manifest missing identity.license' })
  })

  it('points at fetch-assets when the model file is missing', () => {
    const result = loadCharacter(writePackage(VALID, false))
    expect(result).toMatchObject({ ok: false })
    if (!result.ok) expect(result.error).toContain('pnpm fetch-assets')
  })

  it('reports unreadable JSON without throwing', () => {
    const result = loadCharacter(writePackage('{not json'))
    expect(result).toMatchObject({ ok: false })
    if (!result.ok) expect(result.error).toContain('not valid JSON')
  })

  it('defaults expressions to empty when the block is absent', () => {
    const result = loadCharacter(writePackage(VALID))
    expect(result).toMatchObject({ ok: true, expressions: {} })
  })

  it('accepts expressions and cue param sets, and reports them back', () => {
    const manifest = {
      ...VALID,
      expressions: { neutral: { valence: 0.1, arousal: 0.25 } },
      renderers: {
        live2d: {
          ...VALID.renderers.live2d,
          cues: { neutral: { params: { ParamMouthForm: 0 } } }
        }
      }
    }
    const result = loadCharacter(writePackage(manifest))
    expect(result).toMatchObject({ ok: true })
    if (result.ok) expect(result.expressions).toEqual({ neutral: { valence: 0.1, arousal: 0.25 } })
  })

  it('rejects an out-of-range expression valence', () => {
    const manifest = { ...VALID, expressions: { neutral: { valence: 1.5, arousal: 0.25 } } }
    const result = loadCharacter(writePackage(manifest))
    expect(result).toMatchObject({ ok: false })
    if (!result.ok) expect(result.error).toContain('valence')
  })

  it('rejects a non-numeric cue param value', () => {
    const manifest = {
      ...VALID,
      renderers: {
        live2d: {
          ...VALID.renderers.live2d,
          cues: { neutral: { params: { ParamMouthForm: 'wide' } } }
        }
      }
    }
    const result = loadCharacter(writePackage(manifest))
    expect(result).toMatchObject({ ok: false })
    if (!result.ok) expect(result.error).toContain('params')
  })

  it('accepts null coordinates and path-form expression and motion cues', () => {
    const path = writePackage({
      ...VALID,
      expressions: { surprise: null, wave: null },
      renderers: {
        live2d: {
          ...VALID.renderers.live2d,
          cues: {
            surprise: { expression: 'runtime/surprise.exp3.json' },
            wave: { motion: 'runtime/wave.motion3.json' }
          }
        }
      }
    })
    const runtime = join(path, '..', 'runtime')
    writeFileSync(join(runtime, 'surprise.exp3.json'), JSON.stringify({ Parameters: [] }))
    writeFileSync(join(runtime, 'wave.motion3.json'), '{}')

    const result = loadCharacter(path)
    expect(result).toMatchObject({ ok: true, expressions: { surprise: null, wave: null } })
    if (result.ok) expect(result.report).toMatchObject({ uncalibrated: 2, cues: { expression: 1, motion: 1 } })
  })

  it('reports out-of-range coordinates, broken paths, and malformed expressions', () => {
    const outOfRange = writePackage({
      ...VALID,
      expressions: { bad: { valence: 2, arousal: 0 } }
    })
    expect(validateCharacter(outOfRange).errors.join('\n')).toContain('valence')

    const broken = writePackage({
      ...VALID,
      renderers: { live2d: { ...VALID.renderers.live2d, cues: { missing: { expression: 'runtime/missing.exp3.json' } } } }
    })
    expect(validateCharacter(broken).errors.join('\n')).toContain('missing.exp3.json')

    const malformed = writePackage({
      ...VALID,
      renderers: { live2d: { ...VALID.renderers.live2d, cues: { bad: { expression: 'runtime/bad.exp3.json' } } } }
    })
    writeFileSync(join(malformed, '..', 'runtime', 'bad.exp3.json'), '{')
    expect(validateCharacter(malformed).errors.join('\n')).toContain('bad.exp3.json')
  })

  it('rejects model runtime references that escape the package', () => {
    const manifestPath = writePackage(VALID)
    writeFileSync(
      join(manifestPath, '..', 'runtime', 'Hiyori.model3.json'),
      JSON.stringify({ FileReferences: { Moc: '../../outside.moc3' } })
    )

    expect(validateCharacter(manifestPath).errors.join('\n')).toContain('Model runtime reference escapes character package')
  })

  it('requires every affect cue to have one renderer mapping and vice versa', () => {
    const unmapped = writePackage({
      ...VALID,
      expressions: { missing: null }
    })
    expect(validateCharacter(unmapped).errors.join('\n')).toContain('no Live2D mapping')

    const uncoordinated = writePackage({
      ...VALID,
      renderers: {
        live2d: {
          ...VALID.renderers.live2d,
          cues: { extra: { params: { ParamMouthForm: 1 } } }
        }
      }
    })
    expect(validateCharacter(uncoordinated).errors.join('\n')).toContain('no affect coordinates')
  })

  it('selects the first package alphabetically and diagnoses zero or many packages', () => {
    const root = mkdtempSync(join(tmpdir(), 'lares-characters-'))
    expect(selectCharacterManifest(root)).toMatchObject({ ok: false, error: 'No character package found under ' + root })
    mkdirSync(join(root, 'zeta'))
    mkdirSync(join(root, 'alpha'))
    writeFileSync(join(root, 'zeta', 'lar.character.json'), '{}')
    writeFileSync(join(root, 'alpha', 'lar.character.json'), '{}')
    const selected = selectCharacterManifest(root)
    expect(selected).toMatchObject({ ok: true, manifestPath: join(root, 'alpha', 'lar.character.json') })
    if (selected.ok) expect(selected.warning).toContain('Multiple character packages')
  })
})
