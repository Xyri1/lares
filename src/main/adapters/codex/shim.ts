import { randomUUID } from 'node:crypto'
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface CodexShimOptions {
  binDir: string
  appPath: string
  forwarderPath: string
  platform: NodeJS.Platform
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`
}

function cmdQuote(value: string): string {
  return `"${value.replaceAll('%', '%%').replaceAll('"', '""')}"`
}

export async function writeCodexShim(options: CodexShimOptions): Promise<string> {
  const windows = options.platform === 'win32'
  const target = join(options.binDir, windows ? 'lares-forwarder.cmd' : 'lares-forwarder')
  const content = windows
    ? [
        '@echo off',
        'set "LARES_HARNESS_PID="',
        'set "ELECTRON_RUN_AS_NODE=1"',
        `${cmdQuote(options.appPath)} ${cmdQuote(options.forwarderPath)} codex`,
        ''
      ].join('\r\n')
    : [
        '#!/bin/sh',
        `ELECTRON_RUN_AS_NODE=1 exec ${shellQuote(options.appPath)} ${shellQuote(options.forwarderPath)} codex`,
        ''
      ].join('\n')

  await mkdir(options.binDir, { recursive: true })
  const temporary = `${target}.${randomUUID()}.tmp`
  try {
    await writeFile(temporary, content, { mode: windows ? undefined : 0o755 })
    await rename(temporary, target)
  } finally {
    await rm(temporary, { force: true })
  }
  return target
}
