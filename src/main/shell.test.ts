import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_CONFIG, type AppConfig } from './config'
import {
  createTrayShell,
  hydrateInitialCharacter,
  type ShellMenuItem,
  type TrayShellDependencies
} from './shell'

const characters = [
  { manifestPath: '/managed/one/lar.character.json', label: 'Hiyori' },
  { manifestPath: '/managed/two/lar.character.json', label: 'Hiyori (2)' }
]

function item(menu: ShellMenuItem[], label: string): ShellMenuItem {
  for (const entry of menu) {
    if (entry.label === label) return entry
    if (entry.submenu) {
      const found = entry.submenu.find((child) => child.label === label)
      if (found) return found
    }
  }
  throw new Error(`Missing menu item ${label}`)
}

function setup(overrides: Partial<TrayShellDependencies> = {}) {
  const config: AppConfig = { ...DEFAULT_CONFIG }
  let login = false
  const daemon = { ticks: 1 }
  const effects: string[] = []
  let menu: ShellMenuItem[] = []
  const deps: TrayShellDependencies = {
    config,
    characters: () => characters,
    activeCharacter: () => characters[0].manifestPath,
    switchCharacter: async (path) => ({ ok: true, manifestPath: path }),
    importCharacter: () => ({ ok: true, manifestPath: '/managed/new/lar.character.json' }),
    discardImportedCharacter: () => {},
    openCharacterFolder: () => effects.push('openFolder'),
    pickImportDirectory: async () => '/external/new',
    setMenu: (next) => {
      menu = next
    },
    persist: async () => {
      effects.push('persist')
    },
    showError: (_title, message) => effects.push(`error:${message}`),
    setOverlayVisible: (visible) => effects.push(`visible:${visible}`),
    setScale: (scale) => effects.push(`scale:${scale}`),
    getLaunchAtLogin: () => login,
    setLaunchAtLogin: (enabled) => {
      login = enabled
      effects.push(`login:${enabled}`)
    },
    resetPosition: () => effects.push('reset'),
    calibrationStatus: () => '🔴 Expressions not mapped',
    canMapExpressions: () => true,
    onMapExpressions: () => {
      effects.push('map')
    },
    onAutomaticUpdatesChanged: (enabled) => {
      effects.push(`automatic:${enabled}`)
    },
    onCheckForUpdates: () => {
      effects.push('check')
    },
    quit: () => effects.push('quit'),
    ...overrides
  }
  const shell = createTrayShell(deps)
  return { config: deps.config, daemon, effects, get menu() { return menu }, shell }
}

describe('tray shell', () => {
  it('hydrates scale, DND, and login and exposes every required native item', () => {
    const config: AppConfig = {
      ...DEFAULT_CONFIG,
      scale: 1.5,
      doNotDisturb: true,
      launchAtLogin: true,
      calibrationArmed: true
    }
    const state = setup({ config })

    expect(state.effects).toEqual(['login:true'])
    expect(item(state.menu, 'Hiyori').checked).toBe(true)
    expect(item(state.menu, 'Hiyori (2)').type).toBe('radio')
    for (const label of ['Import Character…', 'Open Character Folder', '50%', '75%', '100%',
      '125%', '150%', 'Do Not Disturb', 'Launch at Login', 'Reset Position',
      '🔴 Expressions not mapped', 'Map expressions…', 'Automatically Check for Updates',
      'Check for Updates…', 'Quit']) {
      expect(item(state.menu, label)).toBeTruthy()
    }
    expect(item(state.menu, 'Map expressions…').checked).toBe(true)
  })

  it('dispatches scale, DND, login, update preference, reset, integration, and quit effects', async () => {
    const state = setup()

    await item(state.menu, '125%').click!()
    await item(state.menu, 'Do Not Disturb').click!()
    expect(state.daemon.ticks).toBe(1)
    await item(state.menu, 'Launch at Login').click!()
    await item(state.menu, 'Automatically Check for Updates').click!()
    await item(state.menu, 'Reset Position').click!()
    await item(state.menu, 'Map expressions…').click!()
    await item(state.menu, 'Check for Updates…').click!()
    await item(state.menu, 'Open Character Folder').click!()
    await item(state.menu, 'Quit').click!()

    expect(state.config).toMatchObject({
      scale: 1.25,
      doNotDisturb: true,
      launchAtLogin: true,
      automaticallyCheckForUpdates: false
    })
    expect(state.effects).toEqual([
      'login:false',
      'scale:1.25', 'persist',
      'visible:false', 'persist',
      'login:true', 'persist',
      'persist', 'automatic:false', 'reset', 'map', 'check', 'openFolder', 'quit'
    ])
  })

  it('persists active selection only after a successful renderer switch', async () => {
    const switchCharacter = vi.fn()
      .mockResolvedValueOnce({ ok: false, error: 'renderer refused model' })
      .mockResolvedValueOnce({ ok: true, manifestPath: characters[1].manifestPath })
    const state = setup({ switchCharacter })

    await item(state.menu, 'Hiyori (2)').click!()
    expect(state.config.activeCharacter).toBeUndefined()
    expect(state.effects).toContain('error:renderer refused model')

    await item(state.menu, 'Hiyori (2)').click!()
    expect(state.config.activeCharacter).toBe(characters[1].manifestPath)
    expect(state.effects.filter((effect) => effect === 'persist')).toHaveLength(1)
  })

  it('imports through the picker, keeps failure selected state, and activates success', async () => {
    const importCharacter = vi.fn()
      .mockReturnValueOnce({ ok: false, error: 'two models found' })
      .mockReturnValue({ ok: true, manifestPath: '/managed/new/lar.character.json' })
    const discardImportedCharacter = vi.fn()
    const switchCharacter = vi.fn()
      .mockResolvedValueOnce({ ok: false, error: 'body load failed' })
      .mockResolvedValueOnce({ ok: true, manifestPath: '/managed/new/lar.character.json' })
    const state = setup({ importCharacter, discardImportedCharacter, switchCharacter })

    await item(state.menu, 'Import Character…').click!()
    await item(state.menu, 'Import Character…').click!()
    expect(state.config.activeCharacter).toBeUndefined()
    expect(discardImportedCharacter).toHaveBeenCalledWith('/managed/new/lar.character.json')
    await item(state.menu, 'Import Character…').click!()

    expect(importCharacter).toHaveBeenCalledWith('/external/new')
    expect(state.config.activeCharacter).toBe('/managed/new/lar.character.json')
    expect(state.effects).toContain('error:two models found')
    expect(state.effects).toContain('error:body load failed')
  })

  it('keeps unavailable later-task actions disabled while retaining typed callbacks', () => {
    const state = setup({
      onMapExpressions: undefined,
      onCheckForUpdates: undefined
    })
    expect(item(state.menu, 'Map expressions…').enabled).toBe(false)
    expect(item(state.menu, 'Check for Updates…').enabled).toBe(false)
  })

  it('recomputes calibration status after mapping and disables completed packages', async () => {
    let complete = false
    const state = setup({
      calibrationStatus: () => (complete ? 'Expressions mapped' : '🟡 1 expression left'),
      canMapExpressions: () => !complete,
      onMapExpressions: () => {
        complete = true
      }
    })

    expect(item(state.menu, '🟡 1 expression left')).toBeTruthy()
    await item(state.menu, 'Map expressions…').click!()
    expect(item(state.menu, 'Expressions mapped')).toBeTruthy()
    expect(item(state.menu, 'Map expressions…').enabled).toBe(false)
  })

  it('shows rejected switch and picker failures instead of leaking menu promises', async () => {
    const switchState = setup({
      switchCharacter: async () => {
        throw new Error('switch IPC failed')
      }
    })
    await item(switchState.menu, 'Hiyori (2)').click!()
    expect(switchState.effects).toContain('error:switch IPC failed')

    const importState = setup({
      pickImportDirectory: async () => {
        throw new Error('picker failed')
      }
    })
    await item(importState.menu, 'Import Character…').click!()
    expect(importState.effects).toContain('error:picker failed')
  })
})

describe('startup character hydration', () => {
  it('restores only a still-managed configured package and otherwise falls back without persistence', () => {
    const valid = { ...DEFAULT_CONFIG, activeCharacter: characters[1].manifestPath }
    expect(hydrateInitialCharacter(characters, valid)).toEqual(characters[1])
    expect(valid.activeCharacter).toBe(characters[1].manifestPath)

    const stale = { ...DEFAULT_CONFIG, activeCharacter: '/missing/lar.character.json' }
    expect(hydrateInitialCharacter(characters, stale)).toEqual(characters[0])
    expect(stale.activeCharacter).toBeUndefined()

    expect(hydrateInitialCharacter(characters, { ...DEFAULT_CONFIG })).toEqual(characters[0])
  })
})
