import { contextBridge, ipcRenderer } from 'electron'

const lares = {
  getCharacter: (): Promise<CharacterPayload> => ipcRenderer.invoke('character:get'),
  reportInventory: (params: unknown[]): void => {
    ipcRenderer.send('body:inventory', params)
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
  onScenarioSeeked: (cb: (history: AffectFeed[]) => void): void => {
    ipcRenderer.on('scenario:seeked', (_event, history: AffectFeed[]) => cb(history))
  },
  onScenarioEnd: (cb: () => void): void => {
    ipcRenderer.on('scenario:end', () => cb())
  },
  sendSynthTrace: (linesByStage: Record<string, string[]>): void => {
    ipcRenderer.send('scenario:synthTrace', linesByStage)
  },
  setAbMode: (on: boolean): Promise<ControlResult> => ipcRenderer.invoke('window:abMode', on)
}

contextBridge.exposeInMainWorld('lares', lares)
