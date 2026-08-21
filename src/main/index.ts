/**
 * dsh-desktop main process — Plan B desktop shell.
 *
 * Responsibilities:
 *  - Frameless (no system border) window with native Windows acrylic frosted
 *    glass where supported, and a transparent-CSS glass fallback elsewhere.
 *  - Custom window controls (min/max/close) and the titlebar drag region,
 *    because a frameless window has no native controls.
 *  - The startup -> main transition handshake over IPC; the React renderer
 *    drives the animation, this file hosts the wiring.
 *
 * The dsh harness transport / custom-protocol integration is a later step; the
 * main view is a placeholder (Codex-like) so the window chrome can be validated
 * first, and later swapped to host the dsh React client.
 */
import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { IPC } from '../shared/ipc'

/** Window chrome configuration. The frosted-glass values are the ones to
 *  tune by running; everything else here is a window-construction fact. */
interface ChromeConfig {
  /** Frame-less window; the renderer draws its own controls + drag region. */
  frame: boolean
  /**
   * True transparency on non-Windows (CSS rounds the corners). On Windows it
   * is false: DWM will not round a transparent window, and native acrylic
   * corners require a normal (non-transparent) top-level window.
   */
  transparent: boolean
  /** Fully transparent canvas; CSS paints the glass over the material. */
  backgroundColor: string
  /** Native Windows 11 acrylic compositor material when supported. */
  useNativeAcrylic: boolean
  /** OS-rounded corners on Windows 11 (Chromium 105+). */
  roundedCorners: boolean
  /** Initial window width. */
  width: number
  /** Initial window height. */
  height: number
  /** Minimum width the user may resize to. */
  minWidth: number
  /** Minimum height the user may resize to. */
  minHeight: number
}

const CHROME: ChromeConfig = {
  frame: false,
  transparent: process.platform !== 'win32',
  backgroundColor: '#00000000',
  useNativeAcrylic: process.platform === 'win32',
  roundedCorners: true,
  width: 1280,
  height: 820,
  minWidth: 940,
  minHeight: 620,
}

/** Whether devtools are enabled for this launch. */
const isDev = process.argv.includes('--dev')

/** The single BrowserWindow this shell owns. */
let mainWindow: BrowserWindow | null = null

/** Create the frameless desktop window with the acrylic/glass material. */
function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: CHROME.width,
    height: CHROME.height,
    minWidth: CHROME.minWidth,
    minHeight: CHROME.minHeight,
    // Windows: WinUI 3 style title bar — hidden chromeless frame with the
    // system caption buttons (min/max/close, Snap Layouts, red close hover)
    // drawn by Windows through titleBarOverlay. Other platforms: frameless
    // with custom-rendered controls.
    ...(process.platform === 'win32'
      ? {
          titleBarStyle: 'hidden' as const,
          titleBarOverlay: {
            color: '#00000000',
            symbolColor: '#7d828d',
            height: 40,
          },
        }
      : { frame: CHROME.frame }),
    transparent: CHROME.transparent,
    backgroundColor: CHROME.backgroundColor,
    roundedCorners: CHROME.roundedCorners,
    // Native compositor material (Windows only, Chromium 105+). Guarded so
    // other platforms never receive an invalid option; 'acrylic' is the
    // frosted one.
    ...(CHROME.useNativeAcrylic ? { backgroundMaterial: 'acrylic' } : {}),
    show: false,
    hasShadow: true,
    autoHideMenuBar: true,
    title: 'Coded',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
      devTools: isDev,
    },
  })

  win.once('ready-to-show', () => win.show())

  // electron-vite: dev loads the renderer dev server; production loads the
  // built renderer bundle. Without a load call the window never paints.
  const devServerUrl = process.env['ELECTRON_RENDERER_URL']
  if (devServerUrl !== undefined && devServerUrl !== '') {
    void win.loadURL(devServerUrl)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // Open external links in the OS browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow = win
  return win
}

/** Register the custom window-control IPC handlers for the frameless chrome. */
function registerWindowControls(): void {
  ipcMain.on(IPC.window.minimize, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  })
  ipcMain.on(IPC.window.maximize, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win === null) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })
  ipcMain.on(IPC.window.close, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
  })
  ipcMain.handle(IPC.window.isMaximized, (event) => {
    return BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false
  })

  // Lifecycle handshake from the React renderer. `ready` is informational
  // (the window is shown on first paint via ready-to-show); `transition`
  // marks the startup -> main handoff, the seam where the real dsh view will
  // later request a frame change.
  ipcMain.on(IPC.shell.ready, () => {
    /* first paint done */
  })
  ipcMain.on(IPC.shell.transition, () => {
    /* startup -> main handoff; frame change hook for the dsh view */
  })
}

// Single instance per data dir; a second launch focuses the existing window.
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow !== null) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    registerWindowControls()
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
