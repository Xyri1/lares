import { describe, expect, it, vi } from 'vitest'
import { configureAgentIntegrations, manualCommands, type CommandResult } from './integrations'

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

function pluginStatus(command: string, configured: boolean): string {
  if (command === 'claude') return JSON.stringify(configured ? [{ id: 'lares@lares', enabled: true }] : [])
  return JSON.stringify({
    installed: configured ? [{ pluginId: 'lares@lares', installed: true, enabled: true }] : []
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

    const report = await configureAgentIntegrations({ confirm: async () => true, run, home: '/home/test' })
    expect(report.harnesses).toEqual([
      { harness: 'claude', status: 'configured' },
      { harness: 'codex', status: 'configured' }
    ])
    expect(run).toHaveBeenCalledWith('claude', ['plugin', 'marketplace', 'add', 'Xyri1/lares', '--scope', 'user'])
    expect(run).toHaveBeenCalledWith('codex', ['plugin', 'add', 'lares@lares', '--json'])
  })

  it('skips already configured harnesses and reports missing and failed CLIs for manual setup', async () => {
    const run = vi.fn(async (command: string, args: string[]) => {
      if (command === 'claude') return result({ stdout: args.includes('marketplace') ? marketplaceStatus(command, true) : pluginStatus(command, true) })
      if (command === 'codex' && args.includes('marketplace')) return result({ code: 1, stderr: 'authentication required' })
      return result({ code: 1, missing: true })
    })

    const report = await configureAgentIntegrations({ confirm: async () => true, run, home: '/home/test' })
    expect(report.harnesses).toEqual([
      { harness: 'claude', status: 'already-configured' },
      { harness: 'codex', status: 'failed', error: 'authentication required' }
    ])
    expect(run).not.toHaveBeenCalledWith('claude', ['plugin', 'install', 'lares@lares', '--scope', 'user'])
    expect(manualCommands('codex')).toEqual([
      'codex plugin marketplace add Xyri1/lares --json',
      'codex plugin add lares@lares --json'
    ])
  })

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
      home: '/home/test'
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
      home: '/home/test'
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

  it('reports a CLI missing after its known locations are exhausted', async () => {
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
})
