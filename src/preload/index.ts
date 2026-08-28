/**
 * Preload bridge — the only surface the isolated renderer sees of the main
 * process. Everything is namespaced under `window.dshDesktop`; nothing else is
 * exposed (contextIsolation on, nodeIntegration off). Channel names come from
 * `../shared/ipc` so this side cannot drift from the main-process handlers.
 */
import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc'
import type { DshBridgeStatus, DshDesktopBridge, DshStreamHandlers } from '../shared/bridge'

/** Renderer-side stream handler registry, keyed by shell-side stream id. */
const dshStreams = new Map<number, DshStreamHandlers>()
const statusListeners = new Set<(status: DshBridgeStatus) => void>()

/**
 * The main side flushes its pre-id frame buffer BEFORE the streamOpen invoke
 * response comes back, so the first frames of a stream can arrive here ahead
 * of registration. Hold them keyed by id; openStream flushes on resolve.
 */
type PendingStreamItem =
  | { kind: 'frame'; envelope: unknown }
  | { kind: 'ready' }
  | { kind: 'end'; reason?: string }
const pendingStreamItems = new Map<number, PendingStreamItem[]>()

function applyStreamItem(id: number, handlers: DshStreamHandlers, item: PendingStreamItem): void {
  switch (item.kind) {
    case 'frame':
      handlers.onFrame?.(item.envelope)
      return
    case 'ready':
      handlers.onOpen?.()
      return
    case 'end':
      dshStreams.delete(id)
      handlers.onEnd?.(item.reason)
      return
  }
}

function dispatchStreamItem(id: number, item: PendingStreamItem): void {
  const handlers = dshStreams.get(id)
  if (handlers === undefined) {
    const list = pendingStreamItems.get(id)
    if (list !== undefined) list.push(item)
    else pendingStreamItems.set(id, [item])
    // Orphan guard: a renderer reload abandons ids the main side may still
    // forward for; never let the holding pen grow without bound.
    if (pendingStreamItems.size > 16) {
      const oldest = pendingStreamItems.keys().next()
      if (!oldest.done) pendingStreamItems.delete(oldest.value)
    }
    return
  }
  applyStreamItem(id, handlers, item)
}

ipcRenderer.on(IPC.dsh.frame, (_event, payload: { id: number; envelope: unknown }) => {
  dispatchStreamItem(payload.id, { kind: 'frame', envelope: payload.envelope })
})
ipcRenderer.on(IPC.dsh.streamReady, (_event, payload: { id: number }) => {
  dispatchStreamItem(payload.id, { kind: 'ready' })
})
ipcRenderer.on(IPC.dsh.streamEnd, (_event, payload: { id: number; reason?: string }) => {
  dispatchStreamItem(payload.id, { kind: 'end', reason: payload.reason })
})
ipcRenderer.on(IPC.dsh.status, (_event, payload: { status: DshBridgeStatus }) => {
  statusListeners.forEach((cb) => cb(payload.status))
})

const bridge: DshDesktopBridge = {
  version: '0.1.0',
  platform: process.platform,
  minimize: () => ipcRenderer.send(IPC.window.minimize),
  maximize: () => ipcRenderer.send(IPC.window.maximize),
  close: () => ipcRenderer.send(IPC.window.close),
  isMaximized: () => ipcRenderer.invoke(IPC.window.isMaximized),
  /** Renderer signals first paint done and the glass is showing. */
  ready: () => ipcRenderer.send(IPC.shell.ready),
  /** Renderer signals the startup animation finished -> main view. */
  transition: () => ipcRenderer.send(IPC.shell.transition),
  dsh: {
    status: () => ipcRenderer.invoke(IPC.dsh.statusGet) as Promise<DshBridgeStatus>,
    onStatus: (cb) => {
      statusListeners.add(cb)
      return () => {
        statusListeners.delete(cb)
      }
    },
    invoke: (method, payload) => ipcRenderer.invoke(IPC.dsh.invoke, method, payload),
    openStream: async (stream, payload, handlers: DshStreamHandlers) => {
      const id = (await ipcRenderer.invoke(IPC.dsh.streamOpen, stream, payload)) as number
      dshStreams.set(id, handlers)
      // Replay anything that beat the invoke response (see pendingStreamItems).
      const pending = pendingStreamItems.get(id)
      if (pending !== undefined) {
        pendingStreamItems.delete(id)
        for (const item of pending) applyStreamItem(id, handlers, item)
      }
      return id
    },
    abortStream: (id) => {
      dshStreams.delete(id)
      ipcRenderer.send(IPC.dsh.streamAbort, id)
    },
  },
}

contextBridge.exposeInMainWorld('dshDesktop', bridge)
