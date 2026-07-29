import { rm, stat } from 'node:fs/promises'
import { isDeepStrictEqual } from 'node:util'
import pluginHooks from '../../../../plugins/lares/hooks/hooks.json' with { type: 'json' }
import {
  backupOnce,
  readJson,
  writeIfDifferent,
  type FileResult,
  type JsonObject
} from '../claude-code/writer.ts'
import { atomicWrite } from '../../fs.ts'

export interface CodexHooksOptions {
  codexDirectory: string
  hooksPath: string
}

const forwarderPattern = /(?:^|[\\/\s"'])lares-forwarder(?:\.cmd)?(?=$|[\\/\s"';&|()<>])/i
const sourceHooks = pluginHooks.hooks as JsonObject

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function codexDirectoryExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory()
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

function withoutLaresHooks(config: JsonObject): JsonObject {
  if (config.hooks === undefined) return config
  if (!isObject(config.hooks)) throw new Error('Codex hooks config "hooks" must be an object')

  const hooks: JsonObject = {}
  for (const [event, groups] of Object.entries(config.hooks)) {
    if (!Array.isArray(groups)) throw new Error(`Codex hook "${event}" must be an array`)
    const keptGroups = groups.flatMap((group) => {
      if (!isObject(group) || !Array.isArray(group.hooks)) {
        throw new Error(`Codex hook "${event}" groups must contain a hooks array`)
      }
      const handlers = group.hooks.filter((handler) => {
        if (!isObject(handler) || typeof handler.command !== 'string') {
          throw new Error(`Codex hook "${event}" handlers must have a command`)
        }
        return !forwarderPattern.test(handler.command)
      })
      return handlers.length === 0 && group.hooks.length > 0 ? [] : [{ ...group, hooks: handlers }]
    })
    if (keptGroups.length > 0) hooks[event] = keptGroups
  }
  return { ...config, hooks }
}

function withLaresHooks(config: JsonObject): JsonObject {
  const clean = withoutLaresHooks(config)
  const hooks = { ...(clean.hooks as JsonObject | undefined) }
  for (const [event, groups] of Object.entries(sourceHooks)) {
    hooks[event] = [...((hooks[event] as unknown[]) ?? []), ...(groups as unknown[])]
  }
  return { ...clean, hooks }
}

export async function syncCodexHooks(options: CodexHooksOptions): Promise<FileResult> {
  if (!(await codexDirectoryExists(options.codexDirectory))) return 'skipped'
  return writeIfDifferent(options.hooksPath, withLaresHooks, true)
}

export async function removeCodexHooks(options: CodexHooksOptions): Promise<FileResult> {
  if (!(await codexDirectoryExists(options.codexDirectory))) return 'skipped'
  const current = await readJson(options.hooksPath)
  if (!current) return 'skipped'

  const next = withoutLaresHooks(current.value)
  if (isDeepStrictEqual(current.value, next)) return 'unchanged'
  await backupOnce(options.hooksPath)
  if (Object.keys(next.hooks as JsonObject).length === 0) await rm(options.hooksPath)
  else await atomicWrite(options.hooksPath, next)
  return 'updated'
}
