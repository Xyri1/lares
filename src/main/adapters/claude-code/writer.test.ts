import { afterEach, describe, expect, it } from 'vitest'
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  utimes,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  claudeCodeCommand,
  removeClaudeCode,
  syncClaudeCode,
  type SyncClaudeCodeOptions
} from './writer'

const roots: string[] = []

async function fixture(): Promise<{
  root: string
  claudeDirectory: string
  settingsPath: string
  claudeConfigPath: string
  options: SyncClaudeCodeOptions
}> {
  const root = await mkdtemp(join(tmpdir(), 'lares-claude-code-'))
  roots.push(root)
  const claudeDirectory = join(root, '.claude')
  await mkdir(claudeDirectory)
  const settingsPath = join(claudeDirectory, 'settings.json')
  const claudeConfigPath = join(root, '.claude.json')
  return {
    root,
    claudeDirectory,
    settingsPath,
    claudeConfigPath,
    options: {
      claudeDirectory,
      settingsPath,
      claudeConfigPath,
      appPath: 'C:\\Program Files\\Lares\\Lares.exe',
      forwarderPath: 'C:\\Program Files\\Lares\\resources\\scripts\\forwarder.js',
      port: 21473,
      platform: 'win32',
      log: () => undefined
    }
  }
}

function laresHandlers(settings: Record<string, any>): Array<Record<string, unknown>> {
  return Object.values(settings.hooks ?? {}).flatMap((groups: any) =>
    Array.isArray(groups)
      ? groups.flatMap((group) =>
          Array.isArray(group?.hooks)
            ? group.hooks.filter((handler: any) => handler.command?.includes('forwarder.js'))
            : []
        )
      : []
  )
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('Claude Code adapter writer', () => {
  it('replaces stale Lares hooks once while preserving user hooks and data', async () => {
    const { settingsPath, claudeConfigPath, options } = await fixture()
    const userHandler = { type: 'command', command: 'notify-user --done' }
    const original = {
      permissions: { allow: ['Read'] },
      hooks: {
        SessionStart: [
          {
            matcher: 'startup',
            hooks: [
              userHandler,
              {
                type: 'command',
                command: 'ELECTRON_RUN_AS_NODE=1 "/old/install/scripts/forwarder.js" claude-code'
              }
            ]
          }
        ],
        CustomEvent: [
          {
            hooks: [
              {
                type: 'command',
                command: '"D:\\stale\\forwarder.js" claude-code'
              }
            ]
          }
        ],
        Stop: [{ matcher: 'user', hooks: [userHandler] }]
      }
    }
    const originalBytes = `${JSON.stringify(original, null, 4)}\n`
    await writeFile(settingsPath, originalBytes)
    await writeFile(claudeConfigPath, '{}')

    expect(await syncClaudeCode(options)).toEqual({ settings: 'updated', mcp: 'updated' })
    const settings = JSON.parse(await readFile(settingsPath, 'utf8'))
    expect(settings.permissions).toEqual(original.permissions)
    expect(settings.hooks.CustomEvent).toBeUndefined()
    expect(settings.hooks.SessionStart[0]).toEqual({ matcher: 'startup', hooks: [userHandler] })
    expect(settings.hooks.Stop[0]).toEqual({ matcher: 'user', hooks: [userHandler] })
    expect(laresHandlers(settings)).toHaveLength(9)
    expect(Object.keys(settings.hooks)).toEqual([
      'SessionStart',
      'Stop',
      'UserPromptSubmit',
      'PreToolUse',
      'PostToolUse',
      'PostToolUseFailure',
      'Notification',
      'SubagentStart',
      'SubagentStop'
    ])
    expect(settings.hooks.Notification.at(-1).matcher).toBe('permission_prompt')
    expect(await readFile(`${settingsPath}.lares-backup`, 'utf8')).toBe(originalBytes)

    const bytes = await readFile(settingsPath, 'utf8')
    const old = new Date('2020-01-01T00:00:00.000Z')
    await utimes(settingsPath, old, old)
    const mtime = (await stat(settingsPath)).mtimeMs
    expect(await syncClaudeCode(options)).toEqual({ settings: 'unchanged', mcp: 'unchanged' })
    expect(await readFile(settingsPath, 'utf8')).toBe(bytes)
    expect((await stat(settingsPath)).mtimeMs).toBe(mtime)
    expect((await readdir(options.claudeDirectory)).some((name) => name.includes('lares-tmp'))).toBe(
      false
    )
  })

  it('creates settings only when the Claude directory exists and never backs up a new file', async () => {
    const { settingsPath, claudeConfigPath, options } = await fixture()
    const messages: string[] = []
    options.log = (message) => messages.push(message)

    expect(await syncClaudeCode(options)).toEqual({ settings: 'updated', mcp: 'skipped' })
    expect(laresHandlers(JSON.parse(await readFile(settingsPath, 'utf8')))).toHaveLength(9)
    await expect(stat(`${settingsPath}.lares-backup`)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(stat(claudeConfigPath)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(messages).toHaveLength(1)

    const missing = join(options.claudeDirectory, 'missing')
    const silentMessages: string[] = []
    const result = await syncClaudeCode({
      ...options,
      claudeDirectory: missing,
      settingsPath: join(missing, 'settings.json'),
      log: (message) => silentMessages.push(message)
    })
    expect(result).toEqual({ settings: 'skipped', mcp: 'skipped' })
    expect(silentMessages).toEqual([])
    await expect(stat(missing)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('owns the MCP entry idempotently and keeps the first backup across port changes', async () => {
    const { settingsPath, claudeConfigPath, options } = await fixture()
    await writeFile(settingsPath, '{}')
    const original = '{"theme":"dark","mcpServers":{"user":{"type":"stdio","command":"user"}}}\n'
    await writeFile(claudeConfigPath, original)
    if (process.platform !== 'win32') await chmod(claudeConfigPath, 0o600)

    await syncClaudeCode(options)
    const first = JSON.parse(await readFile(claudeConfigPath, 'utf8'))
    expect(first).toEqual({
      theme: 'dark',
      mcpServers: {
        user: { type: 'stdio', command: 'user' },
        lares: { type: 'http', url: 'http://127.0.0.1:21473/v1/mcp' }
      }
    })
    expect(await readFile(`${claudeConfigPath}.lares-backup`, 'utf8')).toBe(original)
    if (process.platform !== 'win32') {
      expect((await stat(claudeConfigPath)).mode & 0o777).toBe(0o600)
    }

    const bytes = await readFile(claudeConfigPath, 'utf8')
    const old = new Date('2020-01-01T00:00:00.000Z')
    await utimes(claudeConfigPath, old, old)
    const mtime = (await stat(claudeConfigPath)).mtimeMs
    expect((await syncClaudeCode(options)).mcp).toBe('unchanged')
    expect(await readFile(claudeConfigPath, 'utf8')).toBe(bytes)
    expect((await stat(claudeConfigPath)).mtimeMs).toBe(mtime)

    expect((await syncClaudeCode({ ...options, port: 21500 })).mcp).toBe('updated')
    expect(JSON.parse(await readFile(claudeConfigPath, 'utf8')).mcpServers.lares.url).toBe(
      'http://127.0.0.1:21500/v1/mcp'
    )
    expect(await readFile(`${claudeConfigPath}.lares-backup`, 'utf8')).toBe(original)
  })

  it('leaves invalid JSON untouched and reports invalid or missing MCP config', async () => {
    const { settingsPath, claudeConfigPath, options } = await fixture()
    await writeFile(settingsPath, '{ broken settings')
    await writeFile(claudeConfigPath, '{"mcpServers":{}}')
    const mcpBefore = await readFile(claudeConfigPath, 'utf8')

    await expect(syncClaudeCode(options)).rejects.toThrow(`Invalid JSON in ${settingsPath}`)
    expect(await readFile(settingsPath, 'utf8')).toBe('{ broken settings')
    expect(await readFile(claudeConfigPath, 'utf8')).toBe(mcpBefore)

    await writeFile(settingsPath, '{}')
    await writeFile(claudeConfigPath, '{ broken config')
    const messages: string[] = []
    expect(await syncClaudeCode({ ...options, log: (message) => messages.push(message) })).toEqual({
      settings: 'updated',
      mcp: 'skipped'
    })
    expect(await readFile(claudeConfigPath, 'utf8')).toBe('{ broken config')
    expect(messages).toEqual([`Invalid JSON in ${claudeConfigPath}`])
    await expect(stat(`${claudeConfigPath}.lares-backup`)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('removes only recognized hooks and mcpServers.lares', async () => {
    const { settingsPath, claudeConfigPath, options } = await fixture()
    const userHandler = { type: 'command', command: 'user-forwarder.js-helper' }
    await writeFile(
      settingsPath,
      JSON.stringify({
        env: { KEEP: 'yes' },
        hooks: {
          Stop: [
            {
              matcher: 'mixed',
              hooks: [
                userHandler,
                { type: 'command', command: '"/another/path/forwarder.js" claude-code' }
              ]
            }
          ],
          UserPromptSubmit: [{ matcher: 'user', hooks: [userHandler] }]
        }
      })
    )
    await writeFile(
      claudeConfigPath,
      JSON.stringify({
        other: true,
        mcpServers: {
          lares: { type: 'http', url: 'http://127.0.0.1:1/v1/mcp' },
          user: { type: 'stdio', command: 'user' }
        }
      })
    )

    expect(await removeClaudeCode(options)).toEqual({ settings: 'updated', mcp: 'updated' })
    expect(JSON.parse(await readFile(settingsPath, 'utf8'))).toEqual({
      env: { KEEP: 'yes' },
      hooks: {
        Stop: [{ matcher: 'mixed', hooks: [userHandler] }],
        UserPromptSubmit: [{ matcher: 'user', hooks: [userHandler] }]
      }
    })
    expect(JSON.parse(await readFile(claudeConfigPath, 'utf8'))).toEqual({
      other: true,
      mcpServers: { user: { type: 'stdio', command: 'user' } }
    })
    expect(await removeClaudeCode(options)).toEqual({ settings: 'unchanged', mcp: 'unchanged' })
  })

  it('does not create files during removal', async () => {
    const { settingsPath, claudeConfigPath, options } = await fixture()

    expect(await removeClaudeCode(options)).toEqual({ settings: 'skipped', mcp: 'skipped' })
    await expect(stat(settingsPath)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(stat(claudeConfigPath)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('quotes app and forwarder paths for both supported command forms', () => {
    expect(claudeCodeCommand('/Applications/Lares App', '/opt/Lares App/forwarder.js', 'darwin')).toBe(
      'LARES_HARNESS_PID=$PPID ELECTRON_RUN_AS_NODE=1 "/Applications/Lares App" "/opt/Lares App/forwarder.js" claude-code'
    )
    expect(
      claudeCodeCommand(
        'C:\\Program Files\\Lares\\Lares.exe',
        'C:\\Program Files\\Lares\\forwarder.js',
        'win32'
      )
    ).toBe(
      'LARES_HARNESS_PID= ELECTRON_RUN_AS_NODE=1 "C:\\\\Program Files\\\\Lares\\\\Lares.exe" "C:\\\\Program Files\\\\Lares\\\\forwarder.js" claude-code'
    )
    expect(claudeCodeCommand('/tmp/$Lares`"\\app', '/tmp/forwarder.js', 'linux')).toBe(
      'LARES_HARNESS_PID=$PPID ELECTRON_RUN_AS_NODE=1 "/tmp/\\$Lares\\`\\"\\\\app" "/tmp/forwarder.js" claude-code'
    )
  })
})
