/**
 * Bridge service (main process): exposes the CodedBridge to the renderer
 * over IPC and owns the runtime + bridge lifecycle.
 *
 * Flow: spawn the harness CLI as a pure Node child (ELECTRON_RUN_AS_NODE, so
 * dev and the packaged app share one code path), wait for its readiness line,
 * then race the bridge client at the adapter's pipe. Frames and status flow
 * to the renderer; the renderer never sees the pipe or the harness process.
 */
import { app, BrowserWindow, ipcMain } from 'electron'
import { resolve } from 'node:path'
import { IPC } from '../shared/ipc'
import type { BridgeStatus, BridgeStreamHandlers } from '../shared/bridge'
import { BridgeClient } from './bridge-client'
import type { StreamHandlers } from './bridge-client'
import { DshRuntime } from './dsh-runtime'
import { logBridge, logDsh, logService } from './logger'

let runtime: DshRuntime | null = null
let bridge: BridgeClient | null = null
let runtimeStatus: 'starting' | 'ready' | 'exited' | 'failed' = 'starting'
let bridgeStatus: 'connecting' | 'connected' | 'disconnected' | 'stopped' = 'disconnected'
let statusValue: BridgeStatus = 'starting'
const statusListeners = new Set<(status: BridgeStatus) => void>()

/** Derived lifecycle: runtime gates everything, bridge rides on top of it. */
function recomputeStatus(): void {
  let next: BridgeStatus
  if (runtimeStatus === 'failed') next = 'failed'
  else if (runtimeStatus === 'exited') next = 'runtime-exited'
  else if (runtimeStatus === 'starting') next = 'starting'
  else next = bridgeStatus === 'connected' ? 'bridge-connected' : 'bridge-disconnected'
  if (next === statusValue) return
  statusValue = next
  logService.info(`status -> ${next}`)
  for (const cb of statusListeners) cb(next)
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(IPC.bridge.status, { status: next })
  }
}

function registerBridgeIpc(): void {
  ipcMain.handle(IPC.bridge.statusGet, () => statusValue)
  ipcMain.handle(IPC.bridge.capabilitiesGet, () => bridge?.capabilities() ?? [])
  ipcMain.handle(IPC.bridge.invoke, (_event, method: string, payload: unknown) => {
    if (bridge === null) throw new Error('bridge not started')
    return bridge.call(method, payload).catch((error: unknown) => {
      logService.warn(`invoke ${method} failed: ${String(error)}`)
      throw error
    })
  })

  // Frames may arrive before the openStream invoke resolves back to the
  // renderer (the adapter replays fast), so buffer until the id is known.
  ipcMain.handle(IPC.bridge.streamOpen, (event, stream: 'events', payload: unknown) => {
    const sender = event.sender
    let id = -1
    const buffered: { id: number; envelope: unknown }[] = []
    const deliver = (channel: string, payload2: unknown): void => {
      if (!sender.isDestroyed()) sender.send(channel, payload2)
    }
    const handlers: StreamHandlers = {
      onFrame: (envelope) => {
        if (id === -1) buffered.push({ id: -1, envelope })
        else deliver(IPC.bridge.frame, { id, envelope })
      },
      onOpen: () => {
        if (id === -1) buffered.push({ id: -1, envelope: { type: 'bridge/stream-ready' } })
        else deliver(IPC.bridge.streamReady, { id })
      },
      onEnd: (reason) => {
        logService.info(`stream ${stream} ended${reason !== undefined && reason !== '' ? `: ${reason}` : ''}`)
        if (id !== -1) deliver(IPC.bridge.streamEnd, { id, reason })
      },
    }
    logService.info(`streamOpen ${stream}`)
    if (bridge === null) throw new Error('bridge not started')
    return bridge.openStream(stream, payload, handlers).then((streamId) => {
      id = streamId
      for (const item of buffered) {
        if (item.envelope !== null && typeof item.envelope === 'object' && (item.envelope as {type?: string}).type === 'bridge/stream-ready') {
          deliver(IPC.bridge.streamReady, { id })
        } else {
          deliver(IPC.bridge.frame, { id, envelope: item.envelope })
        }
      }
      return id
    })
  })

  ipcMain.on(IPC.bridge.streamAbort, (_event, id: number) => {
    logService.info(`streamAbort ${String(id)}`)
    bridge?.abortStream(id)
  })
}

/** Harness root: env override wins; dev default sits beside this repo. */
function harnessRoot(): string {
  const fromEnv = process.env['DSH_HARNESS_ROOT']
  if (fromEnv !== undefined && fromEnv !== '') return fromEnv
  return resolve(__dirname, '../../../deepseek-harness')
}

/** Start the harness runtime, then the bridge. Never throws: failures land
 *  in the status broadcast for the renderer to present. */
export function startBridgeService(): void {
  registerBridgeIpc()
  // The bridge scope is minted here once per app run (single source of
  // truth): the runtime child learns it through env, the bridge client
  // connects to the same name. Per-run names sidestep the Windows
  // handle-inheritance EADDRINUSE a zombie child would otherwise cause.
  const scope = `p${String(process.pid)}-${Math.random().toString(36).slice(2, 6)}`
  runtime = new DshRuntime({
    harnessRoot: harnessRoot(),
    // Host-only tree (no HTTP/browser surface); readiness is the bridge's own
    // listening line, not a web URL.
    args: ['--profile', 'coded'],
    extraEnv: { DSH_CODED_BRIDGE_SCOPE: scope },
    log: (line) => logDsh.info(line),
  })
  runtime.on('status', (status: 'starting' | 'ready' | 'exited' | 'failed') => {
    runtimeStatus = status
    recomputeStatus()
  })
  void runtime.start().then(() => {
    bridge = new BridgeClient({
      scope,
      version: app.getVersion(),
      onStatus: (status) => {
        bridgeStatus = status
        recomputeStatus()
      },
      log: (message) => logBridge.info(message),
    })
    bridge.start()
  })
}

/** Idempotent teardown for app quit: stop the bridge, then the process tree. */
export async function stopBridgeService(): Promise<void> {
  await bridge?.stop()
  await runtime?.stop()
}
