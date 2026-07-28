import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, readFile, readdir, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { removeCodexHooks, syncCodexHooks, type CodexHooksOptions } from './hooks'

const roots: string[] = []
const pluginHooks = JSON.parse(
  await readFile(resolve('plugins/lares/hooks/hooks.json'), 'utf8')
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

function laresHandlers(config: Record<string, any>): Array<Record<string, unknown>> {
  return Object.values(config.hooks ?? {}).flatMap((groups: any) =>
    groups.flatMap((group: any) =>
      group.hooks.filter((handler: any) => handler.command?.includes('lares-forwarder'))
    )
  )
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('Codex hooks writer', () => {
  it('creates the plugin hook set once without a backup or rewrite', async () => {
    const { codexDirectory, hooksPath, options } = await fixture()

    expect(await syncCodexHooks(options)).toBe('updated')
    expect(JSON.parse(await readFile(hooksPath, 'utf8'))).toEqual(pluginHooks)
    await expect(stat(`${hooksPath}.lares-backup`)).rejects.toMatchObject({ code: 'ENOENT' })

    const bytes = await readFile(hooksPath, 'utf8')
    const old = new Date('2020-01-01T00:00:00.000Z')
    await utimes(hooksPath, old, old)
    const mtime = (await stat(hooksPath)).mtimeMs
    expect(await syncCodexHooks(options)).toBe('unchanged')
    expect(await readFile(hooksPath, 'utf8')).toBe(bytes)
    expect((await stat(hooksPath)).mtimeMs).toBe(mtime)
    expect((await readdir(codexDirectory)).some((name) => name.includes('lares-tmp'))).toBe(false)
  })

  it('replaces stale path variants while preserving user hooks and backing up once', async () => {
    const { hooksPath, options } = await fixture()
    const userHandler = { type: 'command', command: 'keep-me' }
    const original = {
      userValue: true,
      hooks: {
        SessionStart: [
          {
            matcher: 'user',
            hooks: [userHandler, { type: 'command', command: 'C:\\old\\lares-forwarder.cmd' }]
          }
        ],
        OldEvent: [{ hooks: [{ type: 'command', command: '/old/bin/lares-forwarder' }] }],
        CustomEvent: [{ hooks: [userHandler] }]
      }
    }
    const originalBytes = `${JSON.stringify(original, null, 4)}\n`
    await writeFile(hooksPath, originalBytes)

    expect(await syncCodexHooks(options)).toBe('updated')
    const written = JSON.parse(await readFile(hooksPath, 'utf8'))
    expect(written.userValue).toBe(true)
    expect(written.hooks.SessionStart[0]).toEqual({ matcher: 'user', hooks: [userHandler] })
    expect(written.hooks.OldEvent).toBeUndefined()
    expect(written.hooks.CustomEvent).toEqual([{ hooks: [userHandler] }])
    expect(laresHandlers(written)).toHaveLength(8)
    expect(await readFile(`${hooksPath}.lares-backup`, 'utf8')).toBe(originalBytes)
  })

  it('aborts malformed configs before writing or backing them up', async () => {
    const { hooksPath, options } = await fixture()
    for (const bytes of ['{ broken', '[]', '{"hooks":"invalid"}', '{"hooks":{"Stop":"invalid"}}']) {
      await writeFile(hooksPath, bytes)
      await expect(syncCodexHooks(options)).rejects.toThrow()
      expect(await readFile(hooksPath, 'utf8')).toBe(bytes)
      await expect(stat(`${hooksPath}.lares-backup`)).rejects.toMatchObject({ code: 'ENOENT' })
    }
  })

  it('skips silently when Codex is not installed', async () => {
    const { codexDirectory, hooksPath, options } = await fixture()
    await rm(codexDirectory, { recursive: true })

    expect(await syncCodexHooks(options)).toBe('skipped')
    await expect(stat(hooksPath)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('removes only Lares hooks and deletes an otherwise empty file', async () => {
    const { hooksPath, options } = await fixture()
    await writeFile(
      hooksPath,
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

    expect(await removeCodexHooks(options)).toBe('updated')
    expect(JSON.parse(await readFile(hooksPath, 'utf8'))).toEqual({
      hooks: { Stop: [{ hooks: [{ type: 'command', command: 'keep-me' }] }] }
    })

    await writeFile(hooksPath, JSON.stringify(pluginHooks))
    expect(await removeCodexHooks(options)).toBe('updated')
    await expect(stat(hooksPath)).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
