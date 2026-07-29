import { constants } from 'node:fs'
import { copyFile, readFile, stat } from 'node:fs/promises'
import { isDeepStrictEqual } from 'node:util'
import { errorMessage } from '../../errors.ts'
import { atomicWrite } from '../../fs.ts'

export type JsonObject = Record<string, unknown>
export type FileResult = 'updated' | 'unchanged' | 'skipped'

export interface ClaudeCodePaths {
  claudeDirectory: string
  settingsPath: string
  claudeConfigPath: string
}

export interface ClaudeCodeAdapterResult {
  settings: FileResult
  mcp: FileResult
}

// Registration moved into the marketplace plugin (plugins/claude-code, 009);
// only the removal pass remains, cleaning up what older builds wrote into
// ~/.claude/settings.json and ~/.claude.json.
const forwarderPattern = /(?:^|[\\/\s"'])forwarder\.js(?=$|[\\/\s"';&|()<>])/i

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
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

export async function readJson(path: string): Promise<{ value: JsonObject } | undefined> {
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

export async function backupOnce(path: string): Promise<void> {
  try {
    await copyFile(path, `${path}.lares-backup`, constants.COPYFILE_EXCL)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
  }
}

async function writeIfDifferent(
  path: string,
  transform: (settings: JsonObject) => JsonObject
): Promise<FileResult> {
  const current = await readJson(path)
  if (!current) return 'skipped'
  const next = transform(current.value)
  if (isDeepStrictEqual(current.value, next)) return 'unchanged'
  await backupOnce(path)
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
    log(errorMessage(error))
    return 'skipped'
  }
  if (!current) return 'skipped'

  let next: JsonObject
  try {
    next = transform(current.value)
  } catch (error) {
    log(errorMessage(error))
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

export async function removeClaudeCode(
  options: ClaudeCodePaths & { log?: (message: string) => void }
): Promise<ClaudeCodeAdapterResult> {
  if (!(await claudeDirectoryExists(options.claudeDirectory))) {
    return { settings: 'skipped', mcp: 'skipped' }
  }

  const settings = await writeIfDifferent(options.settingsPath, withoutLaresHooks)
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
