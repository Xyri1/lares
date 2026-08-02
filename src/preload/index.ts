import { contextBridge, ipcRenderer } from 'electron'

const lares = {
  getCharacter: (): Promise<CharacterPayload> => ipcRenderer.invoke('character:get'),
  getOverlayScale: (): Promise<number> => ipcRenderer.invoke('overlay:scale:get'),
  onOverlayScale: (cb: (scale: number) => void): void => {
    ipcRenderer.on('overlay:scale', (_event, scale: number) => cb(scale))
  },
  reportInventory: (params: unknown[], compatibility: unknown): void => {
    ipcRenderer.send('body:inventory', params, compatibility)
  },
  onCharacterPrepare: (cb: (request: CharacterPrepareRequest) => void): void => {
    ipcRenderer.on('character:prepare', (_event, request: CharacterPrepareRequest) => cb(request))
  },
  reportCharacterPrepared: (result: CharacterPrepareResult): void => {
    ipcRenderer.send('character:prepared', result)
  },
  onCharacterCommit: (cb: (request: CharacterCommitRequest) => void): void => {
    ipcRenderer.on('character:commit', (_event, request: CharacterCommitRequest) => cb(request))
  },
  reportCharacterCommitted: (result: CharacterCommitResult): void => {
    ipcRenderer.send('character:commit-result', result)
  },
  onCharacterRollback: (cb: (id: number) => void): void => {
    ipcRenderer.on('character:rollback', (_event, id: number) => cb(id))
  },
  onCharacterFinalize: (cb: (id: number) => void): void => {
    ipcRenderer.on('character:finalize', (_event, id: number) => cb(id))
  },
  getCharacterDecision: (id: number): Promise<CharacterDecision> =>
    ipcRenderer.invoke('character:decision', id),
  onCharacterCancel: (cb: (id: number) => void): void => {
    ipcRenderer.on('character:cancel', (_event, id: number) => cb(id))
  },
  playScenario: (
    name: string,
    seed: number,
    speed: number,
    presets?: StagePresets
  ): Promise<ScenarioPlayResult> => ipcRenderer.invoke('scenario:play', name, seed, speed, presets),
  stopScenario: (): Promise<ControlResult> => ipcRenderer.invoke('scenario:stop'),
  pauseScenario: (): Promise<ControlResult> => ipcRenderer.invoke('scenario:pause'),
  resumeScenario: (): Promise<ControlResult> => ipcRenderer.invoke('scenario:resume'),
  setScenarioSpeed: (speed: number): Promise<ControlResult> =>
    ipcRenderer.invoke('scenario:setSpeed', speed),
  seekScenario: (tMs: number): Promise<ControlResult> => ipcRenderer.invoke('scenario:seek', tMs),
  listCues: (): Promise<CueListEntry[]> => ipcRenderer.invoke('cues:list'),
  onAffectUpdate: (cb: (feed: AffectFeed) => void): void => {
    ipcRenderer.on('affect:update', (_event, feed: AffectFeed) => cb(feed))
  },
  onAuthoringPreview: (cb: (preview: AuthoringPreview) => void): void => {
    ipcRenderer.on('authoring:preview', (_event, preview: AuthoringPreview) => cb(preview))
  },
  onAuthoringRevert: (cb: () => void): void => {
    ipcRenderer.on('authoring:revert', () => cb())
  },
  onScenarioSeeked: (cb: (history: AffectFeed[]) => void): void => {
    ipcRenderer.on('scenario:seeked', (_event, history: AffectFeed[]) => cb(history))
  },
  onScenarioEnd: (cb: () => void): void => {
    ipcRenderer.on('scenario:end', () => cb())
  },
  onScenarioStopped: (cb: () => void): void => {
    ipcRenderer.on('scenario:stopped', () => cb())
  },
  sendSynthTrace: (linesByStage: Record<string, string[]>): void => {
    ipcRenderer.send('scenario:synthTrace', linesByStage)
  },
  setAbMode: (on: boolean): Promise<ControlResult> => ipcRenderer.invoke('window:abMode', on),
  fitToModel: (size: { width: number; height: number }): Promise<ControlResult> =>
    ipcRenderer.invoke('window:fitToModel', size),
  reportPointer: (overBody: boolean): void => {
    ipcRenderer.send('stage:pointer', overBody)
  },
  dragStart: (at: { x: number; y: number }): void => {
    ipcRenderer.send('window:dragStart', at)
  },
  dragMove: (at: { x: number; y: number }): void => {
    ipcRenderer.send('window:dragMove', at)
  },
  dragEnd: (): void => {
    ipcRenderer.send('window:dragEnd')
  },
  onIntegrationsState: (cb: (state: IntegrationsState) => void): void => {
    ipcRenderer.on('integrations:state', (_event, state: IntegrationsState) => cb(state))
  },
  integrationsAction: (action: IntegrationsAction): void => {
    ipcRenderer.send('integrations:action', action)
  }
}

contextBridge.exposeInMainWorld('lares', lares)
