import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  loadCharacter,
  mergeRuntimeCompatibility,
  selectCharacterManifest,
  validateCharacter
} from './manifest'

const VALID = {
  format: 'lares/1',
  identity: { name: 'Hiyori', license: 'Live2D FML notice' },
  renderers: { live2d: { model: 'runtime/Hiyori.model3.json' } }
}

function writeRuntime(
  root: string,
  model = 'Hiyori',
  motions?: Record<string, number | unknown[]>
): void {
  mkdirSync(join(root, 'runtime'), { recursive: true })
  writeFileSync(
    join(root, 'runtime', `${model}.model3.json`),
    JSON.stringify({
      FileReferences: {
        Moc: `${model}.moc3`,
        Textures: [`${model}.png`],
        ...(motions
          ? {
              Motions: Object.fromEntries(
                Object.entries(motions).map(([group, entries]) => [
                  group,
                  typeof entries === 'number'
                    ? Array.from({ length: entries }, () => ({ File: `${group}.motion3.json` }))
                    : entries
                ])
              )
            }
          : {})
      }
    })
  )
  writeFileSync(join(root, 'runtime', `${model}.moc3`), 'moc')
  writeFileSync(join(root, 'runtime', `${model}.png`), 'png')
}

function writePackage(
  manifest: unknown,
  withModel = true,
  motions?: Record<string, number | unknown[]>
): string {
  const dir = mkdtempSync(join(tmpdir(), 'lares-manifest-'))
  const path = join(dir, 'lar.character.json')
  writeFileSync(path, typeof manifest === 'string' ? manifest : JSON.stringify(manifest))
  if (withModel) writeRuntime(dir, undefined, motions)
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

  // Slice 013 SPEC §13: expressions, cueMappings, and renderers.live2d.cues
  // retired from the format — no dedicated handling, no backward
  // compatibility. A manifest carrying them still loads; they just pass
  // through as inert JSON nobody reads.
  it('tolerates retired cue/expression keys as ordinary unknown JSON', () => {
    const result = loadCharacter(
      writePackage({
        ...VALID,
        expressions: { smile: { valence: 0.6, arousal: 0.4 } },
        cueMappings: { relief: 'smile' },
        renderers: {
          live2d: {
            ...VALID.renderers.live2d,
            cues: { smile: { params: { ParamMouthForm: 1 } } }
          }
        }
      })
    )
    expect(result).toMatchObject({ ok: true, name: 'Hiyori' })
    expect(result).not.toHaveProperty('expressions')
    expect(result).not.toHaveProperty('cueMappings')
  })

  it('validates character-owned performance and reports optional VTS capabilities', () => {
    const manifestPath = writePackage({
      ...VALID,
      renderers: {
        live2d: {
          ...VALID.renderers.live2d,
          performance: {
            params: [{ id: 'ParamMouthForm', source: 'mouthCurve', gain: 1, offset: 0 }],
            idle: {
              breath: { id: 'ParamBreath', basePeriodMs: 4000, amplitude: 1 },
              blink: {
                ids: ['ParamEyeLOpen', 'ParamEyeROpen'],
                baseIntervalMs: 3500,
                durationMs: 160
              },
              sway: { id: 'ParamBodyAngleX', baseAmplitude: 6, periodMs: 5000 }
            }
          }
        }
      }
    })
    const runtime = join(manifestPath, '..', 'runtime')
    writeFileSync(join(runtime, 'loose.physics3.json'), '{}')
    writeFileSync(join(runtime, 'model.vtube.json'), '{}')

    const result = loadCharacter(manifestPath)
    expect(result).toMatchObject({
      ok: true,
      live2d: { fallbackPhysics: 'runtime/loose.physics3.json' },
      report: {
        performance: { configured: true },
        resources: {
          physics: { fallback: 'runtime/loose.physics3.json' },
          ignored: ['runtime/model.vtube.json']
        }
      }
    })
    if (result.ok) {
      expect(result.report.warnings.join('\n')).toContain('Ignored VTube Studio metadata')
      expect(result.report.performance.parameterIds).toContain('ParamMouthForm')
      expect(
        mergeRuntimeCompatibility(
          result.report,
          [{ id: 'ParamMouthForm', name: 'Mouth', min: -1, max: 1, default: 0 }],
          {
            mocVersion: 4,
            groups: { eyeBlink: [], lipSync: [] },
            motions: { Idle: 2 },
            maxTextureSize: 4096,
            textures: ['Hiyori.png'],
            textureDimensions: [
              { path: 'Hiyori.png', width: 1024, height: 1024 }
            ]
          }
        )
      ).toBe(true)
      expect(result.report).toMatchObject({
        mocVersion: 4,
        body: {
          motions: { Idle: 2 },
          performanceGaps: expect.arrayContaining(['ParamBreath', 'ParamEyeLOpen'])
        }
      })
    }
  })

  it('rejects a performance param sourced from something that is not a channel', () => {
    const result = loadCharacter(writePackage({
      ...VALID,
      renderers: {
        live2d: {
          ...VALID.renderers.live2d,
          performance: {
            params: [{ id: 'ParamMouthForm', source: 'valence', gain: 1, offset: 0 }],
            idle: {
              breath: { id: 'ParamBreath', basePeriodMs: 4000, amplitude: 1 },
              blink: { ids: ['ParamEyeLOpen'], baseIntervalMs: 3500, durationMs: 160 },
              sway: { id: 'ParamBodyAngleX', baseAmplitude: 6, periodMs: 5000 }
            }
          }
        }
      }
    }))
    expect(result).toMatchObject({ ok: false })
    if (!result.ok) expect(result.error).toContain('performance.params[0]')
  })

  it('rejects malformed character-owned performance', () => {
    const result = loadCharacter(writePackage({
      ...VALID,
      renderers: {
        live2d: {
          ...VALID.renderers.live2d,
          performance: { params: [], idle: {} }
        }
      }
    }))
    expect(result).toMatchObject({ ok: false })
    if (!result.ok) expect(result.error).toContain('performance.idle')
  })

  // Slice 014 SPEC §3: the optional authored choreography block. Shape is
  // validated in parseManifest; group/index existence is checked against the
  // selected model3's registered motion counts in validateCharacter.
  describe('choreography', () => {
    const choreographyManifest = (choreography: unknown): unknown => ({
      ...VALID,
      renderers: { live2d: { ...VALID.renderers.live2d, choreography } }
    })
    const errorFor = (
      choreography: unknown,
      motions?: Record<string, number | unknown[]>
    ): string =>
      validateCharacter(writePackage(choreographyManifest(choreography), true, motions)).errors.join('\n')

    it('accepts a valid choreography block and reports it back', () => {
      const manifestPath = writePackage(
        choreographyManifest({
          fallback: { group: 'Idle', index: 1 },
          anchors: { '+++': { group: 'Tap', index: 2 }, '---': { group: 'Idle', index: 0 } }
        }),
        true,
        { Idle: 3, Tap: 3 }
      )
      const result = loadCharacter(manifestPath)
      expect(result).toMatchObject({ ok: true })
      if (result.ok) {
        expect(result.live2d.choreography).toEqual({
          fallback: { group: 'Idle', index: 1 },
          anchors: { '+++': { group: 'Tap', index: 2 }, '---': { group: 'Idle', index: 0 } }
        })
      }
    })

    it('leaves choreography undefined when absent', () => {
      const result = loadCharacter(writePackage(VALID))
      expect(result).toMatchObject({ ok: true })
      if (result.ok) expect(result.live2d).not.toHaveProperty('choreography')
    })

    it('rejects a choreography block missing fallback', () => {
      expect(errorFor({ anchors: {} })).toContain(
        'renderers.live2d.choreography.fallback is required'
      )
    })

    it('rejects an unknown top-level choreography key', () => {
      expect(errorFor({ fallback: { group: 'Idle', index: 0 }, loop: true })).toContain(
        'renderers.live2d.choreography.loop is not a known key'
      )
    })

    it('rejects a choreography ref with extra keys', () => {
      expect(errorFor({ fallback: { group: 'Idle', index: 0, duration: 400 } })).toContain(
        'renderers.live2d.choreography.fallback must contain exactly group and index'
      )
    })

    it('rejects a choreography ref with an empty group or a non-integer index', () => {
      expect(errorFor({ fallback: { group: '', index: 0 } })).toContain(
        'renderers.live2d.choreography.fallback.group must be a non-empty string'
      )
      expect(errorFor({ fallback: { group: 'Idle', index: -1 } })).toContain(
        'renderers.live2d.choreography.fallback.index must be a safe integer >= 0'
      )
      expect(errorFor({ fallback: { group: 'Idle', index: 1.5 } })).toContain(
        'renderers.live2d.choreography.fallback.index must be a safe integer >= 0'
      )
    })

    it('rejects an unknown anchor corner key inside choreography', () => {
      expect(
        errorFor({
          fallback: { group: 'Idle', index: 0 },
          anchors: { neutral: { group: 'Idle', index: 0 } }
        })
      ).toContain('renderers.live2d.choreography.anchors.neutral is not a known key')
    })

    it('rejects a choreography reference to an unknown motion group', () => {
      expect(errorFor({ fallback: { group: 'Missing', index: 0 } }, { Idle: 2 })).toContain(
        'renderers.live2d.choreography.fallback references unknown motion group "Missing"'
      )
    })

    it('rejects a choreography reference index at or beyond the group motion count', () => {
      expect(errorFor({ fallback: { group: 'Idle', index: 2 } }, { Idle: 2 })).toContain(
        'renderers.live2d.choreography.fallback references motion index 2 but group "Idle" has only 2 motion(s)'
      )
    })

    it('rejects a choreography reference to a motion slot without a registered file', () => {
      expect(errorFor({ fallback: { group: 'Idle', index: 0 } }, { Idle: [{}] })).toContain(
        'renderers.live2d.choreography.fallback references unusable motion slot Idle[0]'
      )
    })

    it('rejects a choreography block on a model with no motions at all', () => {
      expect(errorFor({ fallback: { group: 'Idle', index: 0 } })).toContain(
        'renderers.live2d.choreography.fallback references unknown motion group "Idle"'
      )
    })
  })

  // Slice 013 SPEC §13: optional channel-pose blocks. Partial by design — the
  // body merges each specified channel over the shipped default anchor.
  it('accepts partial anchors and operational blocks and reports them back', () => {
    const result = loadCharacter(writePackage({
      ...VALID,
      anchors: { neutral: { eyeOpen: 0.2 }, '-+-': { browRaise: 1, lean: -1 } },
      operational: { awaiting_input: { gazeHeight: 1 } }
    }))
    expect(result).toMatchObject({ ok: true })
    if (result.ok) {
      expect(result.anchors).toEqual({
        neutral: { eyeOpen: 0.2 },
        '-+-': { browRaise: 1, lean: -1 }
      })
      expect(result.operational).toEqual({ awaiting_input: { gazeHeight: 1 } })
    }
  })

  it('leaves anchors and operational undefined when the blocks are absent', () => {
    const result = loadCharacter(writePackage(VALID))
    expect(result).toMatchObject({ ok: true })
    expect(result).not.toHaveProperty('anchors')
    expect(result).not.toHaveProperty('operational')
  })

  it('rejects unknown anchor keys, unknown channels, and out-of-range values', () => {
    const errorFor = (manifest: unknown): string =>
      validateCharacter(writePackage(manifest)).errors.join('\n')
    expect(errorFor({ ...VALID, anchors: { triumphant: { eyeOpen: 0 } } })).toContain(
      'anchors.triumphant is not a known key'
    )
    expect(errorFor({ ...VALID, anchors: { neutral: { eyebrows: 0 } } })).toContain(
      'anchors.neutral.eyebrows is not a performance channel'
    )
    expect(errorFor({ ...VALID, anchors: { neutral: { eyeOpen: 1.5 } } })).toContain(
      'anchors.neutral.eyeOpen must be a number in [-1,1]'
    )
    expect(errorFor({ ...VALID, anchors: { neutral: 'wide' } })).toContain(
      'anchors.neutral must be an object'
    )
    expect(errorFor({ ...VALID, anchors: ['neutral'] })).toContain('anchors must be an object')
    expect(errorFor({ ...VALID, operational: { working: { eyeOpen: 0 } } })).toContain(
      'operational.working is not a known key'
    )
  })

  it('rejects model runtime references that escape the package', () => {
    const manifestPath = writePackage(VALID)
    writeFileSync(
      join(manifestPath, '..', 'runtime', 'Hiyori.model3.json'),
      JSON.stringify({
        FileReferences: { Moc: '../../outside.moc3', Textures: ['Hiyori.png'] }
      })
    )

    expect(validateCharacter(manifestPath).errors.join('\n')).toContain(
      'Required model resource must be a normalized package-relative path'
    )
  })

  it('selects the first package alphabetically and diagnoses zero or many packages', () => {
    const root = mkdtempSync(join(tmpdir(), 'lares-characters-'))
    expect(selectCharacterManifest(root)).toMatchObject({ ok: false, error: 'No character package found under ' + root })
    for (const name of ['zeta', 'alpha']) {
      writeRuntime(join(root, name))
      writeFileSync(join(root, name, 'lar.character.json'), JSON.stringify(VALID))
    }
    const selected = selectCharacterManifest(root)
    expect(selected).toMatchObject({ ok: true, manifestPath: join(root, 'alpha', 'lar.character.json') })
    if (selected.ok) expect(selected.warning).toContain('Multiple character packages')
  })

  it('skips an invalid package when a later managed package is valid', () => {
    const root = mkdtempSync(join(tmpdir(), 'lares-characters-'))
    mkdirSync(join(root, 'alpha'))
    writeFileSync(join(root, 'alpha', 'lar.character.json'), '{}')
    const valid = writePackage(VALID)
    const beta = join(root, 'beta')
    mkdirSync(beta)
    writeFileSync(join(beta, 'lar.character.json'), readFileSync(valid, 'utf8'))
    writeRuntime(beta)

    const selected = selectCharacterManifest(root)
    expect(selected).toMatchObject({ ok: true, manifestPath: join(beta, 'lar.character.json') })
    if (selected.ok) expect(loadCharacter(selected.manifestPath)).toMatchObject({ ok: true, name: 'Hiyori' })
  })
})
