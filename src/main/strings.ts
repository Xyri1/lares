import type { Language } from './config'

// Single source of truth for every user-visible main-process string. `en` is
// authoritative; `zhCN`'s `typeof en` annotation means a missing, extra, or
// mistyped key fails `pnpm typecheck` — the type checker enforces
// translation parity, no i18n framework needed.
export const en = {
  // Tray menu
  characters: 'Characters',
  importCharacter: 'Import Character…',
  openCharacterFolder: 'Open Character Folder',
  scale: 'Scale',
  doNotDisturb: 'Do Not Disturb',
  launchAtLogin: 'Launch at Login',
  resetPosition: 'Reset Position',
  calibrationUnavailable: 'Calibration unavailable',
  mapExpressions: 'Map expressions…',
  automaticallyCheckForUpdates: 'Automatically Check for Updates',
  checkForUpdates: 'Check for Updates…',
  configureAgentIntegrations: 'Configure Agent Integrations…',
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

  // Agent integrations
  agentIntegrationsConfirmTitle: 'Configure Agent Integrations',
  agentIntegrationsConfirmMessage: 'Configure the Lares marketplace plugin where Claude Code or Codex is available?',
  agentIntegrationsConfirmDetail:
    'Lares will download its public marketplace plugin and install hooks plus the local MCP connection. Each harness may still ask you to review and trust its hooks.',
  agentIntegrationsCancel: 'Cancel',
  agentIntegrationsConfigure: 'Configure',
  agentIntegrationsResultTitle: 'Agent Integrations',
  agentIntegrationConfigured: (harness: string): string => `${harness}: configured`,
  agentIntegrationAlreadyConfigured: (harness: string): string => `${harness}: already configured`,
  agentIntegrationMissing: (harness: string): string => `${harness}: plugin manager not found`,
  agentIntegrationFailed: (harness: string, error: string): string => `${harness}: ${error}`,
  agentIntegrationsUnknownError: 'Unknown error',
  agentIntegrationsVerificationFailed: 'Lares was not listed after installation',
  agentIntegrationsClaudeNext: 'Claude Code: start a new session or run /reload-plugins.',
  agentIntegrationsCodexNext:
    'Codex: start a new task in the CLI or ChatGPT desktop app, then review and trust hooks with /hooks.',
  agentIntegrationsCopyCommands: 'Copy Manual Commands',
  agentIntegrationsDone: 'Done',

  // Calibration status line (tray)
  calibrationNotMapped: '🔴 Expressions not mapped',
  calibrationLeft: (remaining: number): string =>
    `🟡 ${remaining} expression${remaining === 1 ? '' : 's'} left`,
  calibrationMapped: 'Expressions mapped'
}

export const zhCN: typeof en = {
  characters: '角色',
  importCharacter: '导入角色…',
  openCharacterFolder: '打开角色目录',
  scale: '缩放',
  doNotDisturb: '勿扰模式',
  launchAtLogin: '开机启动',
  resetPosition: '重置位置',
  calibrationUnavailable: '校准不可用',
  mapExpressions: '映射表情…',
  automaticallyCheckForUpdates: '自动检查更新',
  checkForUpdates: '检查更新…',
  configureAgentIntegrations: '配置 Agent 集成…',
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
  uninstallConfirmMessage: '移除 Lares 及其 Agent 集成？',
  uninstallConfirmDetail: '除非勾选下方选项，已导入的角色和创作内容将被保留。',
  uninstallConfirmCancel: '取消',
  uninstallConfirmUninstall: '卸载',
  uninstallConfirmDeleteDataCheckbox: '同时删除 Lares 数据',

  updateAvailableTitle: '有新版本可用',
  updateAvailableBody: (tag: string): string => `${tag} 已在 GitHub 上发布。`,
  upToDateTitle: 'Lares 已是最新版本',
  upToDate: (version: string): string => `当前已是最新版本（${version}）。`,
  updateCheckFailed: '更新检查失败',

  agentIntegrationsConfirmTitle: '配置 Agent 集成',
  agentIntegrationsConfirmMessage: '要在可用的 Claude Code 或 Codex 中配置 Lares 市场插件吗？',
  agentIntegrationsConfirmDetail:
    'Lares 将下载其公开市场插件，并安装钩子和本地 MCP 连接。每个工具仍可能要求你审核并信任其钩子。',
  agentIntegrationsCancel: '取消',
  agentIntegrationsConfigure: '配置',
  agentIntegrationsResultTitle: 'Agent 集成',
  agentIntegrationConfigured: (harness: string): string => `${harness}：已配置`,
  agentIntegrationAlreadyConfigured: (harness: string): string => `${harness}：已配置`,
  agentIntegrationMissing: (harness: string): string => `${harness}：未找到插件管理器`,
  agentIntegrationFailed: (harness: string, error: string): string => `${harness}：${error}`,
  agentIntegrationsUnknownError: '未知错误',
  agentIntegrationsVerificationFailed: '安装后未列出 Lares',
  agentIntegrationsClaudeNext: 'Claude Code：启动新会话或运行 /reload-plugins。',
  agentIntegrationsCodexNext:
    'Codex：在 CLI 或 ChatGPT 桌面应用中新建任务，然后通过 /hooks 审核并信任钩子。',
  agentIntegrationsCopyCommands: '复制手动命令',
  agentIntegrationsDone: '完成',

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
