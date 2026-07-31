import { describe, expect, it } from 'vitest'
import { calibrationLabel } from './calibration'
import { CANONICAL_CUES, type CanonicalCue } from './cues'

const mapped = (count: number): { mappedCues: CanonicalCue[] } => ({
  mappedCues: [...CANONICAL_CUES].slice(0, count)
})

describe('canonical mapping readiness', () => {
  it('reads zero, partial, and complete mappings as n/6', () => {
    expect(calibrationLabel(mapped(0))).toContain('0/6')
    expect(calibrationLabel(mapped(3))).toContain('3/6')
    expect(calibrationLabel(mapped(6))).toContain('6/6')
  })

  it('names Calibrate Lar only while incomplete', () => {
    expect(calibrationLabel(mapped(5))).toContain('Calibrate Lar')
    expect(calibrationLabel(mapped(6))).not.toContain('Calibrate Lar')
  })
})
