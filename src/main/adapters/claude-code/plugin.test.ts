import { describe, expect, it } from 'vitest'
import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { PLUGIN_VERSION } from '../../integrations'

const root = resolve('plugins/claude-code')

async function json(path: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(resolve(root, path), 'utf8')) as Record<string, unknown>
}

describe('Claude Code plugin', () => {
  it('contains the six heartbeat hooks and the fixed MCP endpoint', async () => {
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
    // 011-D13: the v2 cue contract makes an older plugin genuinely incompatible.
    // PLUGIN_VERSION is what the upgrade comparator trusts; a manifest that
    // drifts from it would report stale installs as already configured.
    expect(await json('.claude-plugin/plugin.json')).toMatchObject({
      name: 'lares',
      version: PLUGIN_VERSION
    })
    expect(await json('.mcp.json')).toEqual({
      mcpServers: { lares: { type: 'http', url: 'http://127.0.0.1:21473/v1/mcp' } }
    })

    const config = await json('hooks/hooks.json')
    const hooks = config.hooks as Record<string, unknown[]>
    expect(Object.keys(hooks)).toEqual([
      'UserPromptSubmit',
      'PreToolUse',
      'PostToolUse',
      'PostToolUseFailure',
      'Notification',
      'Stop'
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

  it('ships calibrate-lar as the only skill, invocable by the user alone', async () => {
    // 011-D6: everyday emoting guidance moved to the MCP server instructions.
    expect(await readdir(resolve(root, 'skills'))).toEqual(['calibrate-lar'])
    const skill = await readFile(resolve(root, 'skills/calibrate-lar/SKILL.md'), 'utf8')
    const [, frontmatter = ''] = /^---\n([\s\S]*?)\n---\n/.exec(skill) ?? []
    expect(frontmatter).toContain('name: calibrate-lar')
    expect(frontmatter).toContain('disable-model-invocation: true')
    // The description must not read as an ordinary "react to this" request.
    expect(frontmatter).toMatch(/calibrate|map/i)
    expect(frontmatter).not.toMatch(/emoting|emotional arc|how it feels|meaningful beat/i)
    expect(skill).toMatch(/\blares\b.*MCP server/)
    expect(skill).not.toMatch(/list_cues/)
  })

  it('encodes the load-bearing calibration workflow steps', async () => {
    const skill = await readFile(resolve(root, 'skills/calibrate-lar/SKILL.md'), 'utf8')
    const step = (pattern: RegExp): number => {
      const index = skill.search(pattern)
      expect(index, String(pattern)).toBeGreaterThan(-1)
      return index
    }
    // SPEC §6 step 1: the protocol check gates every other tool call.
    const status = step(/Call `status` first/)
    expect(status).toBeLessThan(step(/`list_performances`/))
    expect(skill).toMatch(/protocol_version` is not `2`/)
    expect(skill).toMatch(/No `active_character`/)
    expect(skill).toMatch(/`missing_cues` is empty/)
    // Steps 3–5: preserve, judge categories, preview what is opaque, reuse.
    expect(skill).toMatch(/Keep them|preserv/i)
    expect(skill).toMatch(/never ask the user for a number/i)
    expect(skill).toMatch(/keep the Lar visible/i)
    expect(skill).toMatch(/motion.*plays once|plays once.*motion/is)
    expect(skill).toMatch(/Warn the user/i)
    expect(skill).toMatch(/Reuse one performance for several cues/i)
    expect(skill).toMatch(/save_expression[^.]*only after the user accepts/is)
    // Step 7: completion is the daemon's answer, not a count of names sent.
    expect(skill).toMatch(/never inferred from the names/i)
    // 011-D8: the skill orchestrates, the daemon validates and writes.
    expect(skill).toMatch(/[Nn]ever edit a character\s+manifest/)
    expect(skill).not.toMatch(/\.json|manifest\.json|Write|Bash\(/)
  })
})
