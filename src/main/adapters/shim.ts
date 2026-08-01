import { randomUUID } from 'node:crypto'
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface ForwarderShimOptions {
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

async function writeExecutable(target: string, content: string, mode?: number): Promise<void> {
  const temporary = `${target}.${randomUUID()}.tmp`
  try {
    await writeFile(temporary, content, { mode })
    await rename(temporary, target)
  } finally {
    await rm(temporary, { force: true })
  }
}

export async function writeForwarderShim(options: ForwarderShimOptions): Promise<void> {
  const windows = options.platform === 'win32'
  await mkdir(options.binDir, { recursive: true })

  // The sh shim serves POSIX hook commands on every platform: Claude Code
  // runs hook commands through Git Bash even on Windows. The harness name
  // arrives as $1; plain Codex hook entries pass none, so codex is the
  // default. The Windows variant clears LARES_HARNESS_PID instead of
  // passing it through: Git Bash reports MSYS pids, not Windows pids, and
  // 005-D9 wants truthful-or-absent.
  const pid = windows ? 'LARES_HARNESS_PID= ' : ''
  const app = shellQuote(options.appPath)
  const forwarder = shellQuote(options.forwarderPath)
  await writeExecutable(
    join(options.binDir, 'lares-forwarder'),
    `#!/bin/sh\n${pid}ELECTRON_RUN_AS_NODE=1 exec ${app} ${forwarder} "\${1:-codex}"\n`,
    windows ? undefined : 0o755
  )

  // Codex's Windows PowerShell command invokes this .cmd alongside the sh shim.
  if (windows) {
    await writeExecutable(
      join(options.binDir, 'lares-forwarder.cmd'),
      [
        '@echo off',
        'set "LARES_HARNESS_PID="',
        'set "ELECTRON_RUN_AS_NODE=1"',
        `${cmdQuote(options.appPath)} ${cmdQuote(options.forwarderPath)} codex`,
        ''
      ].join('\r\n')
    )
  }
}
