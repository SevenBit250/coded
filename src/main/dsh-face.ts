/**
 * dsh face wiring (main process): exposes the CodedBridge to the renderer
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
import type { DshBridgeStatus, DshStreamHandlers } from '../shared/bridge'
import { BridgeClient } from './bridge-client'
import type { StreamHandlers } from './bridge-client'
import { DshRuntime } from './dsh-runtime'

let runtime: DshRuntime | null = null
let bridge: BridgeClient | null = null
let runtimeStatus: 'starting' | 'ready' | 'exited' | 'failed' = 'starting'
let bridgeStatus: 'connecting' | 'connected' | 'disconnected' | 'stopped' = 'disconnected'
let dshStatusValue: DshBridgeStatus = 'starting'
const statusListeners = new Set<(status: DshBridgeStatus) => void>()

/** Derived lifecycle: runtime gates everything, bridge rides on top of it. */
function recomputeStatus(): void {
  let next: DshBridgeStatus
  if (runtimeStatus === 'failed') next = 'failed'
  else if (runtimeStatus === 'exited') next = 'runtime-exited'
  else if (runtimeStatus === 'starting') next = 'starting'
  else next = bridgeStatus === 'connected' ? 'bridge-connected' : 'bridge-disconnected'
  if (next === dshStatusValue) return
  dshStatusValue = next
  console.log(`[dsh-face] status -> ${next}`)
  for (const cb of statusListeners) cb(next)
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(IPC.dsh.status, { status: next })
  }
}

function registerDshIpc(): void {
  ipcMain.handle(IPC.dsh.statusGet, () => dshStatusValue)
  ipcMain.handle(IPC.dsh.invoke, (_event, method: string, payload: unknown) => {
    if (bridge === null) throw new Error('bridge not started')
    return bridge.call(method, payload).catch((error: unknown) => {
      console.log(`[dsh-face] invoke ${method} failed: ${String(error)}`)
      throw error
    })
  })

  // Frames may arrive before the openStream invoke resolves back to the
  // renderer (the adapter replays fast), so buffer until the id is known.
  ipcMain.handle(IPC.dsh.streamOpen, (event, stream: 'events', payload: unknown) => {
    const sender = event.sender
    let id = -1
    const buffered: { id: number; envelope: unknown }[] = []
    const deliver = (channel: string, payload2: unknown): void => {
      if (!sender.isDestroyed()) sender.send(channel, payload2)
    }
    const handlers: StreamHandlers = {
      onFrame: (envelope) => {
        if (id === -1) buffered.push({ id: -1, envelope })
        else deliver(IPC.dsh.frame, { id, envelope })
      },
      onOpen: () => {
        if (id === -1) buffered.push({ id: -1, envelope: { type: 'bridge/stream-ready' } })
        else deliver(IPC.dsh.streamReady, { id })
      },
      onEnd: (reason) => {
        console.log(`[dsh-face] stream ${stream} ended${reason !== undefined && reason !== '' ? `: ${reason}` : ''}`)
        if (id !== -1) deliver(IPC.dsh.streamEnd, { id, reason })
      },
    }
    console.log(`[dsh-face] streamOpen ${stream}`)
    if (bridge === null) throw new Error('bridge not started')
    return bridge.openStream(stream, payload, handlers).then((streamId) => {
      id = streamId
      for (const item of buffered) {
        if (item.envelope !== null && typeof item.envelope === 'object' && (item.envelope as {type?: string}).type === 'bridge/stream-ready') {
          deliver(IPC.dsh.streamReady, { id })
        } else {
          deliver(IPC.dsh.frame, { id, envelope: item.envelope })
        }
      }
      return id
    })
  })

  ipcMain.on(IPC.dsh.streamAbort, (_event, id: number) => {
    console.log(`[dsh-face] streamAbort ${String(id)}`)
    bridge?.abortStream(id)
  })
}

/** Renderer-side status subscription (push-based, change-only). */
export function onDshStatus(cb: (status: DshBridgeStatus) => void): () => void {
  statusListeners.add(cb)
  cb(dshStatusValue)
  return () => {
    statusListeners.delete(cb)
  }
}

export function currentDshStatus(): DshBridgeStatus {
  return dshStatusValue
}

export function invokeDsh(method: string, payload: unknown): Promise<unknown> {
  if (bridge === null) return Promise.reject(new Error('bridge not started'))
  return bridge.call(method, payload)
}

export function openDshStream(
  stream: 'events',
  payload: unknown,
  handlers: DshStreamHandlers,
): Promise<number> {
  if (bridge === null) return Promise.reject(new Error('bridge not started'))
  return bridge.openStream(stream, payload, handlers as StreamHandlers)
}

export function abortDshStream(id: number): void {
  bridge?.abortStream(id)
}

/** Harness root: env override wins; dev default sits beside this repo. */
function harnessRoot(): string {
  const fromEnv = process.env['DSH_HARNESS_ROOT']
  if (fromEnv !== undefined && fromEnv !== '') return fromEnv
  return resolve(__dirname, '../../../deepseek-harness')
}

/** Start the harness runtime, then the bridge. Never throws: failures land
 *  in the status broadcast for the renderer to present. */
export function startDshFace(): void {
  registerDshIpc()
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
    log: (line) => console.log(`[dsh] ${line}`),
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
      log: (message) => console.log(`[dsh-bridge] ${message}`),
    })
    bridge.start()
  })
}

/** Idempotent teardown for app quit: stop the bridge, then the process tree. */
export async function stopDshFace(): Promise<void> {
  await bridge?.stop()
  await runtime?.stop()
}
