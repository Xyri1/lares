import type { Language } from './config'

// Single source of truth for every user-visible main-process string. `en` is
// authoritative; `zhCN`'s `typeof en` annotation means a missing, extra, or
// mistyped key fails `pnpm typecheck` — the type checker enforces
// translation parity, no i18n framework needed.
export const en = {
  // Tray menu
  characters: 'Characters',
  importCharacter: 'Import Character…',
  scale: 'Scale',
  doNotDisturb: 'Do Not Disturb',
  launchAtLogin: 'Launch at Login',
  resetPosition: 'Reset Position',
  calibrationUnavailable: 'Calibration unavailable',
  mapExpressions: 'Map expressions…',
  automaticallyCheckForUpdates: 'Automatically Check for Updates',
  checkForUpdates: 'Check for Updates…',
  uninstallLares: 'Uninstall Lares…',
  quit: 'Quit',
  language: 'Language',
  // Self-referential language names — always shown in their own script so a
  // user who picked the wrong one can still find their way back to it.
  languageSystem: 'System',
  languageEnglish: 'English',
  languageZhCN: '简体中文',

  // Error dialog titles. Bodies are exception text / domain error strings
  // from elsewhere in the app and are deliberately left unlocalized.
  couldNotSaveSettings: 'Could not save settings',
  characterCouldNotBeLoaded: 'Character could not be loaded',
  characterCouldNotBeImported: 'Character could not be imported',
  characterImportCleanupFailed: 'Character import cleanup failed',
  expressionMappingCouldNotBeUpdated: 'Expression mapping could not be updated',
  laresCouldNotBeUninstalled: 'Lares could not be uninstalled',
  characterPackageInvalid: 'Character package invalid',
  defaultCharacterUnavailable: 'Default character unavailable',

  // Local ingress (the affect-feed server) failing to start
  ingressUnavailableTitle: 'Lares ingress unavailable',
  ingressPortInUse: (port: number): string =>
    `Port ${port} is already in use. Lares ingress is disabled.`,
  ingressFailedToStart: (message: string): string => `Lares ingress failed to start: ${message}`,

  // Import Character file picker
  importCharacterDialogTitle: 'Import Character',

  // Uninstall confirmation
  uninstallConfirmTitle: 'Uninstall Lares',
  uninstallConfirmMessage: 'Remove Lares and its agent integrations?',
  uninstallConfirmDetail:
    'Imported characters and authored work are retained unless you select the option below.',
  uninstallConfirmCancel: 'Cancel',
  uninstallConfirmUninstall: 'Uninstall',
  uninstallConfirmDeleteDataCheckbox: 'Also delete Lares data',

  // Updates
  updateAvailableTitle: 'Lares update available',
  updateAvailableBody: (tag: string): string => `${tag} is available on GitHub.`,
  upToDateTitle: 'Lares is up to date',
  upToDate: (version: string): string => `You are running the latest Lares release (${version}).`,
  updateCheckFailed: 'Update check failed',

  // Calibration status line (tray)
  calibrationNotMapped: '🔴 Expressions not mapped',
  calibrationLeft: (remaining: number): string =>
    `🟡 ${remaining} expression${remaining === 1 ? '' : 's'} left`,
  calibrationMapped: 'Expressions mapped'
}

export const zhCN: typeof en = {
  characters: '角色',
  importCharacter: '导入角色…',
  scale: '缩放',
  doNotDisturb: '勿扰模式',
  launchAtLogin: '开机启动',
  resetPosition: '重置位置',
  calibrationUnavailable: '校准不可用',
  mapExpressions: '映射表情…',
  automaticallyCheckForUpdates: '自动检查更新',
  checkForUpdates: '检查更新…',
  uninstallLares: '卸载 Lares…',
  quit: '退出',
  language: '语言',
  languageSystem: 'System',
  languageEnglish: 'English',
  languageZhCN: '简体中文',

  couldNotSaveSettings: '无法保存设置',
  characterCouldNotBeLoaded: '无法加载角色',
  characterCouldNotBeImported: '无法导入角色',
  characterImportCleanupFailed: '角色导入清理失败',
  expressionMappingCouldNotBeUpdated: '无法更新表情映射',
  laresCouldNotBeUninstalled: '无法卸载 Lares',
  characterPackageInvalid: '角色包无效',
  defaultCharacterUnavailable: '默认角色不可用',

  ingressUnavailableTitle: 'Lares 服务不可用',
  ingressPortInUse: (port: number): string => `端口 ${port} 已被占用，Lares 服务已禁用。`,
  ingressFailedToStart: (message: string): string => `Lares 服务启动失败：${message}`,

  importCharacterDialogTitle: '导入角色',

  uninstallConfirmTitle: '卸载 Lares',
  uninstallConfirmMessage: '移除 Lares 及其代理集成？',
  uninstallConfirmDetail: '除非勾选下方选项，已导入的角色和创作内容将被保留。',
  uninstallConfirmCancel: '取消',
  uninstallConfirmUninstall: '卸载',
  uninstallConfirmDeleteDataCheckbox: '同时删除 Lares 数据',

  updateAvailableTitle: '有新版本可用',
  updateAvailableBody: (tag: string): string => `${tag} 已在 GitHub 上发布。`,
  upToDateTitle: 'Lares 已是最新版本',
  upToDate: (version: string): string => `当前已是最新版本（${version}）。`,
  updateCheckFailed: '更新检查失败',

  calibrationNotMapped: '🔴 表情尚未映射',
  calibrationLeft: (remaining: number): string => `🟡 还剩 ${remaining} 个表情`,
  calibrationMapped: '表情已映射'
}

export type Locale = 'en' | 'zh-CN'

const TABLES: Record<Locale, typeof en> = { en, 'zh-CN': zhCN }

/** Live binding — call sites read `L.quit` and see the active locale immediately. */
export let L: typeof en = en

export function setLocale(locale: Locale): void {
  L = TABLES[locale]
}

// Whitelist, not a Traditional-Chinese carve-out: anything not explicitly
// Simplified (including zh-Hant*/zh-TW/zh-HK) resolves to English — a
// wrong-variant Chinese UI reads worse than an English one.
function isSimplifiedChineseLocale(systemLocale: string): boolean {
  const locale = systemLocale.toLowerCase()
  return (
    locale === 'zh' ||
    locale.startsWith('zh-cn') ||
    locale.startsWith('zh-hans') ||
    locale.startsWith('zh-sg')
  )
}

/**
 * Pure so it's testable without an Electron `app` import — call with
 * `app.getLocale()` after app ready.
 */
export function resolveLocale(language: Language, systemLocale: string): Locale {
  if (language !== 'system') return language
  return isSimplifiedChineseLocale(systemLocale) ? 'zh-CN' : 'en'
}
