import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { saveExpression, updateExpression } from './authoring'
import { validateCharacter } from './manifest'

const expression = (params: Record<string, number> = {}) => ({
  Type: 'Live2D Expression',
  Parameters: Object.entries(params).map(([Id, Value]) => ({ Id, Value, Blend: 'Overwrite' }))
})

function writePackage(cues: Record<string, unknown> = {}, expressions: Record<string, unknown> = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'lares-authoring-'))
  mkdirSync(join(dir, 'runtime'))
  writeFileSync(
    join(dir, 'runtime', 'model.model3.json'),
    JSON.stringify({
      FileReferences: { Moc: 'model.moc3', Textures: ['model.png'] }
    })
  )
  writeFileSync(join(dir, 'runtime', 'model.moc3'), 'moc')
  writeFileSync(join(dir, 'runtime', 'model.png'), 'png')
  writeFileSync(join(dir, 'runtime', 'smile.exp3.json'), JSON.stringify(expression({ ParamSmile: 0.5 })))
  const manifestPath = join(dir, 'lar.character.json')
  writeFileSync(manifestPath, JSON.stringify({
    format: 'lares/1',
    identity: { name: 'Test Lar', license: 'test' },
    expressions,
    renderers: { live2d: { model: 'runtime/model.model3.json', cues } }
  }))
  return manifestPath
}

describe('character authoring', () => {
  it('creates an authored exp3 artifact and valid manifest cue', () => {
    const manifestPath = writePackage()

    const result = saveExpression(manifestPath, 'delight', { ParamMouth: 0.8 }, { valence: 0.75, arousal: 0.6 })

    expect(result).toMatchObject({ ok: true, report: { ok: true, cues: { authored: 1 }, calibrated: 1 } })
    expect(JSON.parse(readFileSync(join(manifestPath, '..', 'authored', 'delight.exp3.json'), 'utf8'))).toEqual(expression({ ParamMouth: 0.8 }))
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    expect(manifest.renderers.live2d.cues.delight).toEqual({ expression: 'authored/delight.exp3.json' })
    expect(manifest.expressions.delight).toEqual({ valence: 0.75, arousal: 0.6 })
    expect(validateCharacter(manifestPath)).toMatchObject({ ok: true })
  })

  it('refuses a name already used by a bundled cue', () => {
    const manifestPath = writePackage({ smile: { expression: 'runtime/smile.exp3.json' } }, { smile: null })

    expect(saveExpression(manifestPath, 'smile', {}, { valence: 0, arousal: 0 })).toMatchObject({ ok: false })
    expect(existsSync(join(manifestPath, '..', 'authored', 'smile.exp3.json'))).toBe(false)
  })

  it('caps authored cues at fifty', () => {
    const cues: Record<string, unknown> = {}
    const coordinates: Record<string, unknown> = {}
    const manifestPath = writePackage(cues, coordinates)
    const authored = join(manifestPath, '..', 'authored')
    mkdirSync(authored)
    for (let index = 0; index < 50; index++) {
      const name = `cue-${index}`
      cues[name] = { expression: `authored/${name}.exp3.json` }
      coordinates[name] = null
      writeFileSync(join(authored, `${name}.exp3.json`), JSON.stringify(expression()))
    }
    writeFileSync(manifestPath, JSON.stringify({
      format: 'lares/1', identity: { name: 'Test Lar', license: 'test' }, expressions: coordinates,
      renderers: { live2d: { model: 'runtime/model.model3.json', cues } }
    }))

    expect(saveExpression(manifestPath, 'one-more', {}, { valence: 0, arousal: 0 })).toMatchObject({ ok: false })
    expect(existsSync(join(authored, 'one-more.exp3.json'))).toBe(false)
  })

  it('updates affect on a bundled expression without touching its file', () => {
    const manifestPath = writePackage({ smile: { expression: 'runtime/smile.exp3.json' } }, { smile: null })
    const bundled = join(manifestPath, '..', 'runtime', 'smile.exp3.json')
    const before = readFileSync(bundled, 'utf8')

    expect(updateExpression(manifestPath, 'smile', { affect: { valence: -0.2, arousal: 0.4 } })).toMatchObject({ ok: true })
    expect(readFileSync(bundled, 'utf8')).toBe(before)
    expect(JSON.parse(readFileSync(manifestPath, 'utf8')).expressions.smile).toEqual({ valence: -0.2, arousal: 0.4 })
  })

  it('refuses slider updates for bundled expressions', () => {
    const manifestPath = writePackage({ smile: { expression: 'runtime/smile.exp3.json' } }, { smile: null })

    expect(updateExpression(manifestPath, 'smile', { params: { ParamSmile: 1 } })).toMatchObject({ ok: false })
    expect(JSON.parse(readFileSync(manifestPath, 'utf8')).expressions.smile).toBeNull()
  })

  it('updates sliders only for authored expressions', () => {
    const manifestPath = writePackage({ custom: { expression: 'authored/custom.exp3.json' } }, { custom: null })
    const authored = join(manifestPath, '..', 'authored')
    mkdirSync(authored)
    writeFileSync(join(authored, 'custom.exp3.json'), JSON.stringify(expression({ ParamMouth: 0 })))

    expect(updateExpression(manifestPath, 'custom', { params: { ParamMouth: 1 }, affect: { valence: 1, arousal: 0.8 } })).toMatchObject({ ok: true, report: { ok: true } })
    expect(JSON.parse(readFileSync(join(authored, 'custom.exp3.json'), 'utf8'))).toEqual(expression({ ParamMouth: 1 }))
    expect(JSON.parse(readFileSync(manifestPath, 'utf8')).expressions.custom).toEqual({ valence: 1, arousal: 0.8 })
  })

  it('refuses updates for unknown cues', () => {
    const manifestPath = writePackage()

    expect(updateExpression(manifestPath, 'missing', { affect: { valence: 0, arousal: 0 } })).toMatchObject({ ok: false })
  })

  it('rejects unsafe cue names before creating a path', () => {
    const manifestPath = writePackage()

    for (const name of ['../escape', 'nested/name', 'nested\\name', 'NUL']) {
      expect(saveExpression(manifestPath, name, {}, { valence: 0, arousal: 0 })).toMatchObject({ ok: false })
    }
    expect(existsSync(join(manifestPath, '..', 'escape.exp3.json'))).toBe(false)
    expect(existsSync(join(manifestPath, '..', 'authored'))).toBe(false)
  })

  it.skipIf(process.platform === 'win32')('rejects an authored directory symlink that escapes the package', () => {
    const manifestPath = writePackage()
    const outside = mkdtempSync(join(tmpdir(), 'lares-authoring-outside-'))
    symlinkSync(outside, join(manifestPath, '..', 'authored'))

    expect(
      saveExpression(
        manifestPath,
        'escape',
        { ParamMouth: 1 },
        { valence: 0, arousal: 0 }
      )
    ).toMatchObject({ ok: false, error: expect.stringContaining('symbolic link') })
    expect(existsSync(join(outside, 'escape.exp3.json'))).toBe(false)
  })
})
