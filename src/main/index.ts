import {
  app,
  shell,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  Notification,
  protocol,
  nativeImage,
  net,
  screen,
  Tray
} from 'electron'
import { existsSync, mkdirSync, realpathSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { removeClaudeCode } from './adapters/claude-code/writer'
import { removeCodexHooks } from './adapters/codex/hooks'
import { writeForwarderShim } from './adapters/shim'
import { removeHostGuidanceRule, writeHostGuidanceRule } from './hostGuidance'
import { parseModelCdi3File } from './characters/exp3'
import { mergeRuntimeCompatibility } from './characters/manifest'
import {
  bundledPackageRoot,
  discardManagedCharacter,
  ensureManagedCharacterLibrary,
  importCharacterPackage,
  listCharacterPackages
} from './characters/library'
import {
  CharacterAssetState,
  CharacterLoadBroker,
  type CharacterBody
} from './characters/broker'
import {
  createCharacterSwitcher,
  type CharacterPackage,
  type CharacterSwitcher,
  type CharacterSwitchResult
} from './characters/switch'
import { DEFAULT_CONFIG, loadConfig, saveConfig, type AppConfig, type Scale } from './config'
import { DensityLog } from './densityLog'
import { errorMessage } from './errors'
import { createFeel, type Feel } from './feel/service'
import { L, resolveLocale, setLocale } from './strings'
import {
  configureAgentIntegrations,
  manualCommands,
  runAgentIntegrationCommand,
  type AgentIntegrationReport,
  type Harness
} from './integrations'
import { Nerves, parseInventory, type PreparedNervesCharacter } from './nerves'
import {
  clampToWorkArea,
  loadPosition,
  parsePoint,
  savePosition,
  type Point,
  type Rect
} from './position'
import { productBodyTargets } from './productBody'
import { loadScenario } from './scenario/load'
import {
  playScenarioPaced,
  type AffectFeedMessage,
  type PacedPlayback
} from './scenario/player'
import { writeTrace } from './scenario/trace'
import { createServer } from './server/server'
import { eventName } from './sessions/mapEvent'
import { createTrayShell, hydrateInitialCharacter } from './shell'
import {
  checkLatestRelease,
  createUpdateChecks,
  isLaresReleaseUrl,
  loadUpdateCache,
  saveUpdateCache
} from './updates'
import {
  removeLaresUserData,
  removeOwnedIntegrations,
  runMacUninstall,
  runWindowsUninstall
} from './uninstall'

// Character assets reach the renderer over lares:// so the load path is
// identical in dev (http origin) and packaged (file origin) builds.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'lares',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true }
  }
])

const charactersRoot = (): string => join(app.getPath('userData'), 'characters')
const defaultCharacterRoot = (): string =>
  bundledPackageRoot(
    app.getAppPath(),
    process.resourcesPath,
    app.isPackaged,
    process.env.LARES_DEFAULT_CHARACTER || 'haru'
  )
const runtimeFile = (): string => join(homedir(), '.lares', 'runtime.json')

let liveNerves: Nerves | null = null
let liveFeel: Feel | null = null
let nervesServer: ReturnType<typeof createServer> | null = null
let nervesTick: ReturnType<typeof setInterval> | null = null
let densityLog: DensityLog | null = null
let selectedCharacter:
  | CharacterPackage
  | { ok: false; error: string }
  | null = null
let characterSwitcher: CharacterSwitcher | null = null
let characterAssets: CharacterAssetState | null = null
let characterLoadBroker: CharacterLoadBroker | null = null
let appConfig: AppConfig = { ...DEFAULT_CONFIG }
let tray: Tray | null = null
let updateChecks: ReturnType<typeof createUpdateChecks> | null = null
let quitting = false

const LIVE_TRACE_LIMIT = 120
const liveTrace: LiveTraceEvent[] = []
let devTraceReady = false

function traceLive(event: Omit<LiveTraceEvent, 'at'>, at = Date.now()): void {
  if (!IS_DEV_RUN) return
  const value: LiveTraceEvent = { at, ...event }
  liveTrace.push(value)
  if (liveTrace.length > LIVE_TRACE_LIMIT) liveTrace.splice(0, liveTrace.length - LIVE_TRACE_LIMIT)
  if (!devTraceReady || !devWindow || devWindow.webContents.isDestroyed()) return
  devWindow.webContents.send('liveTrace:update', value)
}

// Scenario playback still fans out so the product overlay mirrors the dev run;
// the normal live feed below targets only the overlay.
function broadcastScenarioFeed(feed: AffectFeedMessage): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.webContents.isDestroyed()) win.webContents.send('affect:update', feed)
  }
}

function sendLiveFeed(feed: AffectFeedMessage): void {
  const targets = productBodyTargets(overlayWindow, BrowserWindow.getAllWindows())
  // The overlay remains the product body; the dev window receives the same
  // live feed only so its pipeline display can prove renderer receipt.
  if (IS_DEV_RUN && devWindow && !targets.includes(devWindow)) targets.push(devWindow)
  for (const win of targets) {
    if (!win.webContents.isDestroyed()) win.webContents.send('affect:update', feed)
  }
}

/**
 * On-change emission (013 SPEC §13). The 100ms sweep still runs the session
 * table's liveness, but the body only hears a message when the displayed tuple
 * or the resolved operational state actually moves — including a change the
 * sweep itself produces, such as done→idle.
 */
function emitLiveFeed(nowMs: number): void {
  if (liveFeel === null) return
  if (activePlayback !== null) {
    // Playback owns the channel; resend once live takes it back.
    liveFeel.resetFeed()
    return
  }
  const message = liveFeel.feed(nowMs)
  if (message) {
    traceLive(
      {
        source: 'feed',
        action: 'emitted',
        feel: message.feel,
        operational: message.operational
      },
      nowMs
    )
    sendLiveFeed(message)
  }
}

/** A body just took the feed channel — at boot, or after a character switch
 *  reset its pose to the new neutral (013 SPEC §§1, 6). */
function resendLiveFeed(): void {
  liveFeel?.resend(Date.now())
}

function broadcast(channel: 'authoring:preview' | 'authoring:revert', value?: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.webContents.isDestroyed()) win.webContents.send(channel, value)
  }
}

function activeCharacter():
  | CharacterPackage
  | { ok: false; error: string } {
  if (selectedCharacter) return selectedCharacter
  const packages = listCharacterPackages(charactersRoot())
  if (packages.length === 0) {
    selectedCharacter = { ok: false, error: `No valid character package found under ${charactersRoot()}` }
    return selectedCharacter
  }
  const selected = hydrateInitialCharacter(packages, appConfig)!
  if (packages.length > 1 && appConfig.activeCharacter === undefined) {
    console.warn(`[lares] Multiple character packages found; using ${selected.manifestPath}`)
  }
  selectedCharacter = selected
  return selectedCharacter
}

export async function switchCharacter(manifestPath: string): Promise<CharacterSwitchResult> {
  return characterSwitcher
    ? characterSwitcher.switchTo(manifestPath)
    : { ok: false, error: 'character switching is not ready' }
}

function displayNames(modelPath: string): ReadonlyMap<string, string> {
  const selected = activeCharacter()
  return 'error' in selected
    ? new Map()
    : parseModelCdi3File(modelPath, dirname(selected.manifestPath))
}

function assetUrl(path: string, candidateId?: number): string {
  const encoded = path.split(/[\\/]/).map(encodeURIComponent).join('/')
  return candidateId === undefined
    ? `lares://characters/${encoded}`
    : `lares://candidate/${candidateId}/${encoded}`
}

function characterPayload(selected: CharacterPackage, candidateId?: number) {
  const model = relative(dirname(selected.manifestPath), selected.character.live2d.model)
  const fallbackPhysics = selected.character.live2d.fallbackPhysics
  return {
    ...selected.character,
    live2d: {
      ...selected.character.live2d,
      model: assetUrl(model, candidateId),
      ...(typeof fallbackPhysics === 'string'
        ? { fallbackPhysics: assetUrl(fallbackPhysics, candidateId) }
        : {})
    }
  }
}

interface PreparedCharacterFiles {
  names: ReadonlyMap<string, string>
}

function prepareCharacterFiles(candidate: CharacterPackage): PreparedCharacterFiles {
  return {
    names: parseModelCdi3File(candidate.character.live2d.model, dirname(candidate.manifestPath))
  }
}

function bodyPreparePayload(candidate: CharacterPackage, id: number) {
  return {
    id,
    character: {
      ok: true as const,
      name: candidate.character.name,
      // Renderer-neutral pose data crosses as-is (slice 013 SPEC §13); the
      // body merges it over the shipped defaults.
      ...(candidate.character.anchors ? { anchors: candidate.character.anchors } : {}),
      ...(candidate.character.operational
        ? { operational: candidate.character.operational }
        : {}),
      live2d: {
        model: assetUrl(
          relative(dirname(candidate.manifestPath), candidate.character.live2d.model),
          id
        ),
        ...(typeof candidate.character.live2d.fallbackPhysics === 'string'
          ? {
              fallbackPhysics: assetUrl(
                candidate.character.live2d.fallbackPhysics,
                id
              )
            }
          : {}),
        ...(candidate.character.live2d.performance
          ? { performance: candidate.character.live2d.performance }
          : {}),
        ...(candidate.character.live2d.choreography
          ? { choreography: candidate.character.live2d.choreography }
          : {})
      }
    }
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
  removeHostGuidanceRule()
}

function configuredPort(): number {
  const value = Number(process.env.LARES_PORT)
  return Number.isInteger(value) && value >= 1 && value <= 65535 ? value : 21473
}

async function syncAdapters(): Promise<void> {
  const home = homedir()
  const forwarderPath = join(app.getAppPath(), 'scripts', 'forwarder.js')
  await Promise.all([
    // Both harnesses are delivered through their marketplace plugins (009,
    // D15 fold-back); the app only cleans up registrations older builds
    // wrote into user files.
    removeClaudeCode({
      claudeDirectory: join(home, '.claude'),
      settingsPath: join(home, '.claude', 'settings.json'),
      claudeConfigPath: join(home, '.claude.json'),
      log: (message) => console.error(`[lares] Claude Code adapter: ${message}`)
    })
      .then((result) => {
        if (result.settings === 'updated' || result.mcp === 'updated') {
          console.log('[lares] legacy Claude Code registration removed; use Configure Agent Integrations from the Lares tray')
        }
      })
      .catch((error) => console.error('[lares] Claude Code legacy cleanup failed', error)),
    removeCodexHooks({
      codexDirectory: join(home, '.codex'),
      hooksPath: join(home, '.codex', 'hooks.json')
    })
      .then((result) => {
        if (result === 'updated') {
          console.log('[lares] legacy Codex hooks removed; hooks now ship in the Codex plugin')
        }
      })
      .catch((error) => console.error('[lares] Codex legacy cleanup failed', error)),
    writeForwarderShim({
      binDir: join(home, '.lares', 'bin'),
      appPath: process.execPath,
      forwarderPath,
      platform: process.platform
    }).catch((error) => console.error('[lares] forwarder shim failed', error))
  ])
}

function liveCharacterBody(): CharacterBody | null {
  const window = productBodyTargets(overlayWindow, BrowserWindow.getAllWindows())[0]
  if (!window) return null
  const contents = window.webContents
  return {
    id: String(contents.id),
    isDestroyed: () => contents.isDestroyed(),
    send: (channel, value) => contents.send(channel, value),
    onDestroyed: (listener) => {
      contents.once('destroyed', listener)
      return () => contents.removeListener('destroyed', listener)
    }
  }
}

async function startNerves(): Promise<void> {
  densityLog = process.env.LARES_DENSITY_LOG
    ? new DensityLog(resolve(process.env.LARES_DENSITY_LOG))
    : null
  const selected = activeCharacter()
  const character = 'error' in selected ? null : selected.character
  let currentSelection = 'error' in selected ? null : selected
  if ('error' in selected) console.error(`[lares] ${selected.error}`)
  liveNerves = new Nerves(character?.name ?? 'No character', undefined, {
    preview: (value) => broadcast('authoring:preview', value),
    revertPreview: () => broadcast('authoring:revert')
  })
  liveFeel = createFeel({
    path: feelFile(),
    state: (nowMs) => liveNerves!.sessionState(nowMs),
    trace: traceLive
  })
  if (currentSelection) {
    characterAssets = new CharacterAssetState(dirname(currentSelection.manifestPath))
    characterLoadBroker = new CharacterLoadBroker(characterAssets, liveCharacterBody, 30_000)
    characterSwitcher = createCharacterSwitcher(
      charactersRoot(),
      currentSelection,
      {
        precompute: prepareCharacterFiles,
        prepare: ({ id, candidate }) =>
          characterLoadBroker!.prepare(
            id,
            dirname(candidate.manifestPath),
            bodyPreparePayload(candidate, id),
            (inventory, compatibility) =>
              mergeRuntimeCompatibility(candidate.character.report, inventory, compatibility)
          ),
        prepareCommit: (candidate, inventory, files, id) => {
          const namedInventory = inventory.map((param) => ({
            ...param,
            name: files.names.get(param.id) ?? param.name
          }))
          const prepared = liveNerves!.prepareCharacter(candidate.character.name, namedInventory)
          return {
            files,
            nerves: prepared,
            body: { id }
          }
        },
        commit: (id, state) => characterLoadBroker!.commit(id, state.body),
        cancel: (id, reason) => characterLoadBroker!.cancel(id, reason),
        rollback: (id, reason) => characterLoadBroker!.rollback(id, reason),
        finalize: (id) => {
          if (!characterLoadBroker!.finalize(id)) {
            throw new Error('character finalization handoff was refused')
          }
        },
        publish: (
          candidate,
          state: {
            files: PreparedCharacterFiles
            nerves: PreparedNervesCharacter
            body: { id: number }
          }
        ) => {
          selectedCharacter = candidate
          currentSelection = candidate
          liveNerves!.commitCharacter(state.nerves)
          stopScenarioPlayback()
          // The dev body is an observer, not part of the switch transaction;
          // reload it after commit so its wiring display follows the product body.
          if (IS_DEV_RUN && devWindow && !devWindow.webContents.isDestroyed()) {
            devWindow.reload()
          }
          // The new body performs its own neutral until the feed reaches it:
          // re-emit the unchanged tuple and the live operational state so the
          // switch eases from one character's target to the other's (§§1, 6)
          // and no awaiting_input is masked (P10).
          resendLiveFeed()
        }
      }
    )
  }
  densityLog?.recordBaseline(liveNerves.sessionState(Date.now()).baseline, Date.now())
  nervesServer = createServer({
    ingest: (envelope, nowMs) => {
      liveNerves!.ingest(envelope, nowMs)
      const operational = liveNerves!.sessionState(nowMs).baseline
      densityLog?.recordBaseline(operational, nowMs)
      traceLive(
        {
          source: 'hook',
          action: 'accepted',
          session: `${envelope.harness}:${envelope.session_id}`,
          detail: eventName(envelope) ?? 'unknown event',
          operational
        },
        nowMs
      )
      emitLiveFeed(nowMs)
    },
    feel: (args, mcpSessionId, nowMs) => {
      const ack = liveFeel!.report(args, mcpSessionId, nowMs)
      emitLiveFeed(nowMs)
      return ack
    },
    status: (mcpSessionId, nowMs) => {
      const { active_character, protocol_version } = liveNerves!.status()
      return { active_character, protocol_version, ...liveFeel!.attributed(mcpSessionId, nowMs) }
    },
    checkpoint: (sessionKey) => liveFeel?.checkpoint(sessionKey),
    listParameters: () => liveNerves!.listParameters(),
    previewExpression: (args, nowMs) => liveNerves!.previewExpression(args, nowMs),
    trace: traceLive
  })

  try {
    const port = await nervesServer.start(configuredPort())
    const directory = join(homedir(), '.lares')
    mkdirSync(directory, { recursive: true })
    writeFileSync(
      runtimeFile(),
      JSON.stringify({ version: 1, port, pid: process.pid, hostGuidance: appConfig.hostGuidance })
    )
    if (appConfig.hostGuidance) writeHostGuidanceRule()
    else removeHostGuidanceRule()
    await syncAdapters()
    // The sweep still runs at 100ms — the session table's liveness needs it —
    // but the feed it drives now emits only on change (013 SPEC §13).
    nervesTick = setInterval(() => {
      const nowMs = Date.now()
      liveNerves!.tick(nowMs)
      densityLog?.recordBaseline(liveNerves!.sessionState(nowMs).baseline, nowMs)
      emitLiveFeed(nowMs)
    }, 100)
    console.log(`[lares] listening on http://127.0.0.1:${port}`)
  } catch (error) {
    removeRuntimeFile()
    const code = (error as NodeJS.ErrnoException).code
    const portInUse = code === 'EADDRINUSE'
    const port = configuredPort()
    // Log output stays English regardless of locale; only the dialog is localized.
    console.error(
      `[lares] ${
        portInUse
          ? `Port ${port} is already in use. Lares ingress is disabled.`
          : `Lares ingress failed to start: ${errorMessage(error)}`
      }`
    )
    dialog.showErrorBox(
      L.ingressUnavailableTitle,
      portInUse ? L.ingressPortInUse(port) : L.ingressFailedToStart(errorMessage(error))
    )
    void nervesServer.stop()
    nervesServer = null
  }
}

function stopNerves(): void {
  if (nervesTick) clearInterval(nervesTick)
  nervesTick = null
  densityLog = null
  removeRuntimeFile()
  const server = nervesServer
  nervesServer = null
  if (server) void server.stop().catch((error) => console.error('[lares] server stop failed', error))
}

function registerAssetProtocol(): void {
  protocol.handle('lares', (request) => {
    try {
      const resolvedAsset = characterAssets?.resolve(request.url)
      if (!resolvedAsset) return new Response('not found', { status: 404 })
      const { root, path } = resolvedAsset
      const target = resolve(root, path)
      if (!target.startsWith(root + sep)) return new Response('forbidden', { status: 403 })
      const realTarget = realpathSync(target)
      if (!realTarget.startsWith(realpathSync(root) + sep)) {
        return new Response('forbidden', { status: 403 })
      }
      return net.fetch(pathToFileURL(realTarget).toString())
    } catch {
      return new Response('not found', { status: 404 })
    }
  })
}

function registerCharacterIpc(): void {
  ipcMain.handle('character:get', () => {
    const selected = activeCharacter()
    if ('error' in selected) return selected
    return characterPayload(selected)
  })

  ipcMain.on('body:inventory', (event, params: unknown[], compatibility: unknown) => {
    // Any body reporting in is about to start listening for the feed.
    resendLiveFeed()
    if (overlayWindow && BrowserWindow.fromWebContents(event.sender) !== overlayWindow) return
    const selected = activeCharacter()
    const names =
      'error' in selected ? new Map<string, string>() : displayNames(selected.character.live2d.model)
    const withDisplayNames = Array.isArray(params)
      ? params.map((value) => {
          if (typeof value !== 'object' || value === null) return value
          const id = (value as { id?: unknown }).id
          const name = typeof id === 'string' ? names.get(id) : undefined
          return name ? { ...value, name } : value
        })
      : params
    const accepted = liveNerves?.setInventory(withDisplayNames) ?? false
    const parsed = parseInventory(withDisplayNames)
    const selectedReport = 'error' in selected ? null : selected.character.report
    const compatible =
      parsed && selectedReport
        ? mergeRuntimeCompatibility(selectedReport, parsed, compatibility)
        : false
    console.log(
      `[lares] body:inventory — ${accepted && compatible && Array.isArray(params) ? params.length : 0} parameters`
    )
  })

  ipcMain.on('character:prepared', (event, raw: unknown) => {
    characterLoadBroker?.receive(String(event.sender.id), raw)
  })

  ipcMain.on('character:commit-result', (event, raw: unknown) => {
    characterLoadBroker?.receiveCommit(String(event.sender.id), raw)
  })

  ipcMain.handle('character:decision', (event, rawId: unknown) => {
    const body = liveCharacterBody()
    return body?.id === String(event.sender.id)
      ? (characterLoadBroker?.decision(rawId) ?? null)
      : null
  })
}

// One playback at a time; engine trace lines are held until the renderer
// returns its synth frames, then the merged file is written in deterministic
// engine-then-synth order (002-D3).
let activePlayback: {
  name: string
  seed: number
  controller: PacedPlayback
  engineLines?: string[]
} | null = null

function stopScenarioPlayback(): void {
  const playback = activePlayback
  activePlayback = null
  if (!playback) return
  try {
    playback.controller.cancel()
  } catch (error) {
    console.error('[lares] scenario cancellation failed', error)
  }
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.webContents.isDestroyed()) continue
    try {
      win.webContents.send('scenario:stopped')
    } catch {
      // Main playback is already stopped; renderer finalization also clears local replay.
    }
  }
}

const GOLDEN_NAMES = new Set([
  'smooth-build',
  'brutal-debugging-session',
  'long-wait-for-input',
  'recovery-arc'
])

// Live only while a run is between scenario:play and scenario:end — the
// controls (pause/resume/setSpeed/seek) all no-op with an error once the
// engine half has finished and is waiting on the renderer's synth trace
// (P7: every control route validates there's something to control).
function activeController(): PacedPlayback | null {
  return activePlayback && !activePlayback.engineLines ? activePlayback.controller : null
}

function registerScenarioIpc(): void {
  ipcMain.on('liveTrace:ready', (event) => {
    if (!IS_DEV_RUN || !devWindow || event.sender !== devWindow.webContents) return
    devTraceReady = true
    for (const value of liveTrace) event.sender.send('liveTrace:update', value)
  })

  ipcMain.handle(
    'scenario:play',
    (event, name: unknown, seed: unknown, speed: unknown):
      | { ok: true; endMs: number }
      | { ok: false; error: string } => {
      // P7: renderer input is untrusted — allowlist the name, clamp the numbers.
      if (activePlayback) return { ok: false, error: 'playback already in progress' }
      if (typeof name !== 'string' || !GOLDEN_NAMES.has(name)) {
        return { ok: false, error: `unknown scenario "${String(name)}"` }
      }
      const safeSeed = typeof seed === 'number' && Number.isFinite(seed) ? seed >>> 0 : 0
      const safeSpeed =
        typeof speed === 'number' && Number.isFinite(speed) ? Math.min(64, Math.max(0.1, speed)) : 1

      let scenario
      try {
        scenario = loadScenario(join(app.getAppPath(), 'scenarios', `${name}.json`))
      } catch (err) {
        return { ok: false, error: (err as Error).message }
      }

      const sender = event.sender
      console.log(`[lares] scenario:play ${name} seed=${safeSeed} speed=${safeSpeed}x`)
      const controller = playScenarioPaced(scenario, {
        speed: safeSpeed,
        // 003-D2: the feed fans out to every live window, so the overlay
        // mirrors playback on the desktop. Everything else below stays aimed
        // at the requester — scenario control and the synth trace are a
        // dev-window affair, and the overlay must not answer for them.
        onFeed: broadcastScenarioFeed,
        onSeek: (history) => {
          if (!sender.isDestroyed()) sender.send('scenario:seeked', history)
        },
        onDone: (engineLines) => {
          if (sender.isDestroyed()) {
            // No renderer left to answer — persist the engine half and unlock.
            writeTrace(`${name}.seed${safeSeed}`, engineLines)
            activePlayback = null
            return
          }
          activePlayback = { name, seed: safeSeed, controller, engineLines }
          sender.send('scenario:end', { name })
        }
      })
      activePlayback = { name, seed: safeSeed, controller }
      return { ok: true, endMs: controller.endMs }
    }
  )

  ipcMain.on('scenario:synthTrace', (_event, rawLines: unknown) => {
    if (!activePlayback?.engineLines) return
    const { name, seed, engineLines } = activePlayback
    const synthLines = Array.isArray(rawLines)
      ? rawLines.filter((line): line is string => typeof line === 'string')
      : []
    const path = writeTrace(`${name}.seed${seed}`, [...engineLines, ...synthLines])
    console.log(
      `[lares] trace written: ${path} (${engineLines.length} engine + ${synthLines.length} synth lines)`
    )
    activePlayback = null
  })

  const NO_PLAYBACK = { ok: false as const, error: 'no playback in progress' }

  ipcMain.handle('scenario:stop', () => {
    stopScenarioPlayback()
    liveFeel?.resetFeed()
    emitLiveFeed(Date.now())
    return { ok: true }
  })

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

const BASE_WIDTH = 820

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
let devWindow: BrowserWindow | null = null

const positionFile = (): string => join(app.getPath('userData'), 'window.json')
const configFile = (): string => join(app.getPath('userData'), 'config.json')
const feelFile = (): string => join(app.getPath('userData'), 'feel.json')
const updateCacheFile = (): string => join(app.getPath('userData'), 'updates.json')

function integrationLabel(harness: Harness): string {
  return harness === 'claude' ? 'Claude Code' : 'Codex'
}

function integrationResult(report: AgentIntegrationReport): {
  rows: IntegrationsResultRow[]
  next: string[]
  manualCommands: string[]
} {
  const manual: string[] = []
  const rows = report.harnesses.map((result): IntegrationsResultRow => {
    const label = integrationLabel(result.harness)
    if (result.status === 'configured') {
      return { status: 'ok', text: L.agentIntegrationConfigured(label) }
    }
    if (result.status === 'already-configured') {
      return { status: 'ok', text: L.agentIntegrationAlreadyConfigured(label) }
    }
    manual.push(...manualCommands(result.harness))
    return result.status === 'missing'
      ? { status: 'skip', text: L.agentIntegrationMissing(label) }
      : {
          status: 'fail',
          text: L.agentIntegrationFailed(
            label,
            result.error ??
              (result.reason === 'verification'
                ? L.agentIntegrationsVerificationFailed
                : L.agentIntegrationsUnknownError)
          )
        }
  })
  const next = report.harnesses
    .filter((result) => result.status === 'configured' || result.status === 'already-configured')
    .map((result) =>
      result.harness === 'claude' ? L.agentIntegrationsClaudeNext : L.agentIntegrationsCodexNext
    )
  return { rows, next, manualCommands: manual }
}

/** Only ever one integrations window; the tray item focuses it when open. */
let integrationsWindow: BrowserWindow | null = null

// Consent, live command ledger, and results in one window — the native
// message boxes it replaces gave the multi-command CLI run no feedback at all.
async function configureIntegrationsFromTray(): Promise<void> {
  if (integrationsWindow) {
    integrationsWindow.focus()
    return
  }
  const win = new BrowserWindow({
    // Consent is a short read; the window grows when the command ledger opens.
    width: 620,
    height: 310,
    useContentSize: true,
    show: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    autoHideMenuBar: true,
    title: L.agentIntegrationsResultTitle,
    icon,
    backgroundColor: '#f4f2f9',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })
  integrationsWindow = win

  const state: IntegrationsState = {
    phase: 'confirm',
    strings: {
      confirmTitle: L.agentIntegrationsConfirmTitle,
      message: L.agentIntegrationsConfirmMessage,
      detail: L.agentIntegrationsConfirmDetail,
      cancel: L.agentIntegrationsCancel,
      configure: L.agentIntegrationsConfigure,
      runningTitle: L.agentIntegrationsRunningTitle,
      runningNote: L.agentIntegrationsRunningNote,
      resultTitle: L.agentIntegrationsResultTitle,
      nextTitle: L.agentIntegrationsNextSteps,
      copy: L.agentIntegrationsCopyCommands,
      done: L.agentIntegrationsDone
    },
    commands: []
  }
  const push = (): void => {
    if (!win.isDestroyed()) win.webContents.send('integrations:state', state)
  }
  // The first push races the page load; re-push on load so no state is lost.
  win.webContents.on('did-finish-load', push)

  let manual: string[] = []
  let confirmResolve: ((confirmed: boolean) => void) | null = null
  const onAction = (event: Electron.IpcMainEvent, action: IntegrationsAction): void => {
    if (event.sender !== win.webContents) return
    if (action === 'configure' && confirmResolve) {
      state.phase = 'running'
      win.setContentSize(620, 560)
      push()
      confirmResolve(true)
      confirmResolve = null
    } else if (action === 'copy') {
      clipboard.writeText(manual.join('\n'))
      state.copied = true
      push()
    } else if (action === 'cancel' || action === 'done') {
      win.close()
    }
  }
  ipcMain.on('integrations:action', onAction)
  win.on('closed', () => {
    ipcMain.removeListener('integrations:action', onAction)
    confirmResolve?.(false)
    integrationsWindow = null
  })
  win.once('ready-to-show', () => win.show())
  wireCommon(win, 'integrations', undefined, 'integrations.html')

  let nextCommandId = 0
  const report = await configureAgentIntegrations({
    confirm: () =>
      new Promise<boolean>((resolve) => {
        confirmResolve = resolve
      }),
    run: async (command, args) => {
      const cli = basename(command)
        .replace(/\.(exe|cmd|bat)$/i, '')
        .toLowerCase()
      // The ledger shows the harness CLIs only — probe helpers (the login
      // shell that resolves codex on macOS) stay out of it.
      const row: IntegrationsCommandRow | null =
        cli === 'claude' || cli === 'codex'
          ? { id: nextCommandId++, text: `${cli} ${args.join(' ')}`, status: 'running' }
          : null
      if (row) {
        state.commands.push(row)
        push()
      }
      const result = await runAgentIntegrationCommand(command, args)
      if (row) {
        if (result.missing) {
          // Candidate executable does not exist — nothing actually ran.
          state.commands.splice(state.commands.indexOf(row), 1)
        } else {
          row.status = result.code === 0 ? 'ok' : 'fail'
        }
        push()
      }
      return result
    }
  })
  if (!report.confirmed || win.isDestroyed()) return
  const result = integrationResult(report)
  manual = result.manualCommands
  state.phase = 'result'
  state.results = { rows: result.rows, next: result.next, hasManual: manual.length > 0 }
  push()
}

/** Where she goes: the remembered spot snapped into a visible work area (A4),
 *  or the bottom-right corner of the primary display on a first run. */
function overlayBounds(
  width: number,
  height: number,
  saved: Point | null = loadPosition(positionFile())
): Rect {
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

function wireCommon(
  win: BrowserWindow,
  tag: string,
  query?: Record<string, string>,
  page = 'index.html'
): void {
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
    url.pathname = `/${page}`
    for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, v)
    void win.loadURL(url.toString())
  } else {
    void win.loadFile(join(__dirname, `../renderer/${page}`), { query })
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
    skipTaskbar: true,
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
  overlay.on('close', (event) => {
    if (quitting) return
    event.preventDefault()
    overlay.hide()
  })
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
    if (!appConfig.doNotDisturb) overlay.show()
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
  devWindow = mainWindow
  mainWindow.on('closed', () => {
    if (devWindow === mainWindow) {
      devWindow = null
      devTraceReady = false
    }
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

  ipcMain.handle('overlay:scale:get', (event) =>
    fromOverlay(event) ? appConfig.scale : DEFAULT_CONFIG.scale
  )

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

function resetOverlayPosition(): void {
  if (!overlayWindow) return
  const [width, height] = overlayWindow.getSize()
  const bounds = overlayBounds(width, height, null)
  overlayWindow.setBounds(bounds)
  savePosition(positionFile(), { x: bounds.x, y: bounds.y })
}

async function cleanupOwnedIntegrations(): Promise<void> {
  const { claude, codex } = await removeOwnedIntegrations(
    homedir(),
    (message) => console.error(`[lares] ${message}`)
  )
  console.log(
    `[lares] integrations removed: Claude hooks=${claude.settings}, MCP=${claude.mcp}; Codex hooks=${codex}`
  )
}

async function uninstallFromTray(): Promise<void> {
  if (process.platform === 'win32') {
    await runWindowsUninstall({
      execPath: process.execPath,
      packaged: app.isPackaged,
      platform: process.platform,
      exists: existsSync,
      launch: (path) => shell.openPath(path),
      quit: () => {
        quitting = true
        app.quit()
      }
    })
    return
  }
  if (process.platform !== 'darwin') throw new Error('Uninstall is supported on macOS and Windows')

  const choice = await dialog.showMessageBox({
    type: 'warning',
    title: L.uninstallConfirmTitle,
    message: L.uninstallConfirmMessage,
    detail: L.uninstallConfirmDetail,
    buttons: [L.uninstallConfirmCancel, L.uninstallConfirmUninstall],
    defaultId: 0,
    cancelId: 0,
    checkboxLabel: L.uninstallConfirmDeleteDataCheckbox,
    checkboxChecked: false
  })
  if (choice.response !== 1) return
  await runMacUninstall({
    execPath: process.execPath,
    packaged: app.isPackaged,
    platform: process.platform,
    userData: app.getPath('userData'),
    appData: app.getPath('appData'),
    deleteData: choice.checkboxChecked,
    cleanup: cleanupOwnedIntegrations,
    removeData: removeLaresUserData,
    trash: (path) => shell.trashItem(path),
    quit: () => {
      quitting = true
      app.quit()
    }
  })
}

function createTray(): void {
  // Tray wants 16pt (+32px @2x); the raw 1024px icon renders full-size on macOS.
  // ponytail: colored mark, not a monochrome Template image — swap in a white
  // silhouette asset if it blends into dark menu bars.
  const fullIcon = nativeImage.createFromPath(icon)
  const trayImage = nativeImage.createEmpty()
  trayImage.addRepresentation({
    scaleFactor: 1,
    buffer: fullIcon.resize({ width: 16, height: 16 }).toPNG()
  })
  trayImage.addRepresentation({
    scaleFactor: 2,
    buffer: fullIcon.resize({ width: 32, height: 32 }).toPNG()
  })
  tray = new Tray(trayImage)
  tray.setToolTip('Lares')
  updateChecks = createUpdateChecks({
    enabled: () => appConfig.automaticallyCheckForUpdates,
    cache: loadUpdateCache(updateCacheFile()),
    check: (cache) =>
      checkLatestRelease({
        currentVersion: app.getVersion(),
        cache
      }),
    persist: (cache) => saveUpdateCache(updateCacheFile(), cache),
    notify: ({ tag, url }) => {
      if (!Notification.isSupported()) return
      const notification = new Notification({
        title: L.updateAvailableTitle,
        body: L.updateAvailableBody(tag)
      })
      notification.on('click', () => {
        if (isLaresReleaseUrl(url)) {
          void shell.openExternal(url).catch((error) =>
            console.error('[lares] release page could not be opened', error)
          )
        }
      })
      notification.show()
    },
    showInfo: () => {
      void dialog.showMessageBox({
        type: 'info',
        title: L.upToDateTitle,
        message: L.upToDate(app.getVersion())
      })
    },
    showError: (message) => dialog.showErrorBox(L.updateCheckFailed, message),
    log: (message) => console.warn(`[lares] update check failed: ${message}`),
    setInterval: (callback, milliseconds) => setInterval(callback, milliseconds),
    clearInterval: (timer) => clearInterval(timer as ReturnType<typeof setInterval>)
  })
  createTrayShell({
    config: appConfig,
    characters: () => listCharacterPackages(charactersRoot()),
    activeCharacter: () => {
      const selected = activeCharacter()
      return 'error' in selected ? undefined : selected.manifestPath
    },
    switchCharacter: (manifestPath) => switchCharacter(manifestPath),
    importCharacter: (source) => importCharacterPackage(charactersRoot(), source),
    discardImportedCharacter: (manifestPath) =>
      discardManagedCharacter(charactersRoot(), manifestPath),
    openCharacterFolder: () => {
      void shell.openPath(charactersRoot())
    },
    pickImportDirectory: async () => {
      const result = await dialog.showOpenDialog({
        title: L.importCharacterDialogTitle,
        properties: ['openDirectory']
      })
      return result.canceled ? null : (result.filePaths[0] ?? null)
    },
    setMenu: (items) => {
      tray!.setContextMenu(Menu.buildFromTemplate(items as Electron.MenuItemConstructorOptions[]))
    },
    persist: (config) => saveConfig(configFile(), config),
    showError: (title, message) => dialog.showErrorBox(title, message),
    setOverlayVisible: (visible) => {
      if (visible) {
        if (overlayWindow) overlayWindow.show()
        else createOverlayWindow()
      } else {
        overlayWindow?.hide()
      }
    },
    setScale: (scale: Scale) => {
      if (!overlayWindow?.webContents.isDestroyed()) {
        overlayWindow?.webContents.send('overlay:scale', scale)
      }
    },
    getLaunchAtLogin: () => app.getLoginItemSettings().openAtLogin,
    setLaunchAtLogin: (enabled) => app.setLoginItemSettings({ openAtLogin: enabled }),
    resetPosition: resetOverlayPosition,
    onAutomaticUpdatesChanged: () => updateChecks?.automaticPreferenceChanged(),
    onCheckForUpdates: () => updateChecks?.manual(),
    onConfigureAgentIntegrations: () =>
      configureIntegrationsFromTray().catch((error) =>
        dialog.showErrorBox(L.agentIntegrationsResultTitle, errorMessage(error))
      ),
    onLanguageChanged: (language) => {
      setLocale(resolveLocale(language, app.getLocale()))
    },
    quit: () => {
      quitting = true
      app.quit()
    }
  })
}

const removeAdaptersOnly = process.argv.includes('--remove-adapters')
const uninstallOnly = process.argv.includes('--uninstall')

if (removeAdaptersOnly) {
  void cleanupOwnedIntegrations().then(
    () => app.exit(0),
    (error) => {
      console.error('[lares] integration cleanup failed', error)
      app.exit(1)
    }
  )
} else if (uninstallOnly) {
  if (!app.requestSingleInstanceLock()) {
    console.error('[lares] Lares is already running; quit it and run --uninstall again')
    app.exit(2)
  } else {
    void app
      .whenReady()
      .then(() => {
        setLocale(resolveLocale(loadConfig(configFile()).language, app.getLocale()))
        return uninstallFromTray()
      })
      .then(
        () => app.exit(0),
        (error) => {
          dialog.showErrorBox(L.laresCouldNotBeUninstalled, errorMessage(error))
          app.exit(1)
        }
      )
  }
// A5: a second launch exits immediately; the running instance is untouched
// (no focus steal — the spec says unaffected).
} else if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.whenReady().then(() => {
    electronApp.setAppUserModelId('io.lares')
    app.dock?.hide()
    appConfig = loadConfig(configFile())
    setLocale(resolveLocale(appConfig.language, app.getLocale()))

    try {
      const seeded = ensureManagedCharacterLibrary(charactersRoot(), defaultCharacterRoot())
      if (seeded.seeded) console.log('[lares] seeded managed character library')
    } catch (error) {
      const message = errorMessage(error)
      console.error(`[lares] default character unavailable: ${message}`)
      dialog.showErrorBox(L.defaultCharacterUnavailable, message)
    }

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    registerAssetProtocol()
    registerCharacterIpc()
    registerScenarioIpc()
    registerOverlayIpc()
    void startNerves()
    createWindows()
    createTray()
    void updateChecks?.start()

    app.on('activate', function () {
      if (BrowserWindow.getAllWindows().length === 0) createWindows()
      else if (!appConfig.doNotDisturb) overlayWindow?.show()
    })
  })

  app.on('before-quit', () => {
    quitting = true
    updateChecks?.stop()
    stopNerves()
  })
}
