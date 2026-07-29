import { describe, expect, it, vi } from 'vitest'
import {
  macBundlePath,
  runMacUninstall,
  runWindowsUninstall,
  validatedUserDataPath,
  windowsUninstallerPath
} from './uninstall'

describe('uninstall path safety', () => {
  it('accepts only the direct Lares child of appData', () => {
    expect(validatedUserDataPath('/Users/test/Library/Application Support/Lares',
      '/Users/test/Library/Application Support')).toBe(
      '/Users/test/Library/Application Support/Lares'
    )
    expect(() => validatedUserDataPath('/Users/test', '/Users/test')).toThrow('userData')
    expect(() => validatedUserDataPath('/Users/test/Projects/lares',
      '/Users/test/Library/Application Support')).toThrow('userData')
  })

  it('resolves only packaged platform-owned removal targets', () => {
    expect(
      macBundlePath('/Applications/Lares.app/Contents/MacOS/Lares', true, 'darwin')
    ).toBe('/Applications/Lares.app')
    expect(() => macBundlePath('/repo/node_modules/electron', false, 'darwin')).toThrow('packaged')
    expect(() =>
      macBundlePath('/repo/dist/Lares.app/Contents/MacOS/Lares', true, 'darwin')
    ).toThrow('Applications')

    expect(
      windowsUninstallerPath('C:\\Program Files\\Lares\\Lares.exe', true, 'win32')
    ).toBe('C:\\Program Files\\Lares\\Uninstall Lares.exe')
    expect(() => windowsUninstallerPath('/Applications/Lares.app', true, 'darwin')).toThrow(
      'Windows'
    )
  })
})

describe('supported uninstall flows', () => {
  it('cleans integrations before optional data and app removal on macOS', async () => {
    const events: string[] = []
    const common = {
      execPath: '/Applications/Lares.app/Contents/MacOS/Lares',
      packaged: true,
      platform: 'darwin' as const,
      userData: '/Users/test/Library/Application Support/Lares',
      appData: '/Users/test/Library/Application Support',
      cleanup: async () => {
        events.push('cleanup')
      },
      removeData: async () => {
        events.push('data')
      },
      trash: async () => {
        events.push('trash')
      },
      quit: () => {
        events.push('quit')
      }
    }

    await runMacUninstall({ ...common, deleteData: false })
    expect(events).toEqual(['cleanup', 'trash', 'quit'])

    events.length = 0
    await runMacUninstall({ ...common, deleteData: true })
    expect(events).toEqual(['cleanup', 'data', 'trash', 'quit'])
  })

  it('refuses dev macOS removal and cleans before launching the Windows uninstaller', async () => {
    const trash = vi.fn()
    await expect(
      runMacUninstall({
        execPath: '/repo/node_modules/electron',
        packaged: false,
        platform: 'darwin',
        userData: '/Users/test/Library/Application Support/Lares',
        appData: '/Users/test/Library/Application Support',
        deleteData: false,
        cleanup: vi.fn(),
        removeData: vi.fn(),
        trash,
        quit: vi.fn()
      })
    ).rejects.toThrow('packaged')
    expect(trash).not.toHaveBeenCalled()

    const events: string[] = []
    await runWindowsUninstall({
      execPath: 'C:\\Program Files\\Lares\\Lares.exe',
      packaged: true,
      platform: 'win32',
      exists: () => true,
      cleanup: async () => {
        events.push('cleanup')
      },
      launch: async (path) => {
        events.push(`launch:${path}`)
        return ''
      },
      quit: () => {
        events.push('quit')
      }
    })
    expect(events).toEqual([
      'cleanup',
      'launch:C:\\Program Files\\Lares\\Uninstall Lares.exe',
      'quit'
    ])

    events.length = 0
    await expect(
      runWindowsUninstall({
        execPath: 'C:\\portable\\Lares.exe',
        packaged: true,
        platform: 'win32',
        exists: () => false,
        cleanup: async () => {
          events.push('cleanup')
        },
        launch: async () => '',
        quit: vi.fn()
      })
    ).rejects.toThrow('not found')
    expect(events).toEqual([])
  })
})
