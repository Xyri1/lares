import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { writeForwarderShim } from './adapters/shim'
import { Nerves } from './nerves'
import { createServer, type ServerDeps } from './server/server'

const script = resolve('scripts/forwarder.js')
const electron = createRequire(import.meta.url)('electron') as string
const nativeEvent = {
  session_id: 'session-1',
  cwd: 'C:\\repo',
  hook_event_name: 'UserPromptSubmit',
  detail: { source: 'spawn-test' }
}

// 012-D4: approved copy, kept in sync with src/main/hostGuidance.ts (checked
// there) and pinned in sdd/slices/012-host-guidance/SPEC.md §3.
const HOST_GUIDANCE_REMINDER =
  'Lares is active for this session. If `feel` is available and no last reported feel exists for this session, call it once after appraising the current request to establish an initial report. Thereafter, call only when your appraisal meaningfully changes, including mid-task, or the user directly asks how you feel. Reports are absolute; steady work stays silent. Never infer the user’s feelings. Failed calls are silent and not retried.'
const HOST_GUIDANCE_STDOUT = JSON.stringify({
  hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: HOST_GUIDANCE_REMINDER }
})
const sessionStartEvent = { ...nativeEvent, hook_event_name: 'SessionStart' }

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

function runForwarder(
  runtimeFile: string,
  input: string | null,
  timing = false,
  harness: 'claude-code' | 'codex' = 'claude-code'
): Promise<RunResult> {
  return run(
    electron,
    [script, harness],
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

  function server(
    ingested: unknown[],
    checkpoint?: ServerDeps['checkpoint']
  ): ReturnType<typeof createServer> {
    const deps: ServerDeps = {
      ingest: (envelope) => void ingested.push(envelope),
      feel: () => undefined,
      status: () => ({}),
      checkpoint
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
    const nerves = new Nerves('Test', (pid) => pid === process.pid)
    const value = createServer({
      ingest: (envelope, at) => nerves.ingest(envelope, at),
      feel: () => undefined,
      status: () => nerves.status()
    })
    servers.push(value)
    const port = await value.start(0)

    const profile = join(directory, 'Jane Doe')
    const binDir = join(profile, '.lares', 'bin')
    await writeForwarderShim({
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
      await readFile(resolve('plugins/codex/hooks/hooks.json'), 'utf8')
    )
    const handler = hooks.hooks.UserPromptSubmit[0].hooks[0]
    const command = process.platform === 'win32' ? handler.commandWindows : handler.command
    const shell = process.platform === 'win32' ? 'pwsh.exe' : (process.env.SHELL ?? '/bin/sh')
    const args = process.platform === 'win32'
      ? ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(command, 'utf16le').toString('base64')]
      : ['-lc', command]

    const result = await run(
      shell,
      args,
      {
        ...process.env,
        HOME: profile,
        USERPROFILE: profile,
        LARES_HARNESS_PID: ''
      },
      JSON.stringify(nativeEvent),
      false
    )
    nerves.tick(Date.now() + 100)

    expect(result).toMatchObject({ code: 0, stdout: '', stderr: '' })
    expect(nerves.sessionState(Date.now()).sessions).toMatchObject([
      { session_id: nativeEvent.session_id, harness: 'codex', state: 'thinking' }
    ])
  })

  it('survives the real Claude Code shell path — Git Bash on every platform', async () => {
    const ingested: unknown[] = []
    const value = server(ingested)
    const port = await value.start(0)

    const profile = join(directory, 'Jane Doe')
    await writeForwarderShim({
      binDir: join(profile, '.lares', 'bin'),
      appPath: electron,
      forwarderPath: script,
      platform: process.platform
    })
    await writeFile(
      join(profile, '.lares', 'runtime.json'),
      JSON.stringify({ version: 1, port, pid: process.pid })
    )

    const hooks = JSON.parse(
      await readFile(resolve('plugins/claude-code/hooks/hooks.json'), 'utf8')
    )
    const command = hooks.hooks.UserPromptSubmit[0].hooks[0].command
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

  // 013 SPEC §10: the prompt-submit checkpoint is the one response the
  // forwarder waits for, and it is strictly session-keyed.
  it('prints the checkpoint the daemon returns for its own session only', async () => {
    const ingested: unknown[] = []
    const value = server(ingested, (key) =>
      key === 'claude-code:session-1' ? { valence: -1, activation: 2, control: -2 } : undefined
    )
    const port = await value.start(0)
    await writeFile(runtimeFile, JSON.stringify({ version: 1, port, pid: process.pid }))

    const latched = await runForwarder(runtimeFile, JSON.stringify(nativeEvent))
    expect(latched.code).toBe(0)
    expect(JSON.parse(latched.stdout)).toEqual({
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext:
          '[Lares] Last reported feel: valence=-1, activation=2, control=-2. Reassess from here — this is your last report, not a current claim. Call feel only on a meaningful appraisal change or a direct user request; values are absolute.'
      }
    })

    const stranger = await runForwarder(
      runtimeFile,
      JSON.stringify({ ...nativeEvent, session_id: 'session-2' })
    )
    expect(stranger).toMatchObject({ code: 0, stdout: '' })
    expect(ingested).toHaveLength(2)
  })

  it('prints exactly the structured reminder on codex SessionStart when hostGuidance is true', async () => {
    const ingested: unknown[] = []
    const value = server(ingested)
    const port = await value.start(0)
    await writeFile(
      runtimeFile,
      JSON.stringify({ version: 1, port, pid: process.pid, hostGuidance: true })
    )

    const result = await runForwarder(runtimeFile, JSON.stringify(sessionStartEvent), false, 'codex')

    expect(result.code).toBe(0)
    expect(result.stdout).toBe(HOST_GUIDANCE_STDOUT)
    expect(ingested).toHaveLength(1)
  })

  it('stays silent on Claude Code SessionStart even when hostGuidance is true', async () => {
    const port = await server([]).start(0)
    await writeFile(
      runtimeFile,
      JSON.stringify({ version: 1, port, pid: process.pid, hostGuidance: true })
    )

    const result = await runForwarder(
      runtimeFile,
      JSON.stringify(sessionStartEvent),
      false,
      'claude-code'
    )

    expect(result).toMatchObject({ code: 0, stdout: '' })
  })

  it('stays silent on codex UserPromptSubmit even when hostGuidance is true', async () => {
    const port = await server([]).start(0)
    await writeFile(
      runtimeFile,
      JSON.stringify({ version: 1, port, pid: process.pid, hostGuidance: true })
    )

    const result = await runForwarder(runtimeFile, JSON.stringify(nativeEvent), false, 'codex')

    expect(result).toMatchObject({ code: 0, stdout: '' })
  })

  it('stays silent when hostGuidance is false', async () => {
    const port = await server([]).start(0)
    await writeFile(
      runtimeFile,
      JSON.stringify({ version: 1, port, pid: process.pid, hostGuidance: false })
    )

    const result = await runForwarder(runtimeFile, JSON.stringify(sessionStartEvent), false, 'codex')

    expect(result).toMatchObject({ code: 0, stdout: '' })
  })

  it('stays silent when the hostGuidance key is absent', async () => {
    const port = await server([]).start(0)
    await writeFile(runtimeFile, JSON.stringify({ version: 1, port, pid: process.pid }))

    const result = await runForwarder(runtimeFile, JSON.stringify(sessionStartEvent), false, 'codex')

    expect(result).toMatchObject({ code: 0, stdout: '' })
  })

  it('stays silent when runtime.json is invalid, even with hostGuidance true', async () => {
    await writeFile(
      runtimeFile,
      JSON.stringify({ version: 2, port: 1, pid: 1, hostGuidance: true })
    )

    const result = await runForwarder(runtimeFile, JSON.stringify(sessionStartEvent), false, 'codex')

    expect(result).toMatchObject({ code: 0, stdout: '' })
  })

  it('prints the reminder even when the daemon refuses the connection', async () => {
    const first = server([])
    const port = await first.start(0)
    await first.stop()
    await writeFile(
      runtimeFile,
      JSON.stringify({ version: 1, port, pid: process.pid, hostGuidance: true })
    )

    const result = await runForwarder(runtimeFile, JSON.stringify(sessionStartEvent), false, 'codex')

    expect(result.code).toBe(0)
    expect(result.stdout).toBe(HOST_GUIDANCE_STDOUT)
    expect(result.exitMs).toBeLessThan(500)
  })
})
