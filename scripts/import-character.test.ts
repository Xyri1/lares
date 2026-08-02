import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const script = join(root, 'scripts', 'import-character.mjs')
const fixtures = join(root, 'src', 'main', 'characters', 'fixtures')

function copyFixture(name: string): string {
  const destination = join(mkdtempSync(join(tmpdir(), 'lares-import-')), name)
  cpSync(join(fixtures, name), destination, { recursive: true })
  return destination
}

function run(...args: string[]) {
  const result = spawnSync(process.execPath, ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', script, ...args], {
    cwd: root,
    encoding: 'utf8'
  })
  expect(result.status, result.stderr).toBe(0)
  return result.stdout
}

describe('import-character', () => {
  it('writes a minimal manifest naming the model; validation independently catalogs loose CJK assets', () => {
    const packageRoot = copyFixture('vtube')
    const output = run(packageRoot)
    const manifest = JSON.parse(readFileSync(join(packageRoot, 'lar.character.json'), 'utf8'))

    // Retired format keys (013 SPEC §13) — the importer no longer synthesizes them.
    expect(manifest.expressions).toBeUndefined()
    expect(manifest.renderers.live2d.cues).toBeUndefined()
    expect(manifest.renderers.live2d.model).toBe('runtime/VTube.model3.json')

    // The model's own index registers nothing, so validation's resource
    // catalog (manifest.ts inspectModel) finds both assets loose — no cue
    // vocabulary needed to discover them (013-D11).
    const result = JSON.parse(output)
    expect(result.resources.expressions).toEqual({
      registered: [],
      loose: ['runtime/惊讶.exp3.json']
    })
    expect(result.resources.motions).toEqual({
      registered: [],
      loose: ['runtime/motions/挥手.motion3.json']
    })
  })

  it('catalogs indexed and loose motions without duplicates, and check does not write', () => {
    const packageRoot = copyFixture('sdk')
    run(packageRoot)
    const manifestPath = join(packageRoot, 'lar.character.json')
    const before = readFileSync(manifestPath, 'utf8')
    const output = run('--check', packageRoot)

    const result = JSON.parse(output)
    expect(result.resources.motions).toEqual({
      registered: ['runtime/motions/idle.motion3.json'],
      loose: ['runtime/motions/tap.motion3.json']
    })
    expect(readFileSync(manifestPath, 'utf8')).toBe(before)
  })

  it('catalogs duplicate basenames distinctly by canonical package path', () => {
    const packageRoot = copyFixture('vtube')
    mkdirSync(join(packageRoot, 'runtime', 'nested'))
    writeFileSync(
      join(packageRoot, 'runtime', 'nested', '惊讶.exp3.json'),
      JSON.stringify({ Parameters: [] })
    )
    const output = run(packageRoot)
    const result = JSON.parse(output)

    expect(result.resources.expressions.loose).toEqual(
      expect.arrayContaining(['runtime/惊讶.exp3.json', 'runtime/nested/惊讶.exp3.json'])
    )
  })
})
