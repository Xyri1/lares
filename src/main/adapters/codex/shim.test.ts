import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeCodexShim } from './shim'

const directories: string[] = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })))
})

async function directory(): Promise<string> {
  const value = await mkdtemp(join(tmpdir(), 'lares-codex-shim-'))
  directories.push(value)
  return value
}

describe('writeCodexShim', () => {
  it('writes an executable POSIX shim that preserves quoted paths', async () => {
    const binDir = await directory()
    const target = await writeCodexShim({
      binDir,
      appPath: "/Applications/Lares Pet's/Lares",
      forwarderPath: "/Applications/Lares Pet's/scripts/forwarder.js",
      platform: 'darwin'
    })

    expect(await readFile(target, 'utf8')).toBe(
      "#!/bin/sh\nELECTRON_RUN_AS_NODE=1 exec '/Applications/Lares Pet'\\''s/Lares' '/Applications/Lares Pet'\\''s/scripts/forwarder.js' codex\n"
    )
    if (process.platform !== 'win32') expect((await stat(target)).mode & 0o111).not.toBe(0)
    expect(await readdir(binDir)).toEqual(['lares-forwarder'])
  })

  it('writes a Windows shim and re-stamps the current app path', async () => {
    const binDir = await directory()
    const options = {
      binDir,
      appPath: 'C:\\Program Files\\Lares %old%\\lares.exe',
      forwarderPath: 'C:\\Program Files\\Lares\\scripts\\forwarder.js',
      platform: 'win32' as const
    }
    const target = await writeCodexShim(options)
    await writeCodexShim({ ...options, appPath: 'D:\\Current Lares\\lares.exe' })

    expect(await readFile(target, 'utf8')).toBe(
      '@echo off\r\nset "LARES_HARNESS_PID="\r\nset "ELECTRON_RUN_AS_NODE=1"\r\n"D:\\Current Lares\\lares.exe" "C:\\Program Files\\Lares\\scripts\\forwarder.js" codex\r\n'
    )
    expect(await readdir(binDir)).toEqual(['lares-forwarder.cmd'])
  })
})
