import { resolve } from 'node:path'
import { SCALES, type AppConfig, type Language, type Scale } from './config'
import { errorMessage } from './errors'
import { L } from './strings'

export interface ShellCharacter {
  manifestPath: string
  label: string
}

export interface ShellMenuItem {
  label?: string
  type?: 'normal' | 'separator' | 'checkbox' | 'radio'
  checked?: boolean
  enabled?: boolean
  submenu?: ShellMenuItem[]
  click?: () => void | Promise<void>
}

type Result = { ok: true; manifestPath: string } | { ok: false; error: string }

export interface TrayShellDependencies {
  config: AppConfig
  characters(): ShellCharacter[]
  activeCharacter(): string | undefined
  switchCharacter(manifestPath: string): Promise<Result>
  importCharacter(source: string): Result
  discardImportedCharacter(manifestPath: string): void
  openCharacterFolder(): void
  pickImportDirectory(): Promise<string | null>
  setMenu(menu: ShellMenuItem[]): void
  persist(config: AppConfig): Promise<void>
  showError(title: string, message: string): void
  setOverlayVisible(visible: boolean): void
  setScale(scale: Scale): void
  getLaunchAtLogin(): boolean
  setLaunchAtLogin(enabled: boolean): void
  resetPosition(): void
  calibrationStatus?: () => string
  canMapExpressions?: () => boolean
  onMapExpressions?: () => void | Promise<void>
  onAutomaticUpdatesChanged?: (enabled: boolean) => void | Promise<void>
  onCheckForUpdates?: () => void | Promise<void>
  onConfigureAgentIntegrations?: () => void | Promise<void>
  onLanguageChanged?: (language: Language) => void | Promise<void>
  quit(): void
}

export interface TrayShell {
  refresh(): void
}

export function hydrateInitialCharacter<T extends ShellCharacter>(
  characters: T[],
  config: AppConfig
): T | undefined {
  const selected =
    characters.find((character) =>
      config.activeCharacter === undefined
        ? false
        : resolve(character.manifestPath) === resolve(config.activeCharacter)
    ) ?? characters[0]
  if (
    selected &&
    config.activeCharacter !== undefined &&
    resolve(selected.manifestPath) !== resolve(config.activeCharacter)
  ) {
    delete config.activeCharacter
  }
  return selected
}

export function createTrayShell(deps: TrayShellDependencies): TrayShell {
  const config = deps.config

  const persist = async (): Promise<void> => {
    try {
      await deps.persist(config)
    } catch (error) {
      deps.showError(L.couldNotSaveSettings, errorMessage(error))
    }
  }

  const select = async (manifestPath: string): Promise<boolean> => {
    let result: Result
    try {
      result = await deps.switchCharacter(manifestPath)
    } catch (error) {
      deps.showError(L.characterCouldNotBeLoaded, errorMessage(error))
      return false
    }
    if (!result.ok) {
      deps.showError(L.characterCouldNotBeLoaded, result.error)
      return false
    }
    config.activeCharacter = result.manifestPath
    await persist()
    refresh()
    return true
  }

  const importCharacter = async (): Promise<void> => {
    let source: string | null
    try {
      source = await deps.pickImportDirectory()
    } catch (error) {
      deps.showError(L.characterCouldNotBeImported, errorMessage(error))
      return
    }
    if (!source) return
    let imported: Result
    try {
      imported = deps.importCharacter(source)
    } catch (error) {
      deps.showError(L.characterCouldNotBeImported, errorMessage(error))
      return
    }
    if (!imported.ok) {
      deps.showError(L.characterCouldNotBeImported, imported.error)
      return
    }
    if (!(await select(imported.manifestPath))) {
      try {
        deps.discardImportedCharacter(imported.manifestPath)
      } catch (error) {
        deps.showError(L.characterImportCleanupFailed, errorMessage(error))
      }
      refresh()
    }
  }

  const setScale = async (scale: Scale): Promise<void> => {
    config.scale = scale
    deps.setScale(scale)
    await persist()
    refresh()
  }

  const setDoNotDisturb = async (): Promise<void> => {
    config.doNotDisturb = !config.doNotDisturb
    deps.setOverlayVisible(!config.doNotDisturb)
    await persist()
    refresh()
  }

  const setLaunchAtLogin = async (): Promise<void> => {
    deps.setLaunchAtLogin(!deps.getLaunchAtLogin())
    config.launchAtLogin = deps.getLaunchAtLogin()
    await persist()
    refresh()
  }

  const setAutomaticUpdates = async (): Promise<void> => {
    config.automaticallyCheckForUpdates = !config.automaticallyCheckForUpdates
    await persist()
    await deps.onAutomaticUpdatesChanged?.(config.automaticallyCheckForUpdates)
    refresh()
  }

  const setLanguage = async (language: Language): Promise<void> => {
    config.language = language
    await persist()
    await deps.onLanguageChanged?.(language)
    refresh()
  }

  const mapExpressions = async (): Promise<void> => {
    try {
      await deps.onMapExpressions?.()
    } catch (error) {
      deps.showError(L.expressionMappingCouldNotBeUpdated, errorMessage(error))
    }
    refresh()
  }

  function refresh(): void {
    const active = deps.activeCharacter()
    deps.setMenu([
      {
        label: L.characters,
        submenu: [
          ...deps.characters().map((character): ShellMenuItem => ({
            label: character.label,
            type: 'radio',
            checked: character.manifestPath === active,
            click: async () => {
              await select(character.manifestPath)
            }
          })),
          { type: 'separator' },
          { label: L.importCharacter, click: importCharacter },
          { label: L.openCharacterFolder, click: deps.openCharacterFolder }
        ]
      },
      {
        label: L.scale,
        submenu: SCALES.map((scale): ShellMenuItem => ({
          label: `${Math.round(scale * 100)}%`,
          type: 'radio',
          checked: config.scale === scale,
          click: () => setScale(scale)
        }))
      },
      {
        label: L.doNotDisturb,
        type: 'checkbox',
        checked: config.doNotDisturb,
        click: setDoNotDisturb
      },
      {
        label: L.launchAtLogin,
        type: 'checkbox',
        checked: deps.getLaunchAtLogin(),
        click: setLaunchAtLogin
      },
      { label: L.resetPosition, click: deps.resetPosition },
      { type: 'separator' },
      { label: deps.calibrationStatus?.() ?? L.calibrationUnavailable, enabled: false },
      {
        label: L.mapExpressions,
        type: 'checkbox',
        checked: config.calibrationArmed,
        enabled:
          deps.onMapExpressions !== undefined && (deps.canMapExpressions?.() ?? true),
        click: mapExpressions
      },
      { type: 'separator' },
      {
        label: L.automaticallyCheckForUpdates,
        type: 'checkbox',
        checked: config.automaticallyCheckForUpdates,
        click: setAutomaticUpdates
      },
      {
        label: L.checkForUpdates,
        enabled: deps.onCheckForUpdates !== undefined,
        click: () => deps.onCheckForUpdates?.()
      },
      {
        label: L.configureAgentIntegrations,
        enabled: deps.onConfigureAgentIntegrations !== undefined,
        click: () => deps.onConfigureAgentIntegrations?.()
      },
      { type: 'separator' },
      {
        label: L.language,
        submenu: [
          {
            label: L.languageSystem,
            type: 'radio',
            checked: config.language === 'system',
            click: () => setLanguage('system')
          },
          {
            label: L.languageEnglish,
            type: 'radio',
            checked: config.language === 'en',
            click: () => setLanguage('en')
          },
          {
            label: L.languageZhCN,
            type: 'radio',
            checked: config.language === 'zh-CN',
            click: () => setLanguage('zh-CN')
          }
        ]
      },
      { type: 'separator' },
      { label: L.quit, click: deps.quit }
    ])
  }

  deps.setLaunchAtLogin(config.launchAtLogin)
  config.launchAtLogin = deps.getLaunchAtLogin()
  refresh()
  return { refresh }
}
