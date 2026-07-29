import type { ValidationReport } from './characters/manifest'
import type { AppConfig } from './config'

export const CALIBRATION_INVITE =
  'The user has armed Lares expression mapping; offer to map the active character’s uncalibrated cues with them.'

export const CALIBRATION_PROMPT = [
  "You are mapping the active Lares character's expression cues with the user",
  'watching the desktop. First call list_cues and list_parameters. For each',
  'uncalibrated cue, preview it with preview_expression({ cue: "<cue name>" }).',
  'Ask the user what emotion it visibly conveys before writing anything. Discard',
  'non-emotive cues such as outfit, accessory, or toggle controls rather than',
  'forcing them onto the affect map. After the user confirms a discard, remove',
  'that cue\'s key from both `expressions` and `renderers.live2d.cues` in the',
  "manifest; never delete or rename the artist's asset. If the user wants a",
  'clearer cue name, rename the key in both blocks while leaving its referenced',
  'path unchanged. For each accepted cue, propose valence',
  '[-1, 1] and arousal [0, 1], ask for confirmation, then call',
  'update_expression({ name: "<cue name>", affect: { valence, arousal } }).',
  '',
  'If the set lacks a useful emotion, use list_parameters, preview_expression',
  'with a small parameter map, ask the user to accept the visible result, then',
  'call save_expression({ name, params, affect }) once to create it. Do not save',
  'until the user accepts it. Never overwrite a bundled cue; choose a new name.',
  'Use preview_expression({}) to revert an expression preview when done. A motion',
  'preview plays once, so observe it rather than expecting it to hold.'
].join('\n')

type CalibrationReport = Pick<ValidationReport, 'calibrated' | 'uncalibrated'>

export interface CalibrationState {
  tone: 'red' | 'yellow' | 'complete'
  label: string
  complete: boolean
}

export function calibrationState(report: CalibrationReport): CalibrationState {
  if (report.calibrated === 0) {
    return { tone: 'red', label: '🔴 Expressions not mapped', complete: false }
  }
  if (report.uncalibrated > 0) {
    return {
      tone: 'yellow',
      label: `🟡 ${report.uncalibrated} expression${report.uncalibrated === 1 ? '' : 's'} left`,
      complete: false
    }
  }
  return { tone: 'complete', label: 'Expressions mapped', complete: true }
}

export function reconcileCalibrationArmed(
  config: AppConfig,
  report: CalibrationReport
): boolean {
  if (!config.calibrationArmed || !calibrationState(report).complete) return false
  config.calibrationArmed = false
  return true
}

export async function toggleCalibration(
  config: AppConfig,
  report: CalibrationReport,
  copy: (text: string) => void,
  persist: () => Promise<void>
): Promise<boolean> {
  if (!config.calibrationArmed && calibrationState(report).complete) return false
  const previous = config.calibrationArmed
  config.calibrationArmed = !config.calibrationArmed
  if (config.calibrationArmed) copy(CALIBRATION_PROMPT)
  try {
    await persist()
  } catch (error) {
    config.calibrationArmed = previous
    throw error
  }
  return true
}
