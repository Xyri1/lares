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
}

export const DEFAULT_CONFIG: AppConfig = {
  scale: 1,
  doNotDisturb: false,
  launchAtLogin: false,
  automaticallyCheckForUpdates: true,
  language: 'system',
  hostGuidance: true
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
      typeof value.hostGuidance === 'boolean' ? value.hostGuidance : DEFAULT_CONFIG.hostGuidance
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
