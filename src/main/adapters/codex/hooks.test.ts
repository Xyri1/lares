import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { removeCodexHooks, type CodexHooksOptions } from './hooks'

const roots: string[] = []
const pluginHooks = JSON.parse(
  await readFile(resolve('plugins/codex/hooks/hooks.json'), 'utf8')
) as Record<string, unknown>

async function fixture(): Promise<{
  codexDirectory: string
  hooksPath: string
  options: CodexHooksOptions
}> {
  const root = await mkdtemp(join(tmpdir(), 'lares-codex-hooks-'))
  roots.push(root)
  const codexDirectory = join(root, '.codex')
  await mkdir(codexDirectory)
  const hooksPath = join(codexDirectory, 'hooks.json')
  return { codexDirectory, hooksPath, options: { codexDirectory, hooksPath } }
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('Codex hooks legacy cleaner', () => {
  it('removes only Lares hooks, keeps a backup, and deletes an otherwise empty file', async () => {
    const { hooksPath, options } = await fixture()
    const originalBytes = JSON.stringify({
      userValue: true,
      hooks: {
        Stop: [
          {
            hooks: [
              { type: 'command', command: '/old/bin/lares-forwarder' },
              { type: 'command', command: 'keep-me' }
            ]
          }
        ],
        OldEvent: [{ hooks: [{ type: 'command', command: 'C:\\old\\lares-forwarder.cmd' }] }]
      }
    })
    await writeFile(hooksPath, originalBytes)

    expect(await removeCodexHooks(options)).toBe('updated')
    expect(JSON.parse(await readFile(hooksPath, 'utf8'))).toEqual({
      userValue: true,
      hooks: { Stop: [{ hooks: [{ type: 'command', command: 'keep-me' }] }] }
    })
    expect(await readFile(`${hooksPath}.lares-backup`, 'utf8')).toBe(originalBytes)
    expect(await removeCodexHooks(options)).toBe('unchanged')

    await writeFile(hooksPath, JSON.stringify(pluginHooks))
    expect(await removeCodexHooks(options)).toBe('updated')
    await expect(stat(hooksPath)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await removeCodexHooks(options)).toBe('skipped')
  })

  it('aborts malformed configs before touching them', async () => {
    const { hooksPath, options } = await fixture()
    for (const bytes of ['{ broken', '[]', '{"hooks":"invalid"}', '{"hooks":{"Stop":"invalid"}}']) {
      await writeFile(hooksPath, bytes)
      await expect(removeCodexHooks(options)).rejects.toThrow()
      expect(await readFile(hooksPath, 'utf8')).toBe(bytes)
    }
  })

  it('skips silently when Codex is not installed', async () => {
    const { codexDirectory, options } = await fixture()
    await rm(codexDirectory, { recursive: true })
    expect(await removeCodexHooks(options)).toBe('skipped')
  })
})
