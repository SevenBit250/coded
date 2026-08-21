/**
 * Preload bridge — the only surface the isolated renderer sees of the main
 * process. Everything is namespaced under `window.dshDesktop`; nothing else is
 * exposed (contextIsolation on, nodeIntegration off). Channel names come from
 * `../shared/ipc` so this side cannot drift from the main-process handlers.
 */
import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc'
import type { DshDesktopBridge } from '../shared/bridge'

const bridge: DshDesktopBridge = {
  version: '0.1.0',
  platform: process.platform,
  minimize: () => ipcRenderer.send(IPC.window.minimize),
  maximize: () => ipcRenderer.send(IPC.window.maximize),
  close: () => ipcRenderer.send(IPC.window.close),
  isMaximized: () => ipcRenderer.invoke(IPC.window.isMaximized),
  togglePinned: () => ipcRenderer.invoke(IPC.window.pin),
  /** Renderer signals first paint done and the glass is showing. */
  ready: () => ipcRenderer.send(IPC.shell.ready),
  /** Renderer signals the startup animation finished -> main view. */
  transition: () => ipcRenderer.send(IPC.shell.transition),
}

contextBridge.exposeInMainWorld('dshDesktop', bridge)
