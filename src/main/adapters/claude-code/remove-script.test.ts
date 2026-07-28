import { afterEach, describe, expect, it } from 'vitest'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('adapter:remove', () => {
  it('runs the shared removal pass against the selected home directory', async () => {
    const home = await mkdtemp(join(tmpdir(), 'lares-remove-script-'))
    roots.push(home)
    const claudeDirectory = join(home, '.claude')
    await mkdir(claudeDirectory)
    await writeFile(
      join(claudeDirectory, 'settings.json'),
      JSON.stringify({
        hooks: {
          Stop: [
            {
              hooks: [
                { type: 'command', command: '"/old/scripts/forwarder.js" claude-code' },
                { type: 'command', command: 'keep-me' }
              ]
            }
          ]
        }
      })
    )
    await writeFile(
      join(home, '.claude.json'),
      JSON.stringify({ mcpServers: { lares: { type: 'http', url: 'old' }, user: {} } })
    )
    const codexDirectory = join(home, '.codex')
    await mkdir(codexDirectory)
    await writeFile(
      join(codexDirectory, 'hooks.json'),
      JSON.stringify({
        hooks: {
          Stop: [
            {
              hooks: [
                { type: 'command', command: '/old/bin/lares-forwarder' },
                { type: 'command', command: 'keep-me' }
              ]
            }
          ]
        }
      })
    )

    const result = await new Promise<{ code: number | null; stdout: string }>((done, reject) => {
      const child = spawn(
        process.execPath,
        [
          '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON',
          resolve('scripts/remove-adapters.mjs')
        ],
        { env: { ...process.env, HOME: home, USERPROFILE: home } }
      )
      let stdout = ''
      child.stdout.setEncoding('utf8').on('data', (chunk) => (stdout += chunk))
      child.once('error', reject)
      child.once('close', (code) => done({ code, stdout }))
    })

    expect(result).toMatchObject({ code: 0 })
    expect(result.stdout).toContain('hooks=updated, mcp=updated')
    expect(result.stdout).toContain('Codex hooks removal: hooks=updated')
    expect(JSON.parse(await readFile(join(claudeDirectory, 'settings.json'), 'utf8'))).toEqual({
      hooks: { Stop: [{ hooks: [{ type: 'command', command: 'keep-me' }] }] }
    })
    expect(JSON.parse(await readFile(join(home, '.claude.json'), 'utf8'))).toEqual({
      mcpServers: { user: {} }
    })
    expect(JSON.parse(await readFile(join(codexDirectory, 'hooks.json'), 'utf8'))).toEqual({
      hooks: { Stop: [{ hooks: [{ type: 'command', command: 'keep-me' }] }] }
    })
  })
})
