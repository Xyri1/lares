import { execFile } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'

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
  return [
    `${definition.cli} ${definition.marketplaceAdd.join(' ')}`,
    `${definition.cli} ${definition.pluginAdd.join(' ')}`
  ]
}

function candidates(cli: string, platform: NodeJS.Platform, home: string): string[] {
  if (platform === 'win32') {
    return [cli, join(process.env.LOCALAPPDATA ?? home, 'Programs', cli, `${cli}.exe`)]
  }
  return [
    cli,
    join(home, '.local', 'bin', cli),
    ...(platform === 'darwin' ? ['/opt/homebrew/bin/' + cli] : []),
    '/usr/local/bin/' + cli
  ]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
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

function hasPlugin(harness: Harness, json: string): boolean {
  try {
    const value: unknown = JSON.parse(json)
    if (harness === 'claude') {
      return (
        Array.isArray(value) &&
        value.some(
          (entry) => isRecord(entry) && entry.id === 'lares@lares' && entry.enabled === true
        )
      )
    }
    return (
      isRecord(value) &&
      Array.isArray(value.installed) &&
      value.installed.some(
        (entry) =>
          isRecord(entry) &&
          entry.pluginId === 'lares@lares' &&
          entry.installed === true &&
          entry.enabled === true
      )
    )
  } catch {
    return false
  }
}

function failure(result: CommandResult): string {
  const message =
    result.stderr.trim() || result.stdout.trim() || result.error || `Exited with code ${result.code}`
  return message.length > 500 ? `${message.slice(0, 497)}...` : message
}

async function configureHarness(
  definition: HarnessDefinition,
  deps: Required<Pick<AgentIntegrationDependencies, 'run' | 'platform' | 'home'>>
): Promise<HarnessConfiguration> {
  let command: string | undefined
  let marketplace: CommandResult | undefined
  for (const candidate of candidates(definition.cli, deps.platform, deps.home)) {
    const result = await deps.run(candidate, definition.marketplaceList)
    if (!result.missing) {
      command = candidate
      marketplace = result
      break
    }
  }
  if (!command || !marketplace) return { harness: definition.harness, status: 'missing' }
  if (marketplace.code !== 0) {
    return { harness: definition.harness, status: 'failed', error: failure(marketplace) }
  }

  let plugins = await deps.run(command, definition.pluginList)
  if (plugins.code !== 0) {
    return { harness: definition.harness, status: 'failed', error: failure(plugins) }
  }
  const alreadyConfigured =
    hasMarketplace(definition.harness, marketplace.stdout) && hasPlugin(definition.harness, plugins.stdout)
  if (alreadyConfigured) return { harness: definition.harness, status: 'already-configured' }

  if (!hasMarketplace(definition.harness, marketplace.stdout)) {
    const added = await deps.run(command, definition.marketplaceAdd)
    if (added.code !== 0) {
      return { harness: definition.harness, status: 'failed', error: failure(added) }
    }
  }
  if (!hasPlugin(definition.harness, plugins.stdout)) {
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
  return {
    confirmed: true,
    harnesses: await Promise.all(
      HARNESSES.map((definition) => configureHarness(definition, { run, platform, home }))
    )
  }
}

export function runAgentIntegrationCommand(command: string, args: string[]): Promise<CommandResult> {
  return new Promise((resolve) => {
    execFile(command, args, { encoding: 'utf8', shell: false, maxBuffer: 64 * 1024, timeout: 60_000 }, (error, stdout, stderr) => {
      const nodeError = error as NodeJS.ErrnoException | null
      resolve({
        code: typeof nodeError?.code === 'number' ? nodeError.code : error ? 1 : 0,
        stdout,
        stderr,
        error: error?.message,
        missing: nodeError?.code === 'ENOENT'
      })
    })
  })
}
