import { cpSync, mkdtempSync, readFileSync } from 'node:fs'
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
  it('imports loose CJK expressions and motions from an empty model index', () => {
    const packageRoot = copyFixture('vtube')
    const output = run(packageRoot)
    const manifest = JSON.parse(readFileSync(join(packageRoot, 'lar.character.json'), 'utf8'))

    expect(manifest.expressions).toEqual({ 挥手: null, 惊讶: null })
    expect(manifest.renderers.live2d.cues).toEqual({
      挥手: { motion: 'runtime/motions/挥手.motion3.json' },
      惊讶: { expression: 'runtime/惊讶.exp3.json' }
    })
    expect(output).toContain('"expression":1,"motion":1')
    expect(output).toContain('2 cues uncalibrated — ask your agent to run the mapping flow.')
  })

  it('unions indexed and scanned motions without duplicates, and check does not write', () => {
    const packageRoot = copyFixture('sdk')
    run(packageRoot)
    const manifestPath = join(packageRoot, 'lar.character.json')
    const before = readFileSync(manifestPath, 'utf8')
    const output = run('--check', packageRoot)

    const manifest = JSON.parse(before)
    expect(Object.keys(manifest.renderers.live2d.cues)).toEqual(['idle', 'tap'])
    expect(output).toContain('"motion":2')
    expect(readFileSync(manifestPath, 'utf8')).toBe(before)
  })
})
