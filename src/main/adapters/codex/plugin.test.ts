import { describe, expect, it } from 'vitest'
import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { PLUGIN_VERSION } from '../../integrations'

const root = resolve('plugins/codex')

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
    expect((await readdir(root)).sort()).toEqual([
      '.codex-plugin',
      '.mcp.json',
      'README.md',
      'assets',
      'hooks',
      'skills'
    ])
    // The marketplace card's only asset. Pinned like skills/ below so the thin
    // plugin (SPEC §6) cannot accumulate payload behind an allowlisted directory.
    expect(await readdir(resolve(root, 'assets'))).toEqual(['logo.png'])
    // PLUGIN_VERSION is what the upgrade comparator trusts; a manifest that
    // drifts from it would report stale installs as already configured.
    expect(await json('.codex-plugin/plugin.json')).toMatchObject({
      name: 'lares',
      version: PLUGIN_VERSION,
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
              commandWindows: '& "$env:USERPROFILE\\.lares\\bin\\lares-forwarder.cmd"'
            }
          ]
        }
      ])
    }
  })

  it('ships the same calibration workflow as Claude Code', async () => {
    expect(await readdir(resolve(root, 'skills'))).toEqual(['calibrate-lar'])
    expect((await readdir(resolve(root, 'skills/calibrate-lar'))).sort()).toEqual([
      'SKILL.md',
      'agents'
    ])
    // Behavioral parity, not byte parity: activation control is host-specific
    // metadata, so only the workflow body has to match (PLAN §7).
    const body = async (plugin: string): Promise<string> =>
      (await readFile(resolve(plugin, 'skills/calibrate-lar/SKILL.md'), 'utf8')).replace(
        /^---\n[\s\S]*?\n---\n/,
        ''
      )
    expect(await body(root)).toBe(await body(resolve('plugins/claude-code')))
  })

  it('exposes Calibrate Lar as an explicit-only skill with its MCP dependency', async () => {
    // Fields per the Codex skill-creator openai.yaml reference.
    const metadata = await readFile(resolve(root, 'skills/calibrate-lar/agents/openai.yaml'), 'utf8')
    expect(metadata).toMatch(/^\s*display_name: "Calibrate Lar"$/m)
    // 011-D15: explicit-only activation is a host contract, not a daemon claim.
    expect(metadata).toMatch(/^\s*allow_implicit_invocation: false$/m)
    expect(metadata).toMatch(/\$lares:calibrate-lar/)
    expect(metadata).toMatch(/type: "mcp"/)
    expect(metadata).toMatch(/value: "lares"/)
    const { lares } = (await json('.mcp.json')) as { lares: { url: string } }
    expect(metadata).toContain(`url: "${lares.url}"`)
  })
})
