import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { writeTrace } from './trace'

describe('writeTrace', () => {
  it('creates the target directory and writes newline-joined lines', () => {
    const root = mkdtempSync(join(tmpdir(), 'lares-trace-'))
    const dir = join(root, 'nested', 'traces')
    try {
      const path = writeTrace('demo', ['{"a":1}', '{"a":2}'], dir)
      expect(existsSync(path)).toBe(true)
      expect(readFileSync(path, 'utf8')).toBe('{"a":1}\n{"a":2}\n')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
