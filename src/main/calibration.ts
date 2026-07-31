import type { ValidationReport } from './characters/manifest'
import { CANONICAL_CUES } from './cues'
import { L } from './strings'

/**
 * Passive readiness over the six canonical mappings (011-D14). The tray shows
 * this and nothing else: no arming, no toggle, no launch surface — **Calibrate
 * Lar** in the harness is the only way to start the workflow.
 */
export function calibrationLabel(report: Pick<ValidationReport, 'mappedCues'>): string {
  return L.expressionMapping(report.mappedCues.length, CANONICAL_CUES.length)
}
