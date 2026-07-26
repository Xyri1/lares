import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadCharacter } from '../characters/manifest'
import { SCENARIO_CUES } from './cues'

// scenarios/ and characters/ both live at the repo root; vitest runs from
// there (same convention as goldens.test.ts).
describe('SCENARIO_CUES agrees with the manifest', () => {
  it('matches characters/hiyori/lar.character.json expressions exactly', () => {
    const manifestPath = join(process.cwd(), 'characters', 'hiyori', 'lar.character.json')
    const result = loadCharacter(manifestPath)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.expressions).toEqual(SCENARIO_CUES)
  })
})
