import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { is } from '@electron-toolkit/utils'
import { registerIpcHandlers } from './ipc'
import { pullFromBackend } from './realm-mods'

// Resolve the app icon. BrowserWindow.icon only accepts raster formats
// (PNG/JPEG/BMP/ICO); on Windows .ico is preferred for the taskbar, with
// .png as a portable fallback everywhere else.
function resolveIconPath(): string | undefined {
  const base = join(__dirname, '../../resources')
  const ico = join(base, 'icon.ico')
  const png = join(base, 'icon.png')
  if (process.platform === 'win32' && existsSync(ico)) return ico
  if (existsSync(png)) return png
  return undefined
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 720,
    show: false,
    frame: false,
    autoHideMenuBar: true,
    icon: resolveIconPath(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.on('ready-to-show', () => win.show())

  // Broadcast maximize/restore state changes so the custom titlebar can swap
  // its icon between "maximize" and "restore".
  const emitMaxState = (): void => {
    if (!win.isDestroyed()) win.webContents.send('window:maximized-change', win.isMaximized())
  }
  win.on('maximize', emitMaxState)
  win.on('unmaximize', emitMaxState)

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

app.whenReady().then(() => {
  registerIpcHandlers()
  createWindow()

  // Refresh the local realm-mods cache from the backend's shared/consensus
  // view. Fire-and-forget; errors are swallowed inside pullFromBackend.
  pullFromBackend()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
