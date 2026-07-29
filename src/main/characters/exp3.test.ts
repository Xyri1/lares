import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { applyExp3, parseCdi3File, parseExp3File, parseModelCdi3File } from './exp3'

describe('exp3', () => {
  it('applies Add, Multiply, and Overwrite against defaults and resolves display names', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lares-exp3-'))
    const path = join(dir, 'blend.exp3.json')
    writeFileSync(path, JSON.stringify({
      Parameters: [
        { Id: 'add', Value: 2, Blend: 'Add' },
        { Id: 'defaultAdd', Value: 1 },
        { Id: 'multiply', Value: 3, Blend: 'Multiply' },
        { Id: 'overwrite', Value: 8, Blend: 'Overwrite' }
      ]
    }))
    const result = parseExp3File(path, new Map([['add', 'Add display']]))
    expect(result).toMatchObject({ ok: true })
    if (result.ok) {
      expect(result.parameters[0].name).toBe('Add display')
      expect(
        applyExp3(result.parameters, { add: 4, defaultAdd: 5, multiply: 2, overwrite: 1 })
      ).toEqual({ add: 6, defaultAdd: 6, multiply: 6, overwrite: 8 })
    }
  })

  it('rejects malformed expression parameters', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lares-exp3-'))
    const path = join(dir, 'bad.exp3.json')
    writeFileSync(path, JSON.stringify({ Parameters: [{ Id: 'bad', Value: 'wide' }] }))
    expect(parseExp3File(path)).toMatchObject({ ok: false, error: expect.stringContaining('Value') })
  })

  it('reads optional cdi3 display names', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lares-cdi3-'))
    const path = join(dir, 'model.cdi3.json')
    writeFileSync(path, JSON.stringify({ Parameters: [{ Id: 'ParamEye', Name: 'Eye open' }] }))
    expect(parseCdi3File(path).get('ParamEye')).toBe('Eye open')
  })

  it('reads model display names only from inside the character package', () => {
    const packageRoot = mkdtempSync(join(tmpdir(), 'lares-cdi-package-'))
    const runtime = join(packageRoot, 'runtime')
    mkdirSync(runtime)
    const inside = join(runtime, 'model.cdi3.json')
    const outside = join(mkdtempSync(join(tmpdir(), 'lares-cdi-outside-')), 'outside.cdi3.json')
    writeFileSync(inside, JSON.stringify({ Parameters: [{ Id: 'Safe', Name: 'Safe name' }] }))
    writeFileSync(outside, JSON.stringify({ Parameters: [{ Id: 'Leaked', Name: 'Leaked name' }] }))
    const model = join(runtime, 'model.model3.json')

    writeFileSync(model, JSON.stringify({ FileReferences: { DisplayInfo: 'model.cdi3.json' } }))
    expect(parseModelCdi3File(model, packageRoot).get('Safe')).toBe('Safe name')

    writeFileSync(model, JSON.stringify({ FileReferences: { DisplayInfo: outside } }))
    expect(parseModelCdi3File(model, packageRoot).size).toBe(0)
  })
})
