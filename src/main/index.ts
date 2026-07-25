import { app, shell, BrowserWindow, ipcMain, protocol, net } from 'electron'
import { join, relative, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { loadCharacter } from './characters/manifest'

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
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 480,
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
