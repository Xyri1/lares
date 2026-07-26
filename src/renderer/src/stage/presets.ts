import defaultJson from '../../../../presets/default.json'
import expressiveJson from '../../../../presets/expressive.json'
import type { SynthPreset } from '../synth/synth'

// Preset names the panel offers per stage (002-D2). Main allowlists the same
// names against presets/*.json server-side (P7); the DATA is applied here.
export const PRESETS: Record<string, SynthPreset> = {
  default: defaultJson as SynthPreset,
  expressive: expressiveJson as SynthPreset
}
