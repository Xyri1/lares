import { contextBridge, ipcRenderer } from 'electron'

const lares = {
  getCharacter: (): Promise<CharacterPayload> => ipcRenderer.invoke('character:get'),
  reportInventory: (params: unknown[]): void => {
    ipcRenderer.send('body:inventory', params)
  }
}

contextBridge.exposeInMainWorld('lares', lares)
