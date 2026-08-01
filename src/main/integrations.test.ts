import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  configureAgentIntegrations,
  manualCommands,
  runAgentIntegrationCommand,
  type CommandResult
} from './integrations'

function marketplaceStatus(command: string, configured: boolean): string {
  if (command === 'claude') {
    return JSON.stringify(
      configured ? [{ name: 'lares', source: 'github', repo: 'Xyri1/lares' }] : []
    )
  }
  return JSON.stringify({
    marketplaces: configured
      ? [
          {
            name: 'lares',
            marketplaceSource: {
              sourceType: 'git',
              source: 'https://github.com/Xyri1/lares.git'
            }
          }
        ]
      : []
  })
}

function pluginStatus(command: string, configured: boolean, version = '0.2.0'): string {
  if (command === 'claude') {
    return JSON.stringify(configured ? [{ id: 'lares@lares', version, enabled: true }] : [])
  }
  return JSON.stringify({
    installed: configured ? [{ pluginId: 'lares@lares', version, installed: true, enabled: true }] : []
  })
}

function result(overrides: Partial<CommandResult> = {}): CommandResult {
  return { code: 0, stdout: '[]', stderr: '', ...overrides }
}

describe('agent integration configuration', () => {
  it('does nothing until the user confirms', async () => {
    const run = vi.fn()
    await expect(configureAgentIntegrations({ confirm: async () => false, run })).resolves.toEqual({
      confirmed: false,
      harnesses: []
    })
    expect(run).not.toHaveBeenCalled()
  })

  it('installs both detected harnesses with fixed commands and verifies them', async () => {
    const state = new Map<string, { marketplace: boolean; plugin: boolean }>([
      ['claude', { marketplace: false, plugin: false }],
      ['codex', { marketplace: false, plugin: false }]
    ])
    const run = vi.fn(async (command: string, args: string[]) => {
      const current = state.get(command)!
      if (args.includes('marketplace') && args.includes('add')) current.marketplace = true
      if (args.includes('install') || (args.includes('add') && !args.includes('marketplace'))) {
        current.plugin = true
      }
      if (args.includes('list')) {
        return result({
          stdout: args.includes('marketplace')
            ? marketplaceStatus(command, current.marketplace)
            : pluginStatus(command, current.plugin)
        })
      }
      return result()
    })

    const report = await configureAgentIntegrations({
      confirm: async () => true,
      run,
      home: '/home/test',
      codexCommands: ['codex']
    })
    expect(report.harnesses).toEqual([
      { harness: 'claude', status: 'configured' },
      { harness: 'codex', status: 'configured' }
    ])
    expect(run).toHaveBeenCalledWith('claude', ['plugin', 'marketplace', 'add', 'Xyri1/lares', '--scope', 'user'])
    expect(run).toHaveBeenCalledWith('codex', ['plugin', 'add', 'lares@lares', '--json'])
  })

  it('skips configured harnesses and reports missing or failed managers for manual setup', async () => {
    const run = vi.fn(async (command: string, args: string[]) => {
      if (command === 'claude') return result({ stdout: args.includes('marketplace') ? marketplaceStatus(command, true) : pluginStatus(command, true) })
      if (command === 'codex' && args.includes('marketplace')) return result({ code: 1, stderr: 'authentication required' })
      return result({ code: 1, missing: true })
    })

    const report = await configureAgentIntegrations({
      confirm: async () => true,
      run,
      home: '/home/test',
      codexCommands: ['codex']
    })
    expect(report.harnesses).toEqual([
      { harness: 'claude', status: 'already-configured' },
      { harness: 'codex', status: 'failed', error: 'authentication required' }
    ])
    expect(run).not.toHaveBeenCalledWith('claude', ['plugin', 'install', 'lares@lares', '--scope', 'user'])
    expect(manualCommands('codex')).toEqual([
      'codex plugin marketplace add Xyri1/lares --json',
      'codex plugin marketplace upgrade lares --json',
      'codex plugin remove lares@lares --json',
      'codex plugin add lares@lares --json'
    ])
    expect(manualCommands('claude')).toEqual([
      'claude plugin marketplace add Xyri1/lares --scope user',
      'claude plugin install lares@lares --scope user',
      'claude plugin marketplace update lares',
      'claude plugin update lares@lares --scope user'
    ])
  })

  it('leaves an installation newer than the shipped plugin alone', async () => {
    const run = vi.fn(async (command: string, args: string[]) =>
      result({
        stdout: args.includes('marketplace')
          ? marketplaceStatus(command, true)
          : pluginStatus(command, true, '0.3.1')
      })
    )
    const report = await configureAgentIntegrations({
      confirm: async () => true,
      run,
      platform: 'linux',
      home: '/home/test',
      codexCommands: ['codex']
    })
    expect(report.harnesses).toEqual([
      { harness: 'claude', status: 'already-configured' },
      { harness: 'codex', status: 'already-configured' }
    ])
    expect(run.mock.calls.every(([, args]) => args.includes('list'))).toBe(true)
  })

  it('upgrades a stale plugin on both hosts rather than reporting it configured', async () => {
    const versions = new Map([
      ['claude', '0.1.0'],
      ['codex', '0.1.0']
    ])
    const run = vi.fn(async (command: string, args: string[]) => {
      if (args.includes('marketplace') && args.includes('list')) {
        return result({ stdout: marketplaceStatus(command, true) })
      }
      if (args.includes('list')) {
        // `--available` reports what the refreshed marketplace snapshot offers.
        return result({
          stdout: pluginStatus(
            command,
            true,
            args.includes('--available') ? '0.2.0' : versions.get(command)!
          )
        })
      }
      if (!args.includes('marketplace') && (args.includes('update') || args.includes('add'))) {
        versions.set(command, '0.2.0')
      }
      return result()
    })

    const report = await configureAgentIntegrations({
      confirm: async () => true,
      run,
      platform: 'linux',
      home: '/home/test',
      codexCommands: ['codex']
    })
    expect(report.harnesses).toEqual([
      { harness: 'claude', status: 'configured' },
      { harness: 'codex', status: 'configured' }
    ])
    expect(run).toHaveBeenCalledWith('claude', ['plugin', 'marketplace', 'update', 'lares'])
    expect(run).toHaveBeenCalledWith('claude', [
      'plugin',
      'update',
      'lares@lares',
      '--scope',
      'user'
    ])
    expect(run).toHaveBeenCalledWith('codex', [
      'plugin',
      'marketplace',
      'upgrade',
      'lares',
      '--json'
    ])
    expect(run).toHaveBeenCalledWith('codex', ['plugin', 'list', '--available', '--json'])
    expect(run).toHaveBeenCalledWith('codex', ['plugin', 'remove', 'lares@lares', '--json'])
    expect(run).toHaveBeenCalledWith('codex', ['plugin', 'add', 'lares@lares', '--json'])
    // Neither the marketplace nor a fresh install is touched on an upgrade.
    expect(run).not.toHaveBeenCalledWith('claude', [
      'plugin',
      'install',
      'lares@lares',
      '--scope',
      'user'
    ])
    expect(run).not.toHaveBeenCalledWith('claude', [
      'plugin',
      'marketplace',
      'add',
      'Xyri1/lares',
      '--scope',
      'user'
    ])
  })

  it('refuses to touch an installation whose version it cannot read', async () => {
    const run = vi.fn(async (command: string, args: string[]) =>
      result({
        stdout: args.includes('marketplace')
          ? marketplaceStatus(command, true)
          : // Claude Code really does report `unknown` and `latest` here.
            pluginStatus(command, true, command === 'claude' ? 'unknown' : 'latest')
      })
    )
    const report = await configureAgentIntegrations({
      confirm: async () => true,
      run,
      platform: 'linux',
      home: '/home/test',
      codexCommands: ['codex']
    })
    expect(report.harnesses).toEqual([
      { harness: 'claude', status: 'failed', reason: 'verification' },
      { harness: 'codex', status: 'failed', reason: 'verification' }
    ])
    expect(run.mock.calls.every(([, args]) => args.includes('list'))).toBe(true)
  })

  it('fails without upgrading when the marketplace refresh fails', async () => {
    const run = vi.fn(async (command: string, args: string[]) => {
      if (command !== 'claude') return result({ code: 1, missing: true })
      if (args.includes('marketplace') && args.includes('list')) {
        return result({ stdout: marketplaceStatus(command, true) })
      }
      if (args.includes('list')) return result({ stdout: pluginStatus(command, true, '0.1.0') })
      return result({ code: 1, stderr: 'marketplace snapshot is unreachable' })
    })
    const report = await configureAgentIntegrations({
      confirm: async () => true,
      run,
      platform: 'linux',
      home: '/home/test',
      codexCommands: ['codex']
    })
    expect(report.harnesses[0]).toEqual({
      harness: 'claude',
      status: 'failed',
      error: 'marketplace snapshot is unreachable'
    })
    expect(run).not.toHaveBeenCalledWith('claude', [
      'plugin',
      'update',
      'lares@lares',
      '--scope',
      'user'
    ])
  })

  it('does not remove a stale Codex plugin the refreshed marketplace cannot replace', async () => {
    const run = vi.fn(async (command: string, args: string[]) => {
      if (command !== 'codex') return result({ code: 1, missing: true })
      if (args.includes('marketplace') && args.includes('list')) {
        return result({ stdout: marketplaceStatus(command, true) })
      }
      if (args.includes('list')) return result({ stdout: pluginStatus(command, true, '0.1.0') })
      return result()
    })
    const report = await configureAgentIntegrations({
      confirm: async () => true,
      run,
      platform: 'linux',
      home: '/home/test',
      codexCommands: ['codex']
    })
    expect(report.harnesses[1]).toEqual({
      harness: 'codex',
      status: 'failed',
      reason: 'verification'
    })
    expect(run).not.toHaveBeenCalledWith('codex', ['plugin', 'remove', 'lares@lares', '--json'])
  })

  it('never reports configured when an upgrade leaves the plugin stale', async () => {
    const run = vi.fn(async (command: string, args: string[]) => {
      if (command !== 'claude') return result({ code: 1, missing: true })
      if (args.includes('marketplace') && args.includes('list')) {
        return result({ stdout: marketplaceStatus(command, true) })
      }
      if (args.includes('list')) return result({ stdout: pluginStatus(command, true, '0.1.0') })
      return result()
    })
    const report = await configureAgentIntegrations({
      confirm: async () => true,
      run,
      platform: 'linux',
      home: '/home/test',
      codexCommands: ['codex']
    })
    expect(report.harnesses[0]).toEqual({
      harness: 'claude',
      status: 'failed',
      reason: 'verification'
    })
    expect(run).toHaveBeenCalledWith('claude', [
      'plugin',
      'update',
      'lares@lares',
      '--scope',
      'user'
    ])
  })

  it('uses a compatible Codex App manager after an outdated standalone CLI', async () => {
    const run = vi.fn(async (command: string, args: string[]) => {
      if (command === 'claude') return result({ code: 1, missing: true })
      if (command === 'codex-old') {
        return result({ code: 2, stderr: "error: unexpected argument '--json' found" })
      }
      if (command === 'codex-app') {
        return result({
          stdout: args.includes('marketplace')
            ? marketplaceStatus('codex', true)
            : pluginStatus('codex', true)
        })
      }
      return result({ code: 1, missing: true })
    })

    const report = await configureAgentIntegrations({
      confirm: async () => true,
      run,
      home: '/home/test',
      codexCommands: ['codex-old', 'codex-app']
    })

    expect(report.harnesses[1]).toEqual({ harness: 'codex', status: 'already-configured' })
    expect(run).toHaveBeenCalledWith('codex-app', ['plugin', 'list', '--json'])
    expect(run).not.toHaveBeenCalledWith('codex-old', [
      'plugin',
      'marketplace',
      'add',
      'Xyri1/lares',
      '--json'
    ])
  })

  it('skips a Codex manager without automation JSON support', async () => {
    const run = vi.fn(async (command: string, args: string[]) => {
      if (command === 'claude') return result({ code: 1, missing: true })
      if (command === 'codex-human') return result({ stdout: 'PLUGIN STATUS PATH\nlares enabled' })
      if (command === 'codex-json') {
        return result({
          stdout: args.includes('marketplace')
            ? marketplaceStatus('codex', true)
            : pluginStatus('codex', true)
        })
      }
      return result({ code: 1, missing: true })
    })

    const report = await configureAgentIntegrations({
      confirm: async () => true,
      run,
      home: '/home/test',
      codexCommands: ['codex-human', 'codex-json']
    })

    expect(report.harnesses[1]).toEqual({ harness: 'codex', status: 'already-configured' })
    expect(run).not.toHaveBeenCalledWith('codex-human', [
      'plugin',
      'marketplace',
      'add',
      'Xyri1/lares',
      '--json'
    ])
  })

  it('configures Codex through the macOS App when no standalone CLI is installed', async () => {
    const appCommand = '/Applications/ChatGPT.app/Contents/Resources/codex'
    const run = vi.fn(async (command: string, args: string[]) => {
      if (command === appCommand) {
        return result({
          stdout: args.includes('marketplace')
            ? marketplaceStatus('codex', true)
            : pluginStatus('codex', true)
        })
      }
      return result({ code: 1, missing: true })
    })

    const report = await configureAgentIntegrations({
      confirm: async () => true,
      run,
      platform: 'darwin',
      home: '/Users/test'
    })

    expect(report.harnesses[1]).toEqual({ harness: 'codex', status: 'already-configured' })
    expect(run).toHaveBeenCalledWith(appCommand, ['plugin', 'marketplace', 'list', '--json'])
  })

  it('configures Codex through a macOS shell-managed standalone CLI', async () => {
    const shellCommand = '/Users/test/.local/state/fnm/bin/codex'
    vi.stubEnv('SHELL', '/bin/zsh')
    try {
      const run = vi.fn(async (command: string, args: string[]) => {
        if (command === '/bin/zsh') return result({ stdout: `${shellCommand}\n` })
        if (command === shellCommand) {
          return result({
            stdout: args.includes('marketplace')
              ? marketplaceStatus('codex', true)
              : pluginStatus('codex', true)
          })
        }
        return result({ code: 1, missing: true })
      })

      const report = await configureAgentIntegrations({
        confirm: async () => true,
        run,
        platform: 'darwin',
        home: '/Users/test'
      })

      expect(report.harnesses[1]).toEqual({ harness: 'codex', status: 'already-configured' })
      expect(run).toHaveBeenCalledWith('/bin/zsh', ['-lic', 'command -v codex'])
      expect(run).toHaveBeenCalledWith(shellCommand, ['plugin', 'marketplace', 'list', '--json'])
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it.runIf(process.platform === 'win32')(
    'configures Codex through the Windows App when no standalone CLI is installed',
    async () => {
      const localAppData = await mkdtemp(join(tmpdir(), 'lares-codex-app-'))
      const appCommand = join(localAppData, 'OpenAI', 'Codex', 'bin', 'current', 'codex.exe')
      await mkdir(join(appCommand, '..'), { recursive: true })
      await writeFile(appCommand, '')
      vi.stubEnv('LOCALAPPDATA', localAppData)
      try {
        const run = vi.fn(async (command: string, args: string[]) => {
          if (command === appCommand) {
            return result({
              stdout: args.includes('marketplace')
                ? marketplaceStatus('codex', true)
                : pluginStatus('codex', true)
            })
          }
          return result({ code: 1, missing: true })
        })

        const report = await configureAgentIntegrations({
          confirm: async () => true,
          run,
          platform: 'win32',
          home: 'C:\\Users\\test'
        })

        expect(report.harnesses[1]).toEqual({ harness: 'codex', status: 'already-configured' })
        expect(run).toHaveBeenCalledWith(appCommand, [
          'plugin',
          'marketplace',
          'list',
          '--json'
        ])
      } finally {
        vi.unstubAllEnvs()
        await rm(localAppData, { recursive: true, force: true })
      }
    }
  )

  it.runIf(process.platform === 'win32')(
    'configures Codex through a Windows standalone CLI launcher',
    async () => {
      const directory = await mkdtemp(join(tmpdir(), 'lares-codex-cli-'))
      const launcher = join(directory, 'codex.cmd')
      await writeFile(launcher, '')
      vi.stubEnv('LOCALAPPDATA', directory)
      vi.stubEnv('PATH', directory)
      try {
        const run = vi.fn(async (command: string, args: string[]) => {
          if (command === launcher) {
            return result({
              stdout: args.includes('marketplace')
                ? marketplaceStatus('codex', true)
                : pluginStatus('codex', true)
            })
          }
          return result({ code: 1, missing: true })
        })

        const report = await configureAgentIntegrations({
          confirm: async () => true,
          run,
          platform: 'win32',
          home: 'C:\\Users\\test'
        })

        expect(report.harnesses[1]).toEqual({ harness: 'codex', status: 'already-configured' })
        expect(run).toHaveBeenCalledWith(launcher, ['plugin', 'marketplace', 'list', '--json'])
      } finally {
        vi.unstubAllEnvs()
        await rm(directory, { recursive: true, force: true })
      }
    }
  )

  it('does not mistake an unrelated Claude plugin path for the Lares plugin', async () => {
    let installed = false
    const run = vi.fn(async (_command: string, args: string[]) => {
      if (args.includes('marketplace') && args.includes('list')) {
        return result({ stdout: marketplaceStatus('claude', true) })
      }
      if (args.includes('install')) installed = true
      if (args.includes('list')) {
        return result({
          stdout: installed
            ? pluginStatus('claude', true)
            : JSON.stringify([
                {
                  id: 'unrelated@plugin',
                  enabled: true,
                  installPath: '/Users/example/Projects/lares/plugins/unrelated'
                }
              ])
        })
      }
      return result()
    })

    const report = await configureAgentIntegrations({
      confirm: async () => true,
      run,
      platform: 'win32',
      home: '/home/test',
      codexCommands: ['codex']
    })
    expect(report.harnesses[0]).toEqual({ harness: 'claude', status: 'configured' })
    expect(run).toHaveBeenCalledWith('claude', ['plugin', 'install', 'lares@lares', '--scope', 'user'])
  })

  it('does not trust a matching marketplace name from another repository', async () => {
    let added = false
    const run = vi.fn(async (command: string, args: string[]) => {
      if (args.includes('marketplace') && args.includes('add')) added = true
      if (args.includes('marketplace') && args.includes('list')) {
        return result({
          stdout: added
            ? marketplaceStatus(command, true)
            : command === 'claude'
              ? JSON.stringify([{ name: 'lares', source: 'github', repo: 'someone/else' }])
              : JSON.stringify({
                  marketplaces: [
                    {
                      name: 'lares',
                      marketplaceSource: {
                        sourceType: 'git',
                        source: 'https://github.com/someone/else.git'
                      }
                    }
                  ]
                })
        })
      }
      if (args.includes('list')) return result({ stdout: pluginStatus(command, true) })
      return result()
    })

    const report = await configureAgentIntegrations({
      confirm: async () => true,
      run,
      platform: 'win32',
      home: '/home/test',
      codexCommands: ['codex']
    })
    expect(report.harnesses).toEqual([
      { harness: 'claude', status: 'configured' },
      { harness: 'codex', status: 'configured' }
    ])
    expect(run).toHaveBeenCalledWith('claude', [
      'plugin',
      'marketplace',
      'add',
      'Xyri1/lares',
      '--scope',
      'user'
    ])
    expect(run).toHaveBeenCalledWith('codex', [
      'plugin',
      'marketplace',
      'add',
      'Xyri1/lares',
      '--json'
    ])
  })

  it('keeps an exec error when there is no CLI output', async () => {
    const run = vi.fn(async (command: string) => {
      if (command === 'claude') {
        return result({
          code: 1,
          error: 'Command timed out after 60000 milliseconds',
          stdout: '',
          stderr: ''
        })
      }
      return result({ code: 1, missing: true })
    })
    const report = await configureAgentIntegrations({ confirm: async () => true, run, home: '/home/test' })
    expect(report.harnesses[0]).toEqual({
      harness: 'claude',
      status: 'failed',
      error: 'Command timed out after 60000 milliseconds'
    })
  })

  it('captures Codex-sized JSON output without treating it as a command failure', async () => {
    const command =
      'process.stdout.write(JSON.stringify({ installed: [], padding: "x".repeat(70_000) }))'
    const output = await runAgentIntegrationCommand(process.execPath, ['-e', command])

    expect(output.code).toBe(0)
    expect(JSON.parse(output.stdout)).toMatchObject({ installed: [] })
  })

  it('reports a manager missing after its known locations are exhausted', async () => {
    const run = vi.fn(async () => result({ code: 1, missing: true }))
    const report = await configureAgentIntegrations({
      confirm: async () => true,
      run,
      platform: 'linux',
      home: '/home/test'
    })
    expect(report.harnesses).toEqual([
      { harness: 'claude', status: 'missing' },
      { harness: 'codex', status: 'missing' }
    ])
    expect(run).toHaveBeenCalledWith('/usr/local/bin/codex', ['plugin', 'marketplace', 'list', '--json'])
  })

  it.runIf(process.platform === 'win32')('runs fixed Windows CLI launchers', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'lares codex cmd-'))
    const launcher = join(directory, 'codex.cmd')
    await writeFile(launcher, '@echo off\r\necho %*\r\n')
    try {
      await expect(
        runAgentIntegrationCommand(launcher, ['plugin', 'list', '--json'])
      ).resolves.toMatchObject({
        code: 0,
        stdout: 'plugin list --json\r\n'
      })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
