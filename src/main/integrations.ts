import { execFile, type ExecFileException } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, join, posix } from 'node:path'

export type Harness = 'claude' | 'codex'

export interface CommandResult {
  code: number
  stdout: string
  stderr: string
  error?: string
  missing?: boolean
}

export interface AgentIntegrationDependencies {
  confirm(): Promise<boolean>
  run(command: string, args: string[]): Promise<CommandResult>
  platform?: NodeJS.Platform
  home?: string
  codexCommands?: string[]
}

export interface HarnessConfiguration {
  harness: Harness
  status: 'configured' | 'already-configured' | 'missing' | 'failed'
  error?: string
  reason?: 'verification'
}

export interface AgentIntegrationReport {
  confirmed: boolean
  harnesses: HarnessConfiguration[]
}

interface HarnessDefinition {
  harness: Harness
  cli: string
  marketplaceAdd: string[]
  pluginAdd: string[]
  marketplaceList: string[]
  pluginList: string[]
}

const HARNESSES: HarnessDefinition[] = [
  {
    harness: 'claude',
    cli: 'claude',
    marketplaceAdd: ['plugin', 'marketplace', 'add', 'Xyri1/lares', '--scope', 'user'],
    pluginAdd: ['plugin', 'install', 'lares@lares', '--scope', 'user'],
    marketplaceList: ['plugin', 'marketplace', 'list', '--json'],
    pluginList: ['plugin', 'list', '--json']
  },
  {
    harness: 'codex',
    cli: 'codex',
    marketplaceAdd: ['plugin', 'marketplace', 'add', 'Xyri1/lares', '--json'],
    pluginAdd: ['plugin', 'add', 'lares@lares', '--json'],
    marketplaceList: ['plugin', 'marketplace', 'list', '--json'],
    pluginList: ['plugin', 'list', '--json']
  }
]

export function manualCommands(harness: Harness): string[] {
  const definition = HARNESSES.find((candidate) => candidate.harness === harness)!
  return [definition.marketplaceAdd, definition.pluginAdd].map(
    (args) => `${definition.cli} ${args.join(' ')}`
  )
}

function candidates(cli: string, platform: NodeJS.Platform, home: string): string[] {
  if (platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA ?? join(home, 'AppData', 'Local')
    return [cli, join(localAppData, 'Programs', cli, `${cli}.exe`)]
  }
  return [
    cli,
    join(home, '.local', 'bin', cli),
    ...(platform === 'darwin' ? ['/opt/homebrew/bin/' + cli] : []),
    '/usr/local/bin/' + cli
  ]
}

async function codexCandidates(
  platform: NodeJS.Platform,
  home: string,
  run: AgentIntegrationDependencies['run']
): Promise<string[]> {
  if (platform === 'win32') {
    const root = join(
      process.env.LOCALAPPDATA ?? join(home, 'AppData', 'Local'),
      'OpenAI',
      'Codex',
      'bin'
    )
    let appCommands: string[] = []
    try {
      appCommands = readdirSync(root, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => join(root, entry.name, 'codex.exe'))
        .filter(existsSync)
    } catch {
      // Codex App is not installed.
    }
    const pathCommands = (process.env.PATH ?? process.env.Path ?? '')
      .split(delimiter)
      .flatMap((directory) => [join(directory, 'codex.exe'), join(directory, 'codex.cmd')])
      .filter(existsSync)
    return [...new Set([...appCommands, ...pathCommands, ...candidates('codex', platform, home)])]
  }
  if (platform !== 'darwin') return candidates('codex', platform, home)
  const direct = [
    '/Applications/ChatGPT.app/Contents/Resources/codex',
    '/Applications/Codex.app/Contents/Resources/codex',
    posix.join(home, 'Applications', 'ChatGPT.app', 'Contents', 'Resources', 'codex'),
    posix.join(home, 'Applications', 'Codex.app', 'Contents', 'Resources', 'codex'),
    ...candidates('codex', platform, home)
  ]
  const shell = process.env.SHELL ?? '/bin/zsh'
  const resolved = await run(shell, ['-lic', 'command -v codex'])
  const shellCommand =
    resolved.code === 0
      ? resolved.stdout
          .split(/\r?\n/)
          .map((line) => line.trim())
          .findLast(posix.isAbsolute)
      : undefined
  return [...new Set(shellCommand ? [...direct, shellCommand] : direct)]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function hasStatusShape(harness: Harness, marketplace: string, plugins: string): boolean {
  try {
    const marketplaceValue: unknown = JSON.parse(marketplace)
    const pluginValue: unknown = JSON.parse(plugins)
    return harness === 'claude'
      ? Array.isArray(marketplaceValue) && Array.isArray(pluginValue)
      : isRecord(marketplaceValue) &&
          Array.isArray(marketplaceValue.marketplaces) &&
          isRecord(pluginValue) &&
          Array.isArray(pluginValue.installed)
  } catch {
    return false
  }
}

function isLaresRepository(value: unknown): boolean {
  return (
    typeof value === 'string' &&
    ['xyri1/lares', 'https://github.com/xyri1/lares', 'https://github.com/xyri1/lares.git'].includes(
      value.toLowerCase()
    )
  )
}

function hasMarketplace(harness: Harness, json: string): boolean {
  try {
    const value: unknown = JSON.parse(json)
    if (harness === 'claude') {
      return (
        Array.isArray(value) &&
        value.some(
          (entry) =>
            isRecord(entry) &&
            entry.name === 'lares' &&
            entry.source === 'github' &&
            isLaresRepository(entry.repo)
        )
      )
    }
    return (
      isRecord(value) &&
      Array.isArray(value.marketplaces) &&
      value.marketplaces.some(
        (entry) =>
          isRecord(entry) &&
          entry.name === 'lares' &&
          isRecord(entry.marketplaceSource) &&
          entry.marketplaceSource.sourceType === 'git' &&
          isLaresRepository(entry.marketplaceSource.source)
      )
    )
  } catch {
    return false
  }
}

/** The `lares@lares` row of a host's `plugin list --json` output, if present. */
function laresEntry(harness: Harness, json: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(json)
    const rows: unknown = harness === 'claude' ? value : isRecord(value) ? value.installed : undefined
    if (!Array.isArray(rows)) return undefined
    return rows
      .filter(isRecord)
      .find((entry) => (harness === 'claude' ? entry.id : entry.pluginId) === 'lares@lares')
  } catch {
    return undefined
  }
}

function hasPlugin(harness: Harness, json: string): boolean {
  const entry = laresEntry(harness, json)
  return entry?.enabled === true && (harness === 'claude' || entry.installed === true)
}

function failure(result: CommandResult): string {
  const message =
    result.stderr.trim() || result.stdout.trim() || result.error || `Exited with code ${result.code}`
  return message.length > 500 ? `${message.slice(0, 497)}...` : message
}

async function configureHarness(
  definition: HarnessDefinition,
  commands: string[],
  deps: Required<Pick<AgentIntegrationDependencies, 'run' | 'platform' | 'home'>>
): Promise<HarnessConfiguration> {
  let command: string | undefined
  let marketplace: CommandResult | undefined
  let plugins: CommandResult | undefined
  let candidateFailure: CommandResult | undefined
  let verificationFailure = false
  for (const candidate of commands) {
    const marketplaceResult = await deps.run(candidate, definition.marketplaceList)
    if (marketplaceResult.missing) continue
    if (marketplaceResult.code !== 0) {
      candidateFailure ??= marketplaceResult
      continue
    }
    const pluginResult = await deps.run(candidate, definition.pluginList)
    if (pluginResult.code !== 0) {
      candidateFailure ??= pluginResult
      continue
    }
    if (!hasStatusShape(definition.harness, marketplaceResult.stdout, pluginResult.stdout)) {
      verificationFailure = true
      continue
    }
    command = candidate
    marketplace = marketplaceResult
    plugins = pluginResult
    break
  }
  if (!command || !marketplace || !plugins) {
    if (candidateFailure) {
      return { harness: definition.harness, status: 'failed', error: failure(candidateFailure) }
    }
    return verificationFailure
      ? { harness: definition.harness, status: 'failed', reason: 'verification' }
      : { harness: definition.harness, status: 'missing' }
  }

  const configured = hasPlugin(definition.harness, plugins.stdout)
  if (hasMarketplace(definition.harness, marketplace.stdout) && configured) {
    return { harness: definition.harness, status: 'already-configured' }
  }

  if (!hasMarketplace(definition.harness, marketplace.stdout)) {
    const added = await deps.run(command, definition.marketplaceAdd)
    if (added.code !== 0) {
      return { harness: definition.harness, status: 'failed', error: failure(added) }
    }
  }
  if (!configured) {
    const installed = await deps.run(command, definition.pluginAdd)
    if (installed.code !== 0) {
      return { harness: definition.harness, status: 'failed', error: failure(installed) }
    }
  }

  marketplace = await deps.run(command, definition.marketplaceList)
  plugins = await deps.run(command, definition.pluginList)
  if (marketplace.code !== 0 || plugins.code !== 0) {
    return {
      harness: definition.harness,
      status: 'failed',
      error: failure(marketplace.code !== 0 ? marketplace : plugins)
    }
  }
  return hasMarketplace(definition.harness, marketplace.stdout) &&
    hasPlugin(definition.harness, plugins.stdout)
    ? { harness: definition.harness, status: 'configured' }
    : { harness: definition.harness, status: 'failed', reason: 'verification' }
}

export async function configureAgentIntegrations(
  deps: AgentIntegrationDependencies
): Promise<AgentIntegrationReport> {
  if (!(await deps.confirm())) return { confirmed: false, harnesses: [] }
  const run = deps.run
  const platform = deps.platform ?? process.platform
  const home = deps.home ?? homedir()
  const codexCommands = deps.codexCommands ?? (await codexCandidates(platform, home, run))
  return {
    confirmed: true,
    harnesses: await Promise.all(
      HARNESSES.map((definition) =>
        configureHarness(
          definition,
          definition.harness === 'codex'
            ? codexCommands
            : candidates(definition.cli, platform, home),
          { run, platform, home }
        )
      )
    )
  }
}

export function runAgentIntegrationCommand(command: string, args: string[]): Promise<CommandResult> {
  const windowsLauncher = process.platform === 'win32' && /\.(?:cmd|bat)$/i.test(command)
  if (
    windowsLauncher &&
    (/["&|<>^%!\r\n]/.test(command) || args.some((argument) => !/^[A-Za-z0-9@./:_-]+$/.test(argument)))
  ) {
    return Promise.resolve({
      code: 1,
      stdout: '',
      stderr: '',
      error: 'Refused unsafe Windows command launcher arguments'
    })
  }
  const executable = windowsLauncher ? (process.env.ComSpec ?? 'cmd.exe') : command
  const executableArgs = windowsLauncher
    ? ['/d', '/s', '/c', `""${command}" ${args.join(' ')}"`]
    : args
  return new Promise((resolve) => {
    const complete = (
      error: ExecFileException | null,
      stdout: string,
      stderr: string
    ): void => {
      resolve({
        code: typeof error?.code === 'number' ? error.code : error ? 1 : 0,
        stdout,
        stderr,
        error: error?.message,
        missing: error?.code === 'ENOENT'
      })
    }
    try {
      execFile(
        executable,
        executableArgs,
        {
          encoding: 'utf8',
          shell: false,
          windowsVerbatimArguments: windowsLauncher,
          timeout: 60_000
        },
        complete
      )
    } catch (error) {
      complete(error as ExecFileException, '', '')
    }
  })
}
