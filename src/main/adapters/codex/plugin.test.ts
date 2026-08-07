import { describe, expect, it } from 'vitest'
import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve('plugins/codex')

async function json(path: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(resolve(root, path), 'utf8')) as Record<string, unknown>
}

describe('Codex plugin', () => {
  it('contains only the six heartbeat hooks and the fixed MCP endpoint', async () => {
    expect(
      JSON.parse(await readFile(resolve('.agents/plugins/marketplace.json'), 'utf8'))
    ).toEqual({
      name: 'lares',
      interface: { displayName: 'Lares' },
      plugins: [
        {
          name: 'lares',
          source: {
            source: 'git-subdir',
            url: 'https://github.com/Xyri1/lares',
            path: 'plugins/codex'
          },
          policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
          category: 'Productivity'
        }
      ]
    })
    // 013-D6: calibrate-lar retired with the cue tools it drove, so the plugin
    // is hooks, assets and the MCP entry and nothing else.
    expect((await readdir(root)).sort()).toEqual([
      '.codex-plugin',
      '.mcp.json',
      'README.md',
      'assets',
      'hooks'
    ])
    // The marketplace card's only asset. Pinned so the thin plugin (SPEC §6)
    // cannot accumulate payload behind an allowlisted directory.
    expect(await readdir(resolve(root, 'assets'))).toEqual(['logo.png'])
    expect(await json('.codex-plugin/plugin.json')).toMatchObject({
      name: 'lares',
      version: '0.1.0',
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
      'Stop'
    ])
    for (const groups of Object.values(hooks)) {
      expect(groups).toEqual([
        {
          hooks: [
            {
              type: 'command',
              command: 'LARES_HARNESS_PID=$PPID ~/.lares/bin/lares-forwarder',
              commandWindows: '& "$env:USERPROFILE\\.lares\\bin\\lares-forwarder.cmd"'
            }
          ]
        }
      ])
    }
  })
})
