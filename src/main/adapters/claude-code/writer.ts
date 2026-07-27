import { constants } from 'node:fs'
import { copyFile, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'

type JsonObject = Record<string, unknown>
type FileResult = 'updated' | 'unchanged' | 'skipped'

export interface ClaudeCodePaths {
  claudeDirectory: string
  settingsPath: string
  claudeConfigPath: string
}

export interface SyncClaudeCodeOptions extends ClaudeCodePaths {
  appPath: string
  forwarderPath: string
  port: number
  platform: NodeJS.Platform
  log?: (message: string) => void
}

export interface ClaudeCodeAdapterResult {
  settings: FileResult
  mcp: FileResult
}

const hookEvents = [
  'SessionStart',
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'Notification',
  'Stop',
  'SubagentStart',
  'SubagentStop'
] as const

const forwarderPattern = /(?:^|[\\/\s"'])forwarder\.js(?=$|[\\/\s"';&|()<>])/i

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function quotePosix(value: string): string {
  return `"${value.replace(/["\\$`]/g, '\\$&')}"`
}

export function claudeCodeCommand(
  appPath: string,
  forwarderPath: string,
  platform: NodeJS.Platform
): string {
  // Claude Code runs shell-form hook commands through Git Bash even on
  // Windows, so the command is POSIX on every platform. Windows clears
  // LARES_HARNESS_PID instead of exporting $PPID: Git Bash reports MSYS
  // pids, not Windows pids, and 005-D9 wants truthful-or-absent.
  const pid = platform === 'win32' ? 'LARES_HARNESS_PID=' : 'LARES_HARNESS_PID=$PPID'
  return `${pid} ELECTRON_RUN_AS_NODE=1 ${quotePosix(appPath)} ${quotePosix(forwarderPath)} claude-code`
}

function withoutLaresHooks(settings: JsonObject): JsonObject {
  if (settings.hooks === undefined) return settings
  if (!isObject(settings.hooks)) throw new Error('Claude Code settings "hooks" must be an object')

  const hooks = { ...settings.hooks }
  for (const [event, value] of Object.entries(hooks)) {
    if (!Array.isArray(value)) continue

    let removed = false
    const groups = value.flatMap((group) => {
      if (!isObject(group) || !Array.isArray(group.hooks)) return [group]

      const handlers = group.hooks.filter((handler) => {
        const isLares =
          isObject(handler) &&
          typeof handler.command === 'string' &&
          forwarderPattern.test(handler.command)
        removed ||= isLares
        return !isLares
      })
      return handlers.length === 0 && handlers.length !== group.hooks.length
        ? []
        : [{ ...group, hooks: handlers }]
    })

    if (groups.length === 0 && removed) delete hooks[event]
    else hooks[event] = groups
  }

  return { ...settings, hooks }
}

function withLaresHooks(settings: JsonObject, command: string): JsonObject {
  const clean = withoutLaresHooks(settings)
  const hooks = isObject(clean.hooks) ? { ...clean.hooks } : {}

  for (const event of hookEvents) {
    const existing = hooks[event]
    if (existing !== undefined && !Array.isArray(existing)) {
      throw new Error(`Claude Code settings hook "${event}" must be an array`)
    }
    hooks[event] = [
      ...(existing ?? []),
      {
        ...(event === 'Notification' ? { matcher: 'permission_prompt' } : {}),
        hooks: [{ type: 'command', command }]
      }
    ]
  }

  return { ...clean, hooks }
}

async function readJson(path: string): Promise<{ value: JsonObject } | undefined> {
  let bytes: string
  try {
    bytes = await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }

  let value: unknown
  try {
    value = JSON.parse(bytes)
  } catch (error) {
    throw new Error(`Invalid JSON in ${path}`, { cause: error })
  }
  if (!isObject(value)) throw new Error(`Expected a JSON object in ${path}`)
  return { value }
}

async function backupOnce(path: string): Promise<void> {
  try {
    await copyFile(path, `${path}.lares-backup`, constants.COPYFILE_EXCL)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
  }
}

async function atomicWrite(path: string, value: JsonObject): Promise<void> {
  const temporary = `${path}.lares-tmp-${process.pid}-${randomUUID()}`
  try {
    let copied = false
    try {
      await copyFile(path, temporary, constants.COPYFILE_EXCL)
      copied = true
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
      flag: copied ? 'w' : 'wx'
    })
    await rename(temporary, path)
  } catch (error) {
    await rm(temporary, { force: true })
    throw error
  }
}

async function writeSettings(
  path: string,
  transform: (settings: JsonObject) => JsonObject,
  createIfMissing: boolean
): Promise<FileResult> {
  const current = await readJson(path)
  if (!current && !createIfMissing) return 'skipped'
  const next = transform(current?.value ?? {})
  if (current && isDeepStrictEqual(current.value, next)) return 'unchanged'
  if (current) await backupOnce(path)
  await atomicWrite(path, next)
  return 'updated'
}

async function writeMcp(
  path: string,
  transform: (config: JsonObject) => JsonObject,
  log: (message: string) => void
): Promise<FileResult> {
  let current: Awaited<ReturnType<typeof readJson>>
  try {
    current = await readJson(path)
  } catch (error) {
    log(error instanceof Error ? error.message : String(error))
    return 'skipped'
  }
  if (!current) {
    log(`Claude Code config not found at ${path}; skipping MCP registration`)
    return 'skipped'
  }

  let next: JsonObject
  try {
    next = transform(current.value)
  } catch (error) {
    log(error instanceof Error ? error.message : String(error))
    return 'skipped'
  }
  if (isDeepStrictEqual(current.value, next)) return 'unchanged'
  await backupOnce(path)
  await atomicWrite(path, next)
  return 'updated'
}

async function claudeDirectoryExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory()
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

export async function syncClaudeCode(
  options: SyncClaudeCodeOptions
): Promise<ClaudeCodeAdapterResult> {
  if (!(await claudeDirectoryExists(options.claudeDirectory))) {
    return { settings: 'skipped', mcp: 'skipped' }
  }

  const command = claudeCodeCommand(options.appPath, options.forwarderPath, options.platform)
  const settings = await writeSettings(
    options.settingsPath,
    (value) => withLaresHooks(value, command),
    true
  )
  const mcp = await writeMcp(
    options.claudeConfigPath,
    (value) => {
      if (value.mcpServers !== undefined && !isObject(value.mcpServers)) {
        throw new Error(`Claude Code config "mcpServers" must be an object`)
      }
      return {
        ...value,
        mcpServers: {
          ...(value.mcpServers ?? {}),
          lares: { type: 'http', url: `http://127.0.0.1:${options.port}/v1/mcp` }
        }
      }
    },
    options.log ?? console.error
  )
  return { settings, mcp }
}

export async function removeClaudeCode(
  options: ClaudeCodePaths & { log?: (message: string) => void }
): Promise<ClaudeCodeAdapterResult> {
  if (!(await claudeDirectoryExists(options.claudeDirectory))) {
    return { settings: 'skipped', mcp: 'skipped' }
  }

  const settings = await writeSettings(options.settingsPath, withoutLaresHooks, false)
  const mcp = await writeMcp(
    options.claudeConfigPath,
    (value) => {
      if (!isObject(value.mcpServers) || !Object.hasOwn(value.mcpServers, 'lares')) return value
      const mcpServers = { ...value.mcpServers }
      delete mcpServers.lares
      return { ...value, mcpServers }
    },
    options.log ?? console.error
  )
  return { settings, mcp }
}
