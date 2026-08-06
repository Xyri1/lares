import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, loadConfig, saveConfig } from './config'

const scratch = (): string => join(mkdtempSync(join(tmpdir(), 'lares-config-')), 'config.json')

describe('persistent config', () => {
  it('defaults when absent and round-trips every validated setting', async () => {
    const file = scratch()
    expect(loadConfig(file)).toEqual(DEFAULT_CONFIG)

    const config = {
      activeCharacter: '/managed/hiyori/lar.character.json',
      scale: 1.25 as const,
      doNotDisturb: true,
      launchAtLogin: true,
      automaticallyCheckForUpdates: false,
      language: 'zh-CN' as const,
      hostGuidance: false
    }
    await saveConfig(file, config)

    expect(loadConfig(file)).toEqual(config)
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(config)
  })

  it('keeps malformed input readable and defaults invalid, missing, and unknown fields', () => {
    const malformed = scratch()
    writeFileSync(malformed, '{"scale":')
    expect(loadConfig(malformed)).toEqual(DEFAULT_CONFIG)
    expect(readFileSync(malformed, 'utf8')).toBe('{"scale":')

    const partial = scratch()
    writeFileSync(partial, JSON.stringify({
      activeCharacter: 12,
      scale: 0.8,
      doNotDisturb: true,
      launchAtLogin: 'yes',
      automaticallyCheckForUpdates: false,
      calibrationArmed: true,
      language: 'fr',
      hostGuidance: 'nope',
      // Retired by 014-D5: an old config's expressiveness is now just an
      // unknown field and drops like any other.
      expressiveness: 2.5,
      injected: 'ignored'
    }))
    expect(loadConfig(partial)).toEqual({
      ...DEFAULT_CONFIG,
      doNotDisturb: true,
      automaticallyCheckForUpdates: false
    })
  })
})
