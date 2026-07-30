import type { ValidationReport } from './characters/manifest'
import type { AppConfig } from './config'
import { L } from './strings'

export const CALIBRATION_INVITE =
  'The user has armed Lares expression mapping; offer to map the active character’s uncalibrated cues with them.'

export const CALIBRATION_PROMPT = [
  "You are mapping the active Lares character's expression cues with the user",
  'watching the desktop. First call list_cues and list_parameters, then tell',
  'the user the plan: which cues you will map from their names alone, which',
  'you propose to discard, and which few need their eyes. Progress saves per',
  'cue; stopping at any point is fine.',
  '',
  "Cue names are the artist's own labels, in any language, and a clear name",
  'is the artist telling you what the face means. Map each expressively named',
  'cue (Smile, 生气, 疑惑) yourself with category-level coordinates — valence',
  '[-1, 1], arousal [0, 1]; do not ask the user about degree. Preview each',
  'one as you write it so the user can veto a wrong-looking face; silence is',
  'consent. Propose clearly non-emotive cues (outfits, accessories, props,',
  'toggles) as one batch discard; after a single confirmation, remove each',
  'discarded key from both `expressions` and `renderers.live2d.cues` in the',
  "manifest; never delete or rename the artist's asset. Interview only opaque",
  'names (f01, m_03): preview with preview_expression({ cue: "<cue name>" }),',
  'ask the user what it visibly conveys, propose coordinates, confirm, then',
  'call update_expression({ name: "<cue name>", affect: { valence, arousal } }).',
  'Map expressions before motions, and warn the user before each motion',
  'preview: a motion plays once, so they must be watching the character. If',
  'the user wants a clearer cue name, rename the key in both blocks while',
  'leaving its referenced path unchanged.',
  '',
  'If the set lacks a useful emotion, use list_parameters, preview_expression',
  'with a small parameter map, ask the user to accept the visible result, then',
  'call save_expression({ name, params, affect }) once to create it. Do not save',
  'until the user accepts it. Never overwrite a bundled cue; choose a new name.',
  'Use preview_expression({}) to revert an expression preview when done.'
].join('\n')

type CalibrationReport = Pick<ValidationReport, 'calibrated' | 'uncalibrated'>

export interface CalibrationState {
  tone: 'red' | 'yellow' | 'complete'
  label: string
  complete: boolean
}

export function calibrationState(report: CalibrationReport): CalibrationState {
  if (report.calibrated === 0) {
    return { tone: 'red', label: L.calibrationNotMapped, complete: false }
  }
  if (report.uncalibrated > 0) {
    return {
      tone: 'yellow',
      label: L.calibrationLeft(report.uncalibrated),
      complete: false
    }
  }
  return { tone: 'complete', label: L.calibrationMapped, complete: true }
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
