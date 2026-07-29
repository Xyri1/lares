import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { removeClaudeCode, type ClaudeCodePaths } from './writer'

const roots: string[] = []

async function fixture(): Promise<{
  settingsPath: string
  claudeConfigPath: string
  options: ClaudeCodePaths & { log: (message: string) => void }
}> {
  const root = await mkdtemp(join(tmpdir(), 'lares-claude-code-'))
  roots.push(root)
  const claudeDirectory = join(root, '.claude')
  await mkdir(claudeDirectory)
  const settingsPath = join(claudeDirectory, 'settings.json')
  const claudeConfigPath = join(root, '.claude.json')
  return {
    settingsPath,
    claudeConfigPath,
    options: { claudeDirectory, settingsPath, claudeConfigPath, log: () => undefined }
  }
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('Claude Code legacy cleaner', () => {
  it('removes only recognized hooks and mcpServers.lares, keeping a backup', async () => {
    const { settingsPath, claudeConfigPath, options } = await fixture()
    const userHandler = { type: 'command', command: 'user-forwarder.js-helper' }
    const originalSettings = JSON.stringify({
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
        CustomEvent: [
          { hooks: [{ type: 'command', command: '"D:\\stale\\forwarder.js" claude-code' }] }
        ],
        UserPromptSubmit: [{ matcher: 'user', hooks: [userHandler] }]
      }
    })
    await writeFile(settingsPath, originalSettings)
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
    expect(await readFile(`${settingsPath}.lares-backup`, 'utf8')).toBe(originalSettings)
    expect(await removeClaudeCode(options)).toEqual({ settings: 'unchanged', mcp: 'unchanged' })
  })

  it('does not create files during removal', async () => {
    const { settingsPath, claudeConfigPath, options } = await fixture()

    expect(await removeClaudeCode(options)).toEqual({ settings: 'skipped', mcp: 'skipped' })
    await expect(stat(settingsPath)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(stat(claudeConfigPath)).rejects.toMatchObject({ code: 'ENOENT' })

    const missing = { ...options, claudeDirectory: join(options.claudeDirectory, 'missing') }
    expect(await removeClaudeCode(missing)).toEqual({ settings: 'skipped', mcp: 'skipped' })
  })

  it('leaves invalid JSON untouched', async () => {
    const { settingsPath, claudeConfigPath, options } = await fixture()
    await writeFile(settingsPath, '{ broken settings')
    await expect(removeClaudeCode(options)).rejects.toThrow(`Invalid JSON in ${settingsPath}`)
    expect(await readFile(settingsPath, 'utf8')).toBe('{ broken settings')

    await writeFile(settingsPath, '{}')
    await writeFile(claudeConfigPath, '{ broken config')
    const messages: string[] = []
    expect(
      await removeClaudeCode({ ...options, log: (message) => messages.push(message) })
    ).toEqual({ settings: 'unchanged', mcp: 'skipped' })
    expect(await readFile(claudeConfigPath, 'utf8')).toBe('{ broken config')
    expect(messages).toEqual([`Invalid JSON in ${claudeConfigPath}`])
    await expect(stat(`${claudeConfigPath}.lares-backup`)).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
