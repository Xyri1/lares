import { readFileSync } from 'node:fs'
import { atomicWrite } from './fs'

export const SCALES = [0.5, 0.75, 1, 1.25, 1.5] as const
export type Scale = (typeof SCALES)[number]

export const LANGUAGES = ['system', 'en', 'zh-CN'] as const
export type Language = (typeof LANGUAGES)[number]

export interface AppConfig {
  activeCharacter?: string
  scale: Scale
  doNotDisturb: boolean
  launchAtLogin: boolean
  automaticallyCheckForUpdates: boolean
  language: Language
  hostGuidance: boolean
  /** Expressiveness `k` (013 SPEC §4) — hidden, hand-edited, read at launch. */
  expressiveness: number
}

export const EXPRESSIVENESS_MAX = 10

export const DEFAULT_CONFIG: AppConfig = {
  scale: 1,
  doNotDisturb: false,
  launchAtLogin: false,
  automaticallyCheckForUpdates: true,
  language: 'system',
  hostGuidance: true,
  expressiveness: 1
}

export function parseConfig(raw: unknown): AppConfig {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ...DEFAULT_CONFIG }
  const value = raw as Record<string, unknown>
  return {
    ...(typeof value.activeCharacter === 'string' ? { activeCharacter: value.activeCharacter } : {}),
    scale: SCALES.includes(value.scale as Scale) ? (value.scale as Scale) : DEFAULT_CONFIG.scale,
    doNotDisturb:
      typeof value.doNotDisturb === 'boolean' ? value.doNotDisturb : DEFAULT_CONFIG.doNotDisturb,
    launchAtLogin:
      typeof value.launchAtLogin === 'boolean' ? value.launchAtLogin : DEFAULT_CONFIG.launchAtLogin,
    automaticallyCheckForUpdates:
      typeof value.automaticallyCheckForUpdates === 'boolean'
        ? value.automaticallyCheckForUpdates
        : DEFAULT_CONFIG.automaticallyCheckForUpdates,
    language: LANGUAGES.includes(value.language as Language)
      ? (value.language as Language)
      : DEFAULT_CONFIG.language,
    hostGuidance:
      typeof value.hostGuidance === 'boolean' ? value.hostGuidance : DEFAULT_CONFIG.hostGuidance,
    // Wrong type or NaN falls back; a real number out of range clamps (§4).
    expressiveness:
      typeof value.expressiveness === 'number' && Number.isFinite(value.expressiveness)
        ? Math.min(EXPRESSIVENESS_MAX, Math.max(0, value.expressiveness))
        : DEFAULT_CONFIG.expressiveness
  }
}

export function loadConfig(path: string): AppConfig {
  try {
    return parseConfig(JSON.parse(readFileSync(path, 'utf8')))
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

export async function saveConfig(path: string, config: AppConfig): Promise<void> {
  await atomicWrite(path, { ...parseConfig(config) })
}
