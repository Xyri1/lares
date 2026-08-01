import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  HOST_GUIDANCE_REMINDER,
  hostGuidanceRulePath,
  removeHostGuidanceRule,
  writeHostGuidanceRule
} from './hostGuidance'

const scratch = (): string => mkdtempSync(join(tmpdir(), 'lares-host-guidance-'))

describe('host guidance rule file', () => {
  it('writes then removes the rule file at <base>/.claude/rules/lares.md', () => {
    const base = scratch()
    try {
      const path = hostGuidanceRulePath(base)
      expect(path).toBe(join(base, '.claude', 'rules', 'lares.md'))

      writeHostGuidanceRule(base)
      const content = readFileSync(path, 'utf8')
      expect(content).toContain(HOST_GUIDANCE_REMINDER)
      expect(content.startsWith('<!--')).toBe(true)
      expect(content.endsWith('\n')).toBe(true)

      removeHostGuidanceRule(base)
      expect(() => readFileSync(path, 'utf8')).toThrow()
    } finally {
      rmSync(base, { recursive: true, force: true })
    }
  })

  it('is a no-op when the rule file is missing', () => {
    const base = scratch()
    try {
      expect(() => removeHostGuidanceRule(base)).not.toThrow()
    } finally {
      rmSync(base, { recursive: true, force: true })
    }
  })

  // 012-D4 review finding: rule-file I/O failures must never propagate to
  // startNerves or shutdown teardown.
  it('swallows write failures (rules path blocked by a file)', () => {
    const base = scratch()
    try {
      mkdirSync(join(base, '.claude'), { recursive: true })
      writeFileSync(join(base, '.claude', 'rules'), 'not a directory')
      expect(() => writeHostGuidanceRule(base)).not.toThrow()
    } finally {
      rmSync(base, { recursive: true, force: true })
    }
  })

  it('swallows remove failures (rule path is a non-empty directory)', () => {
    const base = scratch()
    try {
      mkdirSync(hostGuidanceRulePath(base), { recursive: true })
      writeFileSync(join(hostGuidanceRulePath(base), 'child.txt'), 'x')
      expect(() => removeHostGuidanceRule(base)).not.toThrow()
    } finally {
      rmSync(base, { recursive: true, force: true })
    }
  })
})

describe('cross-file consistency', () => {
  it('keeps the forwarder copy byte-identical to the module constant', () => {
    const source = readFileSync(join(process.cwd(), 'scripts', 'forwarder.js'), 'utf8')
    const match = source.match(/const HOST_GUIDANCE_REMINDER =\s*'((?:[^'\\]|\\.)*)'/)
    expect(match).not.toBeNull()
    const forwarderCopy = match![1].replace(/\\'/g, "'")
    expect(forwarderCopy).toBe(HOST_GUIDANCE_REMINDER)
  })
})
