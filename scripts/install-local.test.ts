import { spawn } from 'node:child_process'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const roots: string[] = []
const script = resolve('scripts/install-local.sh')

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

function run(args: string[], env: NodeJS.ProcessEnv) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((done, reject) => {
    const child = spawn('/bin/sh', [script, ...args], { env })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8').on('data', (chunk) => (stdout += chunk))
    child.stderr.setEncoding('utf8').on('data', (chunk) => (stderr += chunk))
    child.once('error', reject)
    child.once('close', (code) => done({ code, stdout, stderr }))
  })
}

async function executable(path: string, source: string): Promise<void> {
  await writeFile(path, source)
  await chmod(path, 0o755)
}

describe('local macOS installer entry point', () => {
  it('installs and invokes confirmed uninstall through local fixtures with spaces', async () => {
    const root = await mkdtemp(join(tmpdir(), 'lares local install '))
    roots.push(root)
    const tools = join(root, 'fake tools')
    const sourceApp = join(root, 'fixture source', 'Lares.app')
    const appExecutable = join(sourceApp, 'Contents', 'MacOS', 'Lares')
    const applications = join(root, 'Applications with spaces')
    const artifact = join(root, 'Lares fixture.dmg')
    const log = join(root, 'invocations.log')
    await mkdir(tools, { recursive: true })
    await mkdir(join(sourceApp, 'Contents', 'MacOS'), { recursive: true })
    await executable(
      appExecutable,
      '#!/bin/sh\nprintf "app:%s\\n" "$*" >> "$LARES_TEST_LOG"\n'
    )
    await writeFile(artifact, sourceApp)
    await executable(
      join(tools, 'hdiutil'),
      [
        '#!/bin/sh',
        'printf "hdiutil:%s\\n" "$*" >> "$LARES_TEST_LOG"',
        '[ "${LARES_TEST_ATTACH_FAIL:-0}" -eq 0 ] || exit "$LARES_TEST_ATTACH_FAIL"',
        'if [ "$1" = "attach" ]; then cp -R "$(cat "$2")" "$6/Lares.app"; fi',
        'if [ "$1" = "detach" ]; then rm -R "$2/Lares.app"; fi',
        ''
      ].join('\n')
    )
    await executable(
      join(tools, 'ditto'),
      '#!/bin/sh\nprintf "ditto:%s\\n" "$*" >> "$LARES_TEST_LOG"\ncp -R "$1" "$2"\n'
    )
    await executable(
      join(tools, 'open'),
      '#!/bin/sh\nprintf "open:%s\\n" "$*" >> "$LARES_TEST_LOG"\n'
    )
    const env = {
      ...process.env,
      PATH: `${tools}:${process.env.PATH}`,
      LARES_APPLICATIONS_DIR: applications,
      LARES_TEST_LOG: log
    }

    expect(await run(['install', artifact], env)).toMatchObject({ code: 0, stderr: '' })
    expect(await readFile(join(applications, 'Lares.app/Contents/MacOS/Lares'), 'utf8')).toContain(
      'LARES_TEST_LOG'
    )
    expect(await run(['uninstall'], env)).toMatchObject({ code: 0, stderr: '' })
    expect(await readFile(log, 'utf8')).toContain(`app:--uninstall`)
  })

  it('rejects missing artifacts and propagates native failures', async () => {
    const root = await mkdtemp(join(tmpdir(), 'lares-local-failure-'))
    roots.push(root)
    const tools = join(root, 'bin')
    await mkdir(tools)
    await executable(join(tools, 'hdiutil'), '#!/bin/sh\nexit "$LARES_TEST_ATTACH_FAIL"\n')
    const artifact = join(root, 'fixture.dmg')
    await writeFile(artifact, 'unused')
    const env = {
      ...process.env,
      PATH: `${tools}:${process.env.PATH}`,
      LARES_APPLICATIONS_DIR: join(root, 'Applications'),
      LARES_TEST_ATTACH_FAIL: '7'
    }

    expect(await run(['install', join(root, 'missing.dmg')], env)).toMatchObject({ code: 2 })
    expect(await run(['install', artifact], env)).toMatchObject({ code: 7 })
  })

  it('keeps both entry points local-only and leaves one Windows-native fixture check', async () => {
    const shell = await readFile(script, 'utf8')
    const powershell = await readFile(resolve('scripts/install-local.ps1'), 'utf8')
    const windowsCheck = await readFile(resolve('scripts/install-local.windows.test.ps1'), 'utf8')
    for (const source of [shell, powershell, windowsCheck]) {
      expect(source).not.toMatch(/https?:\/\//)
      expect(source).not.toMatch(/github\.com/i)
    }
    expect(powershell).toContain("ValidateSet('install', 'uninstall')")
    expect(windowsCheck).toContain('Programs with spaces')
  })
})
