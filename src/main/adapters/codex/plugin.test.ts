import { describe, expect, it } from 'vitest'
import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve('plugins/lares')

async function json(path: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(resolve(root, path), 'utf8')) as Record<string, unknown>
}

describe('Codex plugin', () => {
  it('contains only the eight supported lifecycle hooks and the fixed MCP endpoint', async () => {
    expect(
      JSON.parse(await readFile(resolve('.agents/plugins/marketplace.json'), 'utf8'))
    ).toEqual({
      name: 'lares',
      interface: { displayName: 'Lares' },
      plugins: [
        {
          name: 'lares',
          source: { source: 'local', path: './plugins/lares' },
          policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
          category: 'Productivity'
        }
      ]
    })
    expect((await readdir(root)).sort()).toEqual([
      '.codex-plugin',
      '.mcp.json',
      'README.md',
      'hooks'
    ])
    expect(await json('.codex-plugin/plugin.json')).toMatchObject({
      name: 'lares',
      mcpServers: './.mcp.json'
    })
    expect(await json('.mcp.json')).toEqual({
      lares: { url: 'http://127.0.0.1:21473/v1/mcp' }
    })

    const config = await json('hooks/hooks.json')
    const hooks = config.hooks as Record<string, unknown[]>
    expect(Object.keys(hooks)).toEqual([
      'SessionStart',
      'UserPromptSubmit',
      'PreToolUse',
      'PostToolUse',
      'PermissionRequest',
      'Stop',
      'SubagentStart',
      'SubagentStop'
    ])
    for (const groups of Object.values(hooks)) {
      expect(groups).toEqual([
        {
          hooks: [
            {
              type: 'command',
              command: 'LARES_HARNESS_PID=$PPID ~/.lares/bin/lares-forwarder',
              commandWindows: 'call "%USERPROFILE%\\.lares\\bin\\lares-forwarder.cmd"'
            }
          ]
        }
      ])
    }
  })
})
