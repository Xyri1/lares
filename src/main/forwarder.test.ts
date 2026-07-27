import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { claudeCodeCommand } from './adapters/claude-code/writer'
import { writeCodexShim } from './adapters/codex/shim'
import { Nerves } from './nerves'
import { createServer, type ServerDeps } from './server/server'

const script = resolve('scripts/forwarder.js')
const electron = createRequire(import.meta.url)('electron') as string
const nativeEvent = {
  session_id: 'session-1',
  cwd: 'C:\\repo',
  hook_event_name: 'SessionStart',
  detail: { source: 'spawn-test' }
}

interface RunResult {
  code: number | null
  stdout: string
  stderr: string
  exitMs: number
}

function run(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  input: string | null,
  windowsVerbatimArguments = false
): Promise<RunResult> {
  const started = performance.now()
  const child = spawn(command, args, {
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsVerbatimArguments
  })
  let stdout = ''
  let stderr = ''
  child.stdout.setEncoding('utf8').on('data', (chunk) => (stdout += chunk))
  child.stderr.setEncoding('utf8').on('data', (chunk) => (stderr += chunk))
  if (input !== null) child.stdin.end(input)

  return new Promise((resolveRun, reject) => {
    let exitMs = Infinity
    const timeout = setTimeout(() => {
      child.kill()
      reject(new Error('forwarder did not exit'))
    }, 2_000)
    child.once('error', reject)
    child.once('exit', () => {
      exitMs = performance.now() - started
    })
    child.once('close', (code) => {
      clearTimeout(timeout)
      resolveRun({ code, stdout, stderr, exitMs })
    })
  })
}

function runForwarder(runtimeFile: string, input: string | null, timing = false): Promise<RunResult> {
  return run(
    electron,
    [script, 'claude-code'],
    {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      LARES_HARNESS_PID: String(process.pid),
      LARES_RUNTIME_FILE: runtimeFile,
      ...(timing ? { LARES_FORWARDER_TIMING: '1' } : {})
    },
    input
  )
}

describe('embedded-Node forwarder', () => {
  const servers: Array<ReturnType<typeof createServer>> = []
  let directory: string
  let runtimeFile: string

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'lares-forwarder-'))
    runtimeFile = join(directory, 'runtime.json')
  })

  afterEach(async () => {
    await Promise.allSettled(servers.splice(0).map((server) => server.stop()))
    await rm(directory, { recursive: true, force: true })
  })

  function server(ingested: unknown[]): ReturnType<typeof createServer> {
    const deps: ServerDeps = {
      ingest: (envelope) => void ingested.push(envelope),
      emote: () => undefined,
      listCues: () => [],
      status: () => ({})
    }
    const value = createServer(deps)
    servers.push(value)
    return value
  }

  it('exits within the 50ms A8 budget (in-script, 004-D8) when discovery is absent', async () => {
    const result = await runForwarder(runtimeFile, null, true)

    expect(result.code).toBe(0)
    expect(result.stdout).toBe('')
    expect(result.stderr).toMatch(/^\d+$/)
    expect(Number(result.stderr)).toBeLessThan(50)
  })

  it('exits silently within the hard 500ms budget when discovery is absent', async () => {
    const result = await runForwarder(runtimeFile, null)

    expect(result).toMatchObject({ code: 0, stdout: '', stderr: '' })
    expect(result.exitMs).toBeLessThan(500)
  })

  it('degrades within the hard budget, then forwards after the daemon returns', async () => {
    const first = server([])
    const port = await first.start(0)
    await first.stop()
    await writeFile(runtimeFile, JSON.stringify({ version: 1, port, pid: process.pid }))

    const refused = await runForwarder(runtimeFile, JSON.stringify(nativeEvent))
    expect(refused).toMatchObject({ code: 0, stdout: '', stderr: '' })
    expect(refused.exitMs).toBeLessThan(500)

    const ingested: unknown[] = []
    const restarted = server(ingested)
    await restarted.start(port)
    const delivered = await runForwarder(runtimeFile, JSON.stringify(nativeEvent))

    expect(delivered).toMatchObject({ code: 0, stdout: '', stderr: '' })
    expect(delivered.exitMs).toBeLessThan(500)
    expect(ingested).toEqual([
      {
        v: 1,
        harness: 'claude-code',
        session_id: nativeEvent.session_id,
        cwd: nativeEvent.cwd,
        pid: process.pid,
        event: nativeEvent
      }
    ])
    expect(process.pid).toBeGreaterThan(0)
  })

  it('survives the real plugin shell path, including a spaced Windows profile', async () => {
    const nowMs = Date.now()
    const nerves = new Nerves('Test', { pleased: { valence: 0.2, arousal: 0.1 } }, nowMs, (pid) =>
      pid === process.pid
    )
    const value = createServer({
      ingest: (envelope, at) => nerves.ingest(envelope, at),
      emote: () => undefined,
      listCues: () => [],
      status: (at) => nerves.status(at)
    })
    servers.push(value)
    const port = await value.start(0)

    const profile = join(directory, 'Jane Doe')
    const binDir = join(profile, '.lares', 'bin')
    await writeCodexShim({
      binDir,
      appPath: electron,
      forwarderPath: script,
      platform: process.platform
    })
    await writeFile(
      join(profile, '.lares', 'runtime.json'),
      JSON.stringify({ version: 1, port, pid: process.pid })
    )
    const hooks = JSON.parse(
      await readFile(resolve('plugins/lares/hooks/hooks.json'), 'utf8')
    )
    const handler = hooks.hooks.SessionStart[0].hooks[0]
    const command = process.platform === 'win32' ? handler.commandWindows : handler.command
    const shell = process.platform === 'win32' ? (process.env.ComSpec ?? 'cmd.exe') : (process.env.SHELL ?? '/bin/sh')
    const args = process.platform === 'win32' ? ['/d', '/s', '/c', command] : ['-lc', command]

    const result = await run(
      shell,
      args,
      {
        ...process.env,
        HOME: profile,
        USERPROFILE: profile,
        LARES_HARNESS_PID: ''
      },
      JSON.stringify({ ...nativeEvent, hook_event_name: 'SessionStart' }),
      process.platform === 'win32'
    )
    nerves.tick(Date.now() + 100)

    expect(result).toMatchObject({ code: 0, stdout: '', stderr: '' })
    expect(nerves.status(Date.now()).sessions.sessions).toMatchObject([
      { session_id: nativeEvent.session_id, harness: 'codex', state: 'thinking' }
    ])
  })

  it('survives the real Claude Code shell path — Git Bash on every platform', async () => {
    const ingested: unknown[] = []
    const value = server(ingested)
    const port = await value.start(0)

    const profile = join(directory, 'Jane Doe')
    await mkdir(join(profile, '.lares'), { recursive: true })
    await writeFile(
      join(profile, '.lares', 'runtime.json'),
      JSON.stringify({ version: 1, port, pid: process.pid })
    )

    const command = claudeCodeCommand(electron, script, process.platform)
    // Claude Code uses Git Bash on Windows — never System32's WSL bash.
    const shell =
      process.platform === 'win32'
        ? (process.env.CLAUDE_CODE_GIT_BASH_PATH ?? 'C:\\Program Files\\Git\\usr\\bin\\bash.exe')
        : (process.env.SHELL ?? '/bin/sh')
    const result = await run(
      shell,
      ['-c', command],
      { ...process.env, HOME: profile, USERPROFILE: profile },
      JSON.stringify(nativeEvent)
    )

    expect(result).toMatchObject({ code: 0, stdout: '', stderr: '' })
    expect(ingested).toMatchObject([
      { v: 1, harness: 'claude-code', session_id: nativeEvent.session_id, event: nativeEvent }
    ])
    const envelope = ingested[0] as { pid?: number }
    if (process.platform === 'win32') expect(envelope.pid).toBeUndefined()
    else expect(envelope.pid).toBe(process.pid)
  })
})
