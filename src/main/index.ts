import { app, shell, BrowserWindow, ipcMain, protocol, net } from 'electron'
import { existsSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { loadCharacter } from './characters/manifest'
import { SCENARIO_CUES } from './scenario/cues'
import { loadScenario } from './scenario/load'
import { playScenarioPaced, type PacedPlayback, type StageId } from './scenario/player'
import { writeTrace } from './scenario/trace'

// Character assets reach the renderer over lares:// so the load path is
// identical in dev (http origin) and packaged (file origin) builds.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'lares',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true }
  }
])

const charactersRoot = (): string => join(app.getAppPath(), 'characters')

function registerAssetProtocol(): void {
  protocol.handle('lares', (request) => {
    const url = new URL(request.url)
    if (url.host !== 'characters') return new Response('not found', { status: 404 })
    const root = charactersRoot()
    const target = join(root, decodeURIComponent(url.pathname))
    if (!target.startsWith(root + sep)) return new Response('forbidden', { status: 403 }) // P7: no traversal
    return net.fetch(pathToFileURL(target).toString())
  })
}

function registerCharacterIpc(): void {
  ipcMain.handle('character:get', () => {
    // ponytail: hiyori hardcoded — character selection is out of slice scope
    const root = charactersRoot()
    const result = loadCharacter(join(root, 'hiyori', 'lar.character.json'))
    if (!result.ok) return result
    const rel = relative(root, result.live2d.model).split(sep).join('/')
    return { ...result, live2d: { ...result.live2d, model: `lares://characters/${rel}` } }
  })

  ipcMain.on('body:inventory', (_event, params: unknown[]) => {
    // Root SPEC §8 body→brain message; brain-side consumers arrive in M2/M3.
    console.log(`[lares] body:inventory — ${Array.isArray(params) ? params.length : 0} parameters`)
  })

  ipcMain.handle('cues:list', () => {
    // ponytail: hiyori hardcoded, matches character:get above
    const root = charactersRoot()
    const result = loadCharacter(join(root, 'hiyori', 'lar.character.json'))
    if (!result.ok) return []
    const cuesBlock = (result.live2d.cues ?? {}) as Record<string, { params?: Record<string, number> }>
    return Object.entries(result.expressions).map(([name, coord]) => ({
      name,
      valence: coord.valence,
      arousal: coord.arousal,
      params: cuesBlock[name]?.params ?? {}
    }))
  })
}

// One playback at a time; engine trace lines are held until the renderer
// returns its synth frames, then the merged file is written: all engine
// lines first, then all synth lines (deterministic order, 002-D3).
let activePlayback: {
  name: string
  seed: number
  stages: StageId[]
  controller: PacedPlayback
  engineLines?: Record<string, string[]>
} | null = null

const GOLDEN_NAMES = new Set([
  'smooth-build',
  'brutal-debugging-session',
  'long-wait-for-input',
  'recovery-arc'
])

// P7: preset names are renderer input — sane shape, then allowlisted against
// the files actually shipped under presets/ (decision: data, not code).
function isPresetName(n: unknown): n is string {
  return (
    typeof n === 'string' &&
    /^[a-zA-Z0-9_-]{1,64}$/.test(n) &&
    existsSync(join(app.getAppPath(), 'presets', `${n}.json`))
  )
}

/** Single-stage keeps the pre-A/B filename; A/B appends .stageA / .stageB. */
function traceName(base: string, stages: StageId[], stage: StageId): string {
  return stages.length > 1 ? `${base}.stage${stage}` : base
}

// Live only while a run is between scenario:play and scenario:end — the
// controls (pause/resume/setSpeed/seek) all no-op with an error once the
// engine half has finished and is waiting on the renderer's synth trace
// (P7: every control route validates there's something to control).
function activeController(): PacedPlayback | null {
  return activePlayback && !activePlayback.engineLines ? activePlayback.controller : null
}

function registerScenarioIpc(): void {
  ipcMain.handle(
    'scenario:play',
    (
      event,
      name: unknown,
      seed: unknown,
      speed: unknown,
      presets: unknown
    ): { ok: true; endMs: number } | { ok: false; error: string } => {
      // P7: renderer input is untrusted — allowlist the name, clamp the numbers.
      if (activePlayback) return { ok: false, error: 'playback already in progress' }
      if (typeof name !== 'string' || !GOLDEN_NAMES.has(name)) {
        return { ok: false, error: `unknown scenario "${String(name)}"` }
      }
      const safeSeed = typeof seed === 'number' && Number.isFinite(seed) ? seed >>> 0 : 0
      const safeSpeed =
        typeof speed === 'number' && Number.isFinite(speed) ? Math.min(64, Math.max(0.1, speed)) : 1

      // Per-stage preset selection (002-D2): `{ A: name, B?: name }`. B present
      // = A/B mode = two engines + per-stage traces. Preset DATA is applied
      // renderer-side; main validates names and fans out stages.
      let stages: StageId[] = ['A']
      if (presets !== undefined) {
        if (typeof presets !== 'object' || presets === null || Array.isArray(presets)) {
          return { ok: false, error: 'invalid presets' }
        }
        const p = presets as Record<string, unknown>
        if (!isPresetName(p.A ?? 'default')) {
          return { ok: false, error: `unknown preset "${String(p.A)}"` }
        }
        if (p.B !== undefined) {
          if (!isPresetName(p.B)) return { ok: false, error: `unknown preset "${String(p.B)}"` }
          stages = ['A', 'B']
        }
      }

      let scenario
      try {
        scenario = loadScenario(join(app.getAppPath(), 'scenarios', `${name}.json`))
      } catch (err) {
        return { ok: false, error: (err as Error).message }
      }

      const sender = event.sender
      console.log(
        `[lares] scenario:play ${name} seed=${safeSeed} speed=${safeSpeed}x stages=${stages.join(',')}`
      )
      const controller = playScenarioPaced(scenario, SCENARIO_CUES, {
        speed: safeSpeed,
        stages,
        onFeed: (feed) => {
          if (!sender.isDestroyed()) sender.send('affect:update', feed)
        },
        onSeek: (history) => {
          if (!sender.isDestroyed()) sender.send('scenario:seeked', history)
        },
        onDone: (engineLines) => {
          if (sender.isDestroyed()) {
            // No renderer left to answer — persist the engine half and unlock.
            for (const stage of stages) {
              writeTrace(traceName(`${name}.seed${safeSeed}`, stages, stage), engineLines[stage] ?? [])
            }
            activePlayback = null
            return
          }
          activePlayback = { name, seed: safeSeed, stages, controller, engineLines }
          sender.send('scenario:end', { name })
        }
      })
      activePlayback = { name, seed: safeSeed, stages, controller }
      return { ok: true, endMs: controller.endMs }
    }
  )

  ipcMain.on('scenario:synthTrace', (_event, linesByStage: unknown) => {
    if (!activePlayback?.engineLines) return
    const { name, seed, stages, engineLines } = activePlayback
    // P7: only active stages are written, only string lines pass.
    const raw = (
      typeof linesByStage === 'object' && linesByStage !== null && !Array.isArray(linesByStage)
        ? linesByStage
        : {}
    ) as Record<string, unknown>
    for (const stage of stages) {
      const stageLines = raw[stage]
      const synthLines = Array.isArray(stageLines)
        ? stageLines.filter((l): l is string => typeof l === 'string')
        : []
      const engine = engineLines[stage] ?? []
      const path = writeTrace(traceName(`${name}.seed${seed}`, stages, stage), [
        ...engine,
        ...synthLines
      ])
      console.log(
        `[lares] trace written: ${path} (${engine.length} engine + ${synthLines.length} synth lines)`
      )
    }
    activePlayback = null
  })

  // A/B toggle widens the one app window for two side-by-side stages and
  // restores it on exit (002-D2 — one window, no compositing).
  ipcMain.handle('window:abMode', (event, on: unknown) => {
    if (typeof on !== 'boolean') return { ok: false, error: 'invalid abMode flag' } // P7
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return { ok: false, error: 'no window' }
    const [, height] = win.getSize()
    win.setSize(on ? AB_WIDTH : BASE_WIDTH, height)
    return { ok: true }
  })

  const NO_PLAYBACK = { ok: false as const, error: 'no playback in progress' }

  ipcMain.handle('scenario:pause', () => {
    const c = activeController()
    if (!c) return NO_PLAYBACK
    c.pause()
    return { ok: true }
  })

  ipcMain.handle('scenario:resume', () => {
    const c = activeController()
    if (!c) return NO_PLAYBACK
    c.resume()
    return { ok: true }
  })

  ipcMain.handle('scenario:setSpeed', (_event, speed: unknown) => {
    const c = activeController()
    if (!c) return NO_PLAYBACK
    // P7: only the three transport speeds the panel exposes are accepted.
    if (speed !== 1 && speed !== 8 && speed !== 64) return { ok: false, error: 'invalid speed' }
    c.setSpeed(speed)
    return { ok: true }
  })

  ipcMain.handle('scenario:seek', (_event, tMs: unknown) => {
    const c = activeController()
    if (!c) return NO_PLAYBACK
    if (typeof tMs !== 'number' || !Number.isFinite(tMs)) return { ok: false, error: 'invalid seek time' }
    c.seek(tMs) // player clamps to [0, endMs] and aligns to the grid
    return { ok: true }
  })
}

const BASE_WIDTH = 480
const AB_WIDTH = 1220 // two side-by-side stages + the dev panel strip

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: BASE_WIDTH,
    height: 720,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  if (is.dev) {
    // Pipe renderer console to the terminal so `pnpm dev` failures are visible
    // without opening devtools.
    mainWindow.webContents.on('console-message', (event) => {
      console.log(`[renderer:${event.level}] ${event.message}`)
    })
  }

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('io.lares')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerAssetProtocol()
  registerCharacterIpc()
  registerScenarioIpc()
  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
