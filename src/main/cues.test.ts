import { describe, expect, it } from 'vitest'
import {
  CANONICAL_CUES,
  isCanonicalCue,
  missingCues,
  performanceInventory,
  resolveCanonicalCue,
  statusMappings,
  type CueMappings
} from './cues'

const COMPLETE: CueMappings = {
  discovery: 'Surprised',
  uncertainty: 'pleading-look',
  concern: 'grimace',
  frustration: 'Angry',
  relief: 'warm-smile',
  satisfaction: 'pleased-nod'
}

const calibrated = (): boolean => true

describe('canonical cue vocabulary', () => {
  it('is exactly the six protocol values in canonical order', () => {
    expect([...CANONICAL_CUES]).toEqual([
      'discovery',
      'uncertainty',
      'concern',
      'frustration',
      'relief',
      'satisfaction'
    ])
    expect(isCanonicalCue('discovery')).toBe(true)
    for (const value of ['Smile', 'pleased-nod', 'DISCOVERY', '', undefined, 1]) {
      expect(isCanonicalCue(value)).toBe(false)
    }
  })

  it('reports gaps in canonical order regardless of mapping insertion order', () => {
    expect(missingCues({}, calibrated)).toEqual([...CANONICAL_CUES])
    expect(missingCues(COMPLETE, calibrated)).toEqual([])
    expect(
      missingCues({ satisfaction: 'Smile', concern: 'grimace' }, calibrated)
    ).toEqual(['discovery', 'uncertainty', 'frustration', 'relief'])
  })

  it('treats an uncalibrated target as unmapped', () => {
    expect(missingCues(COMPLETE, (performance) => performance !== 'Angry')).toEqual(['frustration'])
  })
})

describe('canonical cue resolution', () => {
  it('resolves a complete mapping to the character performance', () => {
    expect(resolveCanonicalCue('relief', COMPLETE, [])).toEqual({
      cue: 'relief',
      performance: 'warm-smile'
    })
  })

  it('shares one performance across duplicate mappings', () => {
    const duplicated: CueMappings = { ...COMPLETE, relief: 'pleased-nod' }
    expect(resolveCanonicalCue('relief', duplicated, []).performance).toBe('pleased-nod')
    expect(resolveCanonicalCue('satisfaction', duplicated, []).performance).toBe('pleased-nod')
  })

  it('refuses an artist name and any non-canonical value', () => {
    for (const value of ['Smile', 'pleased-nod', 'joy', '', undefined]) {
      expect(() => resolveCanonicalCue(value, COMPLETE, [])).toThrow(/unknown cue/)
    }
  })

  it('fails closed on an incomplete character, naming the gap in canonical order', () => {
    expect(() =>
      resolveCanonicalCue('discovery', { discovery: 'Surprised' }, [
        'uncertainty',
        'concern',
        'frustration',
        'relief',
        'satisfaction'
      ])
    ).toThrow('character_not_calibrated: missing uncertainty, concern, frustration, relief, satisfaction')
    expect(() => resolveCanonicalCue('relief', {}, [])).toThrow(
      'character_not_calibrated: missing relief'
    )
  })
})

describe('performance inventory', () => {
  const inventory = performanceInventory(
    [
      { name: 'warm-smile', valence: 0.6, arousal: 0.35, source: 'bundled' },
      { name: 'Angry', valence: -0.8, arousal: 0.75, source: 'bundled' },
      { name: 'f01', valence: null, arousal: null, source: 'bundled' },
      { name: 'wry', valence: 0.2, arousal: 0.3, source: 'authored' },
      { name: 'hat-on', valence: 0.1, arousal: 0.1, source: 'raw' }
    ],
    {
      'warm-smile': { motion: 'runtime/motion/haru_m_05.motion3.json' },
      Angry: { expression: 'runtime/expressions/Angry.exp3.json' },
      f01: { expression: 'runtime/expressions/f01.exp3.json' },
      wry: { expression: 'authored/wry.exp3.json' },
      'hat-on': { params: { ParamHat: 1 } }
    },
    { relief: 'warm-smile', satisfaction: 'warm-smile', frustration: 'Angry' }
  )

  it('sorts by Unicode code point, not host locale', () => {
    expect(inventory.performances.map((entry) => entry.name)).toEqual([
      'Angry',
      'f01',
      'hat-on',
      'warm-smile',
      'wry'
    ])
  })

  it('reports kind, source, affect, and the canonical cues pointing at each entry', () => {
    expect(inventory.performances[3]).toEqual({
      name: 'warm-smile',
      kind: 'motion',
      source: 'bundled',
      affect: { valence: 0.6, arousal: 0.35 },
      mapped_cues: ['relief', 'satisfaction']
    })
    expect(inventory.performances[1]).toMatchObject({
      name: 'f01',
      kind: 'expression',
      affect: null,
      mapped_cues: []
    })
    // Non-emotive assets stay in the inventory (SPEC §4).
    expect(inventory.performances[2]).toMatchObject({ name: 'hat-on', kind: 'params', source: 'raw' })
    expect(inventory.performances[4]).toMatchObject({ name: 'wry', source: 'authored' })
  })

  it('reports the remaining canonical cues alongside the inventory', () => {
    expect(inventory.missing_cues).toEqual(['discovery', 'uncertainty', 'concern'])
  })
})

describe('status mappings', () => {
  it('publishes the valid partial mapping and the gap', () => {
    expect(statusMappings({ concern: 'grimace', relief: 'warm-smile' }, ['discovery'])).toEqual({
      cue_mappings: { concern: 'grimace', relief: 'warm-smile' },
      missing_cues: ['discovery']
    })
  })

  it('omits a mapping whose target is missing or uncalibrated', () => {
    expect(statusMappings({ concern: 'gone', relief: 'warm-smile' }, ['concern']).cue_mappings).toEqual({
      relief: 'warm-smile'
    })
  })

  it('emits mappings in canonical order, not insertion order', () => {
    const mappings: CueMappings = { satisfaction: 'a', discovery: 'b' }
    expect(Object.keys(statusMappings(mappings, []).cue_mappings)).toEqual([
      'discovery',
      'satisfaction'
    ])
  })
})
