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
import {
  existsSync,
  mkdirSync,
  realpathSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { removeClaudeCode } from './adapters/claude-code/writer'
import { removeCodexHooks } from './adapters/codex/hooks'
import { writeForwarderShim } from './adapters/shim'
import {
  applyExp3,
  parseExp3File,
  parseModelCdi3File,
  type Exp3Parameter
} from './characters/exp3'
import {
  mapCue as mapCharacterCue,
  saveExpression as saveCharacterExpression,
  updateExpression as updateCharacterExpression
} from './characters/authoring'
import {
  loadCharacter,
  mergeRuntimeCompatibility,
  type CueDefinition,
  type ManifestResult
} from './characters/manifest'
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
import { calibrationLabel } from './calibration'
import { DEFAULT_CONFIG, loadConfig, saveConfig, type AppConfig, type Scale } from './config'
import {
  CANONICAL_CUES,
  performanceInventory,
  resolveCanonicalCue,
  statusMappings,
  type CanonicalCue,
  type CueMappings
} from './cues'
import { DensityLog } from './densityLog'
import { errorMessage } from './errors'
import { L, resolveLocale, setLocale } from './strings'
import {
  configureAgentIntegrations,
  manualCommands,
  runAgentIntegrationCommand,
  type AgentIntegrationReport,
  type Harness
} from './integrations'
import {
  Nerves,
  parseInventory,
  type ParamInfo,
  type PreparedNervesCharacter
} from './nerves'
import {
  clampToWorkArea,
  loadPosition,
  parsePoint,
  savePosition,
  type Point,
  type Rect
} from './position'
import { productBodyTargets } from './productBody'
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
import {
  createTrayShell,
  hydrateInitialCharacter,
  type TrayShell
} from './shell'
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
let nervesServer: ReturnType<typeof createServer> | null = null
let nervesTick: ReturnType<typeof setInterval> | null = null
let densityLog: DensityLog | null = null
let characterInventoryErrorShown = false
let selectedCharacter:
  | CharacterPackage
  | { ok: false; error: string }
  | null = null
let characterSwitcher: CharacterSwitcher | null = null
let characterAssets: CharacterAssetState | null = null
let characterLoadBroker: CharacterLoadBroker | null = null
let appConfig: AppConfig = { ...DEFAULT_CONFIG }
let tray: Tray | null = null
let trayShell: TrayShell | null = null
let updateChecks: ReturnType<typeof createUpdateChecks> | null = null
let quitting = false

// Dev A/B is a scenario harness, not a second product body. Scenario playback
// still fans out for comparison; the normal live feed below targets only the overlay.
function broadcastScenarioFeed(feed: AffectFeedMessage): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.webContents.isDestroyed()) win.webContents.send('affect:update', feed)
  }
}

function sendLiveFeed(feed: AffectFeedMessage): void {
  for (const win of productBodyTargets(overlayWindow, BrowserWindow.getAllWindows())) {
    if (!win.webContents.isDestroyed()) win.webContents.send('affect:update', feed)
  }
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

function activeCalibrationReport() {
  const selected = activeCharacter()
  return 'error' in selected ? null : selected.character.report
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

function cueSource(cue: CueDefinition): 'bundled' | 'authored' | 'raw' {
  if ('params' in cue) return 'raw'
  return 'expression' in cue && cue.expression.startsWith('authored/') ? 'authored' : 'bundled'
}

function cueSources(
  cues: Readonly<Record<string, CueDefinition>>
): Record<string, 'bundled' | 'authored' | 'raw'> {
  return Object.fromEntries(Object.entries(cues).map(([name, cue]) => [name, cueSource(cue)]))
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

function cuePayload(selected: CharacterPackage, candidateId?: number) {
  const { character, manifestPath } = selected
  return Object.entries(character.live2d.cues ?? {}).map(([name, cue]) => {
    const coord = character.expressions[name] ?? null
    const base = {
      name,
      valence: coord?.valence ?? null,
      arousal: coord?.arousal ?? null
    }
    if ('params' in cue) return { ...base, params: cue.params }
    if ('motion' in cue) {
      return {
        ...base,
        motion: assetUrl(relative(dirname(manifestPath), resolve(dirname(manifestPath), cue.motion)), candidateId)
      }
    }
    return base
  })
}

interface PreparedCharacterFiles {
  cueDefinitions: Record<string, CueDefinition>
  names: ReadonlyMap<string, string>
  sources: Record<string, 'bundled' | 'authored' | 'raw'>
  expressions: ReadonlyMap<string, Exp3Parameter[]>
}

function prepareCharacterFiles(candidate: CharacterPackage): PreparedCharacterFiles {
  const cueDefinitions = candidate.character.live2d.cues ?? {}
  const names = parseModelCdi3File(
    candidate.character.live2d.model,
    dirname(candidate.manifestPath)
  )
  const expressions = new Map<string, Exp3Parameter[]>()
  for (const [cue, definition] of Object.entries(cueDefinitions)) {
    if (!('expression' in definition)) continue
    const result = parseExp3File(resolve(dirname(candidate.manifestPath), definition.expression), names)
    if (!result.ok) {
      throw new Error(`Cannot prepare cue ${JSON.stringify(cue)}: ${result.error}`)
    }
    expressions.set(cue, result.parameters)
  }
  return {
    cueDefinitions,
    names,
    sources: cueSources(cueDefinitions),
    expressions
  }
}

function bodyPreparePayload(candidate: CharacterPackage, id: number) {
  return {
    id,
    character: {
      ok: true as const,
      name: candidate.character.name,
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
          : {})
      }
    },
    cues: cuePayload(candidate, id).filter(
      (cue) => 'params' in cue || 'motion' in cue
    )
  }
}

function bodyCommitPayload(
  candidate: CharacterPackage,
  id: number,
  prepared: PreparedNervesCharacter
) {
  const motionUrls = new Map(
    cuePayload(candidate, id).flatMap((cue) =>
      'motion' in cue && typeof cue.motion === 'string' ? [[cue.name, cue.motion]] : []
    )
  )
  const cues: Array<
    { name: string; params: Record<string, number> } | { name: string; motion: string }
  > = []
  for (const [name, playback] of prepared.resolvedCues) {
    if ('params' in playback) {
      cues.push({ name, params: playback.params })
      continue
    }
    const motion = motionUrls.get(name)
    if (motion) cues.push({ name, motion })
  }
  return {
    id,
    cues
  }
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} arguments must be an object`)
  }
  return value as Record<string, unknown>
}

// Range overshoot is NOT an error: exp3 files legitimately exceed declared
// ranges (rigger saturation trick) and every Live2D runtime clamps at set
// time — so do the engine and the body. Only unknown ids mark a broken package.
function rejectUnknownParams(
  cue: string,
  params: Readonly<Record<string, number>>,
  inventory: ReadonlyMap<string, ParamInfo>
): void {
  const unknown = Object.keys(params).filter((id) => !inventory.has(id))
  if (unknown.length) {
    throw new Error(
      `Cue ${JSON.stringify(cue)}: unknown parameter ${unknown.map((id) => JSON.stringify(id)).join(', ')}`
    )
  }
}

function reportCharacterInventoryIssues(): void {
  const issues = liveNerves?.cueValidationErrors() ?? []
  if (!issues.length) return
  const message = issues.join('\n')
  console.error(`[lares] character parameter validation failed:\n${message}`)
  if (!characterInventoryErrorShown) {
    characterInventoryErrorShown = true
    dialog.showErrorBox(L.characterPackageInvalid, message)
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
  let cueDefinitions = character?.live2d.cues ?? {}
  let names =
    character && currentSelection
      ? parseModelCdi3File(character.live2d.model, dirname(currentSelection.manifestPath))
      : new Map<string, string>()
  liveNerves = new Nerves(character?.name ?? 'No character', character?.expressions ?? {}, Date.now(), undefined, {
    cueSources: cueSources(cueDefinitions),
    resolveHookCue: (cue) =>
      currentSelection?.character.report.missingCues.length === 0
        ? currentSelection.character.cueMappings[cue]
        : undefined,
    resolveCue: (cue, defaults, inventory) => {
      const definition = cueDefinitions[cue]
      if (!definition) return undefined
      if ('params' in definition) {
        rejectUnknownParams(cue, definition.params, inventory)
        return { params: definition.params }
      }
      if ('motion' in definition) return { motion: definition.motion }
      const result = parseExp3File(
        resolve(dirname(currentSelection?.manifestPath ?? ''), definition.expression),
        names
      )
      if (!result.ok) {
        console.error(`[lares] cannot resolve cue ${JSON.stringify(cue)}: ${result.error}`)
        return undefined
      }
      rejectUnknownParams(
        cue,
        Object.fromEntries(result.parameters.map((parameter) => [parameter.id, parameter.value])),
        inventory
      )
      return { params: applyExp3(result.parameters, defaults) }
    },
    preview: (value) => broadcast('authoring:preview', value),
    revertPreview: () => broadcast('authoring:revert')
  })
  const refreshCharacterState = (): Extract<ManifestResult, { ok: true }> => {
    if (!currentSelection) throw new Error('No active character')
    const fresh = loadCharacter(currentSelection.manifestPath)
    if (!fresh.ok) throw new Error(fresh.error)
    for (const cue of Object.keys(cueDefinitions)) delete cueDefinitions[cue]
    Object.assign(cueDefinitions, fresh.live2d.cues ?? {})
    currentSelection.character = fresh
    liveNerves!.reloadCues(fresh.expressions, cueSources(cueDefinitions))
    return fresh
  }
  // 011-D12: the canonical vocabulary stops here. Mappings and readiness ride
  // on the active selection, so they change atomically with the character.
  const activeMappings = (): CueMappings => currentSelection?.character.cueMappings ?? {}
  const activeMissing = (): readonly CanonicalCue[] =>
    currentSelection?.character.report.missingCues ?? CANONICAL_CUES
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
          const prepared = liveNerves!.prepareCharacter(
            candidate.character.name,
            candidate.character.expressions,
            files.sources,
            namedInventory,
            (cue, defaults, bodyInventory) => {
              const definition = files.cueDefinitions[cue]
              if (!definition) return undefined
              if ('params' in definition) {
                rejectUnknownParams(cue, definition.params, bodyInventory)
                return { params: definition.params }
              }
              if ('motion' in definition) return { motion: definition.motion }
              const parameters = files.expressions.get(cue)
              if (!parameters) return undefined
              rejectUnknownParams(
                cue,
                Object.fromEntries(parameters.map((parameter) => [parameter.id, parameter.value])),
                bodyInventory
              )
              return { params: applyExp3(parameters, defaults) }
            }
          )
          if (prepared.cueErrors.length) throw new Error(prepared.cueErrors.join('\n'))
          return {
            files,
            nerves: prepared,
            body: bodyCommitPayload(candidate, id, prepared)
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
            body: ReturnType<typeof bodyCommitPayload>
          }
        ) => {
          selectedCharacter = candidate
          currentSelection = candidate
          cueDefinitions = state.files.cueDefinitions
          names = state.files.names
          characterInventoryErrorShown = false
          liveNerves!.commitCharacter(state.nerves)
          stopScenarioPlayback()
        }
      }
    )
  }
  densityLog?.recordBaseline(liveNerves.status(Date.now()).sessions.baseline, Date.now())
  nervesServer = createServer({
    ingest: (envelope, nowMs) => {
      liveNerves!.ingest(envelope, nowMs)
      densityLog?.recordBaseline(liveNerves!.status(nowMs).sessions.baseline, nowMs)
    },
    emote: (args, source, nowMs) => {
      const raw = object(args, 'emote')
      if (!Object.hasOwn(raw, 'cue')) {
        const result = liveNerves!.emote(raw, source, nowMs)
        densityLog?.recordEmote(source, raw, result, nowMs)
        return result
      }
      const { cue, performance } = resolveCanonicalCue(raw.cue, activeMappings(), activeMissing())
      const result = liveNerves!.emote({ ...raw, cue: performance }, source, nowMs)
      densityLog?.recordEmote(source, { ...raw, cue, performance }, result, nowMs)
      return {
        status: result.status,
        cue,
        performance,
        ...(result.warning === undefined ? {} : { warning: result.warning })
      }
    },
    listPerformances: () =>
      performanceInventory(liveNerves!.listCues(), cueDefinitions, activeMappings()),
    status: (nowMs) => ({
      ...liveNerves!.status(nowMs),
      ...statusMappings(activeMappings(), activeMissing())
    }),
    listParameters: () => liveNerves!.listParameters(),
    previewExpression: (args, nowMs) => liveNerves!.previewExpression(args, nowMs),
    mapCue: (raw) => {
      if (!currentSelection) throw new Error('No active character')
      const args = object(raw, 'map_cue')
      const result = mapCharacterCue(currentSelection.manifestPath, args.cue, args.performance)
      if (!result.ok) throw new Error(result.error)
      refreshCharacterState()
      trayShell?.refresh()
      return {
        status: 'mapped',
        cue: args.cue,
        performance: args.performance,
        missing_cues: result.report.missingCues
      }
    },
    saveExpression: (raw) => {
      if (!currentSelection) throw new Error('No active character')
      const args = object(raw, 'save_expression')
      const params = liveNerves!.clampParams(args.params)
      const result = saveCharacterExpression(
        currentSelection.manifestPath,
        args.name as string,
        params,
        args.affect as { valence: number; arousal: number }
      )
      if (!result.ok) throw new Error(result.error)
      refreshCharacterState()
      trayShell?.refresh()
      return { saved: args.name, report: result.report }
    },
    updateExpression: (raw) => {
      if (!currentSelection) throw new Error('No active character')
      const args = object(raw, 'update_expression')
      const params = args.params === undefined ? undefined : liveNerves!.clampParams(args.params)
      const result = updateCharacterExpression(currentSelection.manifestPath, args.name as string, {
        ...(args.affect === undefined
          ? {}
          : { affect: args.affect as { valence: number; arousal: number } }),
        ...(params === undefined ? {} : { params })
      })
      if (!result.ok) throw new Error(result.error)
      refreshCharacterState()
      trayShell?.refresh()
      return { updated: args.name, report: result.report }
    }
  })

  try {
    const port = await nervesServer.start(configuredPort())
    const directory = join(homedir(), '.lares')
    mkdirSync(directory, { recursive: true })
    writeFileSync(runtimeFile(), JSON.stringify({ version: 1, port, pid: process.pid }))
    await syncAdapters()
    nervesTick = setInterval(() => {
      const nowMs = Date.now()
      liveNerves!.tick(nowMs)
      densityLog?.recordBaseline(liveNerves!.status(nowMs).sessions.baseline, nowMs)
      if (activePlayback === null) {
        sendLiveFeed(feedMessage(liveNerves!.snapshot(), Math.floor(nowMs / 100)))
      }
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
    if (accepted) reportCharacterInventoryIssues()
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

  ipcMain.handle('cues:list', () => {
    const selected = activeCharacter()
    if ('error' in selected) return []
    return cuePayload(selected)
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
        onFeed: broadcastScenarioFeed,
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

  ipcMain.handle('scenario:stop', () => {
    stopScenarioPlayback()
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
const configFile = (): string => join(app.getPath('userData'), 'config.json')
const updateCacheFile = (): string => join(app.getPath('userData'), 'updates.json')

function integrationLabel(harness: Harness): string {
  return harness === 'claude' ? 'Claude Code' : 'Codex'
}

function integrationResult(report: AgentIntegrationReport): {
  message: string
  detail: string
  manualCommands: string[]
} {
  const manual: string[] = []
  const messages = report.harnesses.map((result) => {
    const label = integrationLabel(result.harness)
    if (result.status === 'configured') return L.agentIntegrationConfigured(label)
    if (result.status === 'already-configured') return L.agentIntegrationAlreadyConfigured(label)
    manual.push(...manualCommands(result.harness))
    return result.status === 'missing'
      ? L.agentIntegrationMissing(label)
      : L.agentIntegrationFailed(
          label,
          result.error ??
            (result.reason === 'verification'
              ? L.agentIntegrationsVerificationFailed
              : L.agentIntegrationsUnknownError)
        )
  })
  const next = report.harnesses
    .filter((result) => result.status === 'configured' || result.status === 'already-configured')
    .map((result) =>
      result.harness === 'claude' ? L.agentIntegrationsClaudeNext : L.agentIntegrationsCodexNext
    )
  return { message: messages.join('\n'), detail: next.join('\n'), manualCommands: manual }
}

async function configureIntegrationsFromTray(): Promise<void> {
  const report = await configureAgentIntegrations({
    confirm: async () => {
      const choice = await dialog.showMessageBox({
        type: 'question',
        title: L.agentIntegrationsConfirmTitle,
        message: L.agentIntegrationsConfirmMessage,
        detail: L.agentIntegrationsConfirmDetail,
        buttons: [L.agentIntegrationsCancel, L.agentIntegrationsConfigure],
        defaultId: 0,
        cancelId: 0
      })
      return choice.response === 1
    },
    run: runAgentIntegrationCommand
  })
  if (!report.confirmed) return
  const result = integrationResult(report)
  const choice = await dialog.showMessageBox({
    type: result.manualCommands.length ? 'warning' : 'info',
    title: L.agentIntegrationsResultTitle,
    message: result.message,
    detail: result.detail,
    buttons: result.manualCommands.length
      ? [L.agentIntegrationsCopyCommands, L.agentIntegrationsDone]
      : [L.agentIntegrationsDone],
    defaultId: result.manualCommands.length ? 1 : 0,
    cancelId: result.manualCommands.length ? 1 : 0
  })
  if (result.manualCommands.length && choice.response === 0) {
    clipboard.writeText(result.manualCommands.join('\n'))
  }
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
  trayShell = createTrayShell({
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
    calibrationStatus: () => {
      const report = activeCalibrationReport()
      return report ? calibrationLabel(report) : L.calibrationUnavailable
    },
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
