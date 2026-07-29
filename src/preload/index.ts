import { contextBridge, ipcRenderer } from 'electron'

const lares = {
  getCharacter: (): Promise<CharacterPayload> => ipcRenderer.invoke('character:get'),
  reportInventory: (params: unknown[]): void => {
    ipcRenderer.send('body:inventory', params)
  },
  onCharacterLoad: (cb: (request: CharacterLoadRequest) => void): void => {
    ipcRenderer.on('character:load', (_event, request: CharacterLoadRequest) => cb(request))
  },
  reportCharacterLoad: (result: CharacterLoadResult): void => {
    ipcRenderer.send('character:load-result', result)
  },
  playScenario: (
    name: string,
    seed: number,
    speed: number,
    presets?: StagePresets
  ): Promise<ScenarioPlayResult> => ipcRenderer.invoke('scenario:play', name, seed, speed, presets),
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
  }
}

contextBridge.exposeInMainWorld('lares', lares)
