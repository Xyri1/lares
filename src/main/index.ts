import { app, shell, BrowserWindow, dialog, ipcMain, protocol, net, screen } from 'electron'
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, relative, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { loadCharacter } from './characters/manifest'
import { Nerves } from './nerves'
import {
  clampToWorkArea,
  loadPosition,
  parsePoint,
  savePosition,
  type Point,
  type Rect
} from './position'
import { SCENARIO_CUES } from './scenario/cues'
import { loadScenario } from './scenario/load'
import {
  feedMessage,
  playScenarioPaced,
  type AffectFeedMessage,
  type PacedPlayback,
  type StageId
} from './scenario/player'
import { writeTrace } from './scenario/trace'
import { createServer } from './server/server'

// Character assets reach the renderer over lares:// so the load path is
// identical in dev (http origin) and packaged (file origin) builds.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'lares',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true }
  }
])

const charactersRoot = (): string => join(app.getAppPath(), 'characters')
const runtimeFile = (): string => join(homedir(), '.lares', 'runtime.json')

let liveNerves: Nerves | null = null
let nervesServer: ReturnType<typeof createServer> | null = null
let nervesTick: ReturnType<typeof setInterval> | null = null

function broadcastFeed(feed: AffectFeedMessage): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.webContents.isDestroyed()) win.webContents.send('affect:update', feed)
  }
}

function removeRuntimeFile(): void {
  try {
    unlinkSync(runtimeFile())
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error('[lares] failed to remove discovery file', error)
    }
  }
}

function configuredPort(): number {
  const value = Number(process.env.LARES_PORT)
  return Number.isInteger(value) && value >= 1 && value <= 65535 ? value : 21473
}

async function startNerves(): Promise<void> {
  const manifest = loadCharacter(join(charactersRoot(), 'hiyori', 'lar.character.json'))
  liveNerves = new Nerves('Hiyori', manifest.ok ? manifest.expressions : SCENARIO_CUES, Date.now())
  nervesServer = createServer({
    ingest: (envelope, nowMs) => liveNerves!.ingest(envelope, nowMs),
    emote: (args, source, nowMs) => liveNerves!.emote(args, source, nowMs),
    listCues: () => liveNerves!.listCues(),
    status: (nowMs) => liveNerves!.status(nowMs)
  })

  try {
    const port = await nervesServer.start(configuredPort())
    const directory = join(homedir(), '.lares')
    mkdirSync(directory, { recursive: true })
    writeFileSync(runtimeFile(), JSON.stringify({ version: 1, port, pid: process.pid }))
    nervesTick = setInterval(() => {
      const nowMs = Date.now()
      liveNerves!.tick(nowMs)
      if (activePlayback === null) {
        broadcastFeed(feedMessage(liveNerves!.snapshot(), Math.floor(nowMs / 100)))
      }
    }, 100)
    console.log(`[lares] listening on http://127.0.0.1:${port}`)
  } catch (error) {
    removeRuntimeFile()
    const code = (error as NodeJS.ErrnoException).code
    const message =
      code === 'EADDRINUSE'
        ? `Port ${configuredPort()} is already in use. Lares ingress is disabled.`
        : `Lares ingress failed to start: ${error instanceof Error ? error.message : String(error)}`
    console.error(`[lares] ${message}`)
    dialog.showErrorBox('Lares ingress unavailable', message)
    void nervesServer.stop()
    nervesServer = null
  }
}

function stopNerves(): void {
  if (nervesTick) clearInterval(nervesTick)
  nervesTick = null
  removeRuntimeFile()
  const server = nervesServer
  nervesServer = null
  if (server) void server.stop().catch((error) => console.error('[lares] server stop failed', error))
}

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
    const accepted = liveNerves?.setInventory(params) ?? false
    console.log(
      `[lares] body:inventory — ${accepted && Array.isArray(params) ? params.length : 0} parameters`
    )
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
        // 003-D2: the feed fans out to every live window, so the overlay
        // mirrors playback on the desktop. Everything else below stays aimed
        // at the requester — scenario control and the synth trace are a
        // dev-window affair, and the overlay must not answer for them.
        onFeed: broadcastFeed,
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

// Transparent breathing room around the model, and the first-run corner
// inset (003-D5). Both stay small: every transparent pixel is click-through
// surface that has to behave.
const OVERLAY_PAD = 8
const SPAWN_MARGIN = 24

// `pnpm dev` is the only run that earns the scenario-control window. `is.dev`
// alone will not do it — that is `!app.isPackaged`, so it stays true under
// `electron-vite preview`, and A1's production half ("only the overlay") would
// fail on the very command the spec names. Only the dev server sets this var,
// which is why the renderer load path below already pairs the two.
const IS_DEV_RUN = is.dev && !!process.env['ELECTRON_RENDERER_URL']

/** The overlay is the packaged deliverable; only ever one of it. */
let overlayWindow: BrowserWindow | null = null

const positionFile = (): string => join(app.getPath('userData'), 'window.json')

/** Where she goes: the remembered spot snapped into a visible work area (A4),
 *  or the bottom-right corner of the primary display on a first run. */
function overlayBounds(width: number, height: number): Rect {
  const saved = loadPosition(positionFile())
  if (saved) {
    const areas = screen.getAllDisplays().map((d) => d.workArea)
    return { ...clampToWorkArea({ ...saved, width, height }, areas), width, height }
  }
  const work = screen.getPrimaryDisplay().workArea
  return {
    x: Math.round(work.x + work.width - width - SPAWN_MARGIN),
    y: Math.round(work.y + work.height - height - SPAWN_MARGIN),
    width,
    height
  }
}

function wireCommon(win: BrowserWindow, tag: string, query?: Record<string, string>): void {
  if (is.dev) {
    // Pipe renderer console to the terminal so `pnpm dev` failures are visible
    // without opening devtools.
    win.webContents.on('console-message', (event) => {
      console.log(`[renderer:${tag}:${event.level}] ${event.message}`)
    })
  }

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (IS_DEV_RUN) {
    const url = new URL(process.env['ELECTRON_RENDERER_URL']!)
    for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, v)
    void win.loadURL(url.toString())
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'), { query })
  }
}

// The Lar on the desktop (003-D1): frameless, transparent, always-on-top, and
// click-through everywhere except her body. Transparency is create-time in
// Electron, which is why this is a second window rather than a mode of the
// dev one.
function createOverlayWindow(): void {
  const overlay = new BrowserWindow({
    // Placeholder until the renderer reports the model's footprint; the
    // height is already final, so only the width moves under the fit.
    width: 320,
    height: 400 + OVERLAY_PAD * 2,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    // 003-D5: the taskbar entry is the only quit path until M5a's tray.
    skipTaskbar: false,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  // Standard floating level — above ordinary windows, not screen-saver
  // aggression (003-D5).
  overlay.setAlwaysOnTop(true, 'floating')
  // Clicks fall through by default; the body's hit test switches capture back
  // on over `stage:pointer` (003-D3). Re-applied on every load, not once at
  // construction: a navigation resets forwarding, and without forwarding no
  // move ever reaches the hit test — which also covers HMR reloads in dev.
  overlay.webContents.on('did-finish-load', () => {
    overlay.setIgnoreMouseEvents(true, { forward: true })
  })

  overlayWindow = overlay
  overlay.on('closed', () => {
    overlayWindow = null
  })

  overlay.on('ready-to-show', () => {
    // Placed at the placeholder width so she never flashes in the wrong
    // corner; window:fitToModel re-places her once the model has measured
    // itself. ponytail: a first run shifts her by a few px for one frame —
    // a saved position is byte-identical across both calls.
    const [width, height] = overlay.getSize()
    overlay.setBounds(overlayBounds(width, height))
    overlay.show()
  })

  wireCommon(overlay, 'overlay', { mode: 'overlay' })
}

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

  wireCommon(mainWindow, 'dev')
}

// 003-D1: packaged runs are the overlay alone; `pnpm dev` adds the framed
// scenario-control window beside it.
function createWindows(): void {
  createOverlayWindow()
  if (IS_DEV_RUN) createWindow()
}

// Everything here is overlay-only and re-checks that the sender IS the
// overlay — the dev window shares this preload and must not move the Lar.
function registerOverlayIpc(): void {
  const fromOverlay = (event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent): boolean =>
    overlayWindow !== null && BrowserWindow.fromWebContents(event.sender) === overlayWindow

  // stage:pointer (root §8) — cursor on the body ⇒ the window captures;
  // anywhere else inside the rect ⇒ the click lands on the desktop (003-D3).
  ipcMain.on('stage:pointer', (event, overBody: unknown) => {
    if (!fromOverlay(event)) return
    overlayWindow!.setIgnoreMouseEvents(overBody !== true, { forward: true })
  })

  ipcMain.handle('window:fitToModel', (event, size: unknown) => {
    if (!fromOverlay(event)) return { ok: false, error: 'not the overlay' }
    // P7: renderer input. Clamped to something a desktop can actually hold —
    // a bad aspect must not produce a 30000px window.
    const s = size as Record<string, unknown> | null
    if (typeof s !== 'object' || s === null) return { ok: false, error: 'invalid size' }
    const dim = (v: unknown): number | null =>
      typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.min(2048, Math.round(v)) : null
    const width = dim(s.width)
    const height = dim(s.height)
    if (width === null || height === null) return { ok: false, error: 'invalid size' }
    overlayWindow!.setBounds(overlayBounds(width + OVERLAY_PAD * 2, height + OVERLAY_PAD * 2))
    return { ok: true }
  })

  // Drag in screen coordinates (003-D4). Main holds the origin so a dropped
  // or replayed move can never accumulate drift.
  let drag: { winX: number; winY: number; from: Point } | null = null

  ipcMain.on('window:dragStart', (event, at: unknown) => {
    const from = parsePoint(at)
    if (!fromOverlay(event) || !from) return
    const [winX, winY] = overlayWindow!.getPosition()
    drag = { winX, winY, from }
  })

  ipcMain.on('window:dragMove', (event, at: unknown) => {
    const to = parsePoint(at)
    if (!drag || !fromOverlay(event) || !to) return
    overlayWindow!.setPosition(drag.winX + (to.x - drag.from.x), drag.winY + (to.y - drag.from.y))
  })

  ipcMain.on('window:dragEnd', (event) => {
    if (!drag || !fromOverlay(event)) return
    drag = null
    const [x, y] = overlayWindow!.getPosition()
    savePosition(positionFile(), { x, y }) // A3: she stands where she was dropped
  })
}

// A5: a second launch exits immediately; the running instance is untouched
// (no focus steal — the spec says unaffected).
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.whenReady().then(() => {
    electronApp.setAppUserModelId('io.lares')

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    registerAssetProtocol()
    registerCharacterIpc()
    registerScenarioIpc()
    registerOverlayIpc()
    void startNerves()
    createWindows()

    app.on('activate', function () {
      if (BrowserWindow.getAllWindows().length === 0) createWindows()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })

  app.on('before-quit', stopNerves)
}
