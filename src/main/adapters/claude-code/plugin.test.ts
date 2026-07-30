import { describe, expect, it } from 'vitest'
import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve('plugins/claude-code')

async function json(path: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(resolve(root, path), 'utf8')) as Record<string, unknown>
}

describe('Claude Code plugin', () => {
  it('contains the nine supported lifecycle hooks and the fixed MCP endpoint', async () => {
    expect(
      JSON.parse(await readFile(resolve('.claude-plugin/marketplace.json'), 'utf8'))
    ).toEqual({
      name: 'lares',
      description: 'Lares desktop companion integration for Claude Code.',
      owner: { name: 'Lares contributors' },
      plugins: [
        {
          name: 'lares',
          source: {
            source: 'git-subdir',
            url: 'https://github.com/Xyri1/lares',
            path: 'plugins/claude-code'
          },
          description: 'Give Claude Code sessions a local Lares companion.'
        }
      ]
    })
    expect((await readdir(root)).sort()).toEqual([
      '.claude-plugin',
      '.mcp.json',
      'README.md',
      'hooks',
      'skills'
    ])
    expect(await json('.claude-plugin/plugin.json')).toMatchObject({ name: 'lares' })
    expect(await json('.mcp.json')).toEqual({
      mcpServers: { lares: { type: 'http', url: 'http://127.0.0.1:21473/v1/mcp' } }
    })

    const config = await json('hooks/hooks.json')
    const hooks = config.hooks as Record<string, unknown[]>
    expect(Object.keys(hooks)).toEqual([
      'SessionStart',
      'UserPromptSubmit',
      'PreToolUse',
      'PostToolUse',
      'PostToolUseFailure',
      'Notification',
      'Stop',
      'SubagentStart',
      'SubagentStop'
    ])
    for (const [event, groups] of Object.entries(hooks)) {
      expect(groups).toEqual([
        {
          ...(event === 'Notification' ? { matcher: 'permission_prompt' } : {}),
          hooks: [
            {
              type: 'command',
              command: 'LARES_HARNESS_PID=$PPID ~/.lares/bin/lares-forwarder claude-code'
            }
          ]
        }
      ])
    }
  })

  it('ships the emoting skill as emote-only reinforcement', async () => {
    expect(await readdir(resolve(root, 'skills'))).toEqual(['emoting'])
    const skill = await readFile(resolve(root, 'skills/emoting/SKILL.md'), 'utf8')
    expect(skill).toMatch(/^---\nname: emoting\ndescription: >-\n/)
    expect(skill).toContain('Never emote per tool call')
    // D32: calibration is pull-only — the skill must not surface authoring.
    expect(skill).not.toMatch(/list_parameters|preview_expression|save_expression|update_expression|calibrat/i)
  })
})
