import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CANONICAL_CUES } from '../cues'
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

/** Three performances — two calibrated, one not — plus a mapping under test. */
function mapped(cueMappings: Record<string, unknown>): unknown {
  return {
    ...VALID,
    expressions: {
      smile: { valence: 0.6, arousal: 0.4 },
      sad: { valence: -0.6, arousal: 0.3 },
      blank: null
    },
    cueMappings,
    renderers: {
      live2d: {
        ...VALID.renderers.live2d,
        cues: {
          smile: { params: { ParamMouthForm: 1 } },
          sad: { params: { ParamMouthForm: -1 } },
          blank: { params: { ParamMouthForm: 0 } }
        }
      }
    }
  }
}

function writeRuntime(root: string, model = 'Hiyori'): void {
  mkdirSync(join(root, 'runtime'), { recursive: true })
  writeFileSync(
    join(root, 'runtime', `${model}.model3.json`),
    JSON.stringify({
      FileReferences: {
        Moc: `${model}.moc3`,
        Textures: [`${model}.png`]
      }
    })
  )
  writeFileSync(join(root, 'runtime', `${model}.moc3`), 'moc')
  writeFileSync(join(root, 'runtime', `${model}.png`), 'png')
}

function writePackage(manifest: unknown, withModel = true): string {
  const dir = mkdtempSync(join(tmpdir(), 'lares-manifest-'))
  const path = join(dir, 'lar.character.json')
  writeFileSync(path, typeof manifest === 'string' ? manifest : JSON.stringify(manifest))
  if (withModel) writeRuntime(dir)
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
      JSON.stringify({
        FileReferences: { Moc: '../../outside.moc3', Textures: ['Hiyori.png'] }
      })
    )

    expect(validateCharacter(manifestPath).errors.join('\n')).toContain(
      'Required model resource must be a normalized package-relative path'
    )
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

  it('treats an absent cueMappings block as zero of six, not an error', () => {
    const result = loadCharacter(writePackage(VALID))
    expect(result).toMatchObject({ ok: true, cueMappings: {} })
    if (result.ok) {
      expect(result.report.mappedCues).toEqual([])
      expect(result.report.missingCues).toEqual(CANONICAL_CUES)
    }
  })

  it('accepts partial, complete, and duplicate canonical mappings under lares/1', () => {
    const partial = loadCharacter(writePackage(mapped({ concern: 'sad', relief: 'smile' })))
    expect(partial).toMatchObject({ ok: true, cueMappings: { concern: 'sad', relief: 'smile' } })
    if (partial.ok) {
      expect(partial.report.mappedCues).toEqual(['concern', 'relief'])
      expect(partial.report.missingCues).toEqual([
        'discovery',
        'uncertainty',
        'frustration',
        'satisfaction'
      ])
    }

    const complete = loadCharacter(
      writePackage(
        mapped({
          discovery: 'smile',
          uncertainty: 'sad',
          concern: 'sad',
          frustration: 'sad',
          relief: 'smile',
          satisfaction: 'smile'
        })
      )
    )
    expect(complete).toMatchObject({ ok: true })
    if (complete.ok) {
      expect(complete.report.mappedCues).toEqual(CANONICAL_CUES)
      expect(complete.report.missingCues).toEqual([])
    }
  })

  it('rejects unknown cue keys, unknown performances, and uncalibrated targets', () => {
    expect(validateCharacter(writePackage(mapped({ joy: 'smile' }))).errors.join('\n')).toContain(
      'not a canonical cue'
    )
    expect(
      validateCharacter(writePackage(mapped({ relief: 'missing' }))).errors.join('\n')
    ).toContain('unknown performance')
    expect(
      validateCharacter(writePackage(mapped({ relief: 'blank' }))).errors.join('\n')
    ).toContain('uncalibrated performance')
    expect(validateCharacter(writePackage(mapped({ relief: 42 }))).errors.join('\n')).toContain(
      'must name a character performance'
    )
    expect(
      validateCharacter(writePackage({ ...VALID, cueMappings: ['relief'] })).errors.join('\n')
    ).toContain('cueMappings must be an object')
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
