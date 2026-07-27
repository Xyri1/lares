import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
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

function runForwarder(runtimeFile: string, input: string | null): Promise<RunResult> {
  const started = performance.now()
  const child = spawn(electron, [script, 'claude-code'], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', LARES_RUNTIME_FILE: runtimeFile },
    stdio: ['pipe', 'pipe', 'pipe']
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

  it.todo('exits within the 50ms A8 budget when discovery is absent or refused')

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
})
