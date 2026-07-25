import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadCharacter } from './manifest'

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
})
