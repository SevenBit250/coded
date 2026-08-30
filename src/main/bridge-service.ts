/**
 * Bridge service (main process): the thin seam between the renderer, the
 * backend plugin system, and the CodedBridge client.
 *
 * Backend-agnostic by construction: adapter plugins are discovered through
 * the backends loader (directory packages with a manifest), the selected one
 * is driven by the lifecycle manager (start / auto-restart / heartbeat), and
 * a BridgeClient is (re)targeted at whatever pipe endpoint the binding
 * reports. All backend knowledge lives in the plugins — the dsh binding is
 * coded-adapter's packages/backend; this file's only concerns are wiring and
 * status derivation.
 */
import { app, BrowserWindow, ipcMain } from 'electron'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { IPC } from '../shared/ipc'
import type { BridgeStatus } from '../shared/bridge'
import { BridgeClient } from './bridge-client'
import type { StreamHandlers } from './bridge-client'
import { backendScope, logBridge, logService } from './logger'
import { scanAdapters } from './backends/loader'
import { BackendManager } from './backends/manager'
import type { BackendStatus, ScannedBackend } from './backends/types'

let manager: BackendManager | null = null
let client: BridgeClient | null = null
let clientPipePath: string | null = null
let backendStatus: BackendStatus = 'starting'
let bridgeStatus: 'connecting' | 'connected' | 'disconnected' | 'stopped' = 'disconnected'
let statusValue: BridgeStatus = 'starting'

/** Derived lifecycle: backend gates everything, bridge rides on top of it. */
function recomputeStatus(): void {
  let next: BridgeStatus
  if (backendStatus === 'failed') next = 'failed'
  else if (backendStatus === 'exited') next = 'runtime-exited'
  else if (backendStatus === 'starting') next = 'starting'
  else next = bridgeStatus === 'connected' ? 'bridge-connected' : 'bridge-disconnected'
  if (next === statusValue) return
  statusValue = next
  logService.info(`status -> ${next}`)
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(IPC.bridge.status, { status: next })
  }
}

function registerBridgeIpc(): void {
  ipcMain.handle(IPC.bridge.statusGet, () => statusValue)
  ipcMain.handle(IPC.bridge.capabilitiesGet, () => client?.capabilities() ?? [])
  ipcMain.handle(IPC.bridge.invoke, (_event, method: string, payload: unknown) => {
    if (client === null) throw new Error('bridge not started')
    return client.call(method, payload).catch((error: unknown) => {
      logService.warn(`invoke ${method} failed: ${String(error)}`)
      throw error
    })
  })

  // Frames may arrive before the openStream invoke resolves back to the
  // renderer (the adapter replays fast), so buffer until the id is known.
  ipcMain.handle(IPC.bridge.streamOpen, (event, stream: 'events', payload: unknown) => {
    if (client === null) throw new Error('bridge not started')
    const sender = event.sender
    let id = -1
    const buffered: { ready: boolean; envelope: unknown }[] = []
    const deliver = (channel: string, payload2: unknown): void => {
      if (!sender.isDestroyed()) sender.send(channel, payload2)
    }
    const handlers: StreamHandlers = {
      onFrame: (envelope) => {
        if (id === -1) buffered.push({ ready: false, envelope })
        else deliver(IPC.bridge.frame, { id, envelope })
      },
      onOpen: () => {
        if (id === -1) buffered.push({ ready: true, envelope: null })
        else deliver(IPC.bridge.streamReady, { id })
      },
      onEnd: (reason) => {
        logService.info(`stream ${stream} ended${reason !== undefined && reason !== '' ? `: ${reason}` : ''}`)
        if (id !== -1) deliver(IPC.bridge.streamEnd, { id, reason })
      },
    }
    logService.info(`streamOpen ${stream}`)
    return client.openStream(stream, payload, handlers).then((streamId) => {
      id = streamId
      for (const item of buffered) {
        if (item.ready) deliver(IPC.bridge.streamReady, { id })
        else deliver(IPC.bridge.frame, { id, envelope: item.envelope })
      }
      return id
    })
  })

  ipcMain.on(IPC.bridge.streamAbort, (_event, id: number) => {
    logService.info(`streamAbort ${String(id)}`)
    client?.abortStream(id)
  })
}

/** (Re)target the CB client at a binding-reported pipe. A restart may mint a
 *  fresh endpoint; the old client is torn down (failing the renderer's
 *  in-flight work) and the renderer's reconnect/自愈 path rebuilds from the
 *  next connected broadcast. */
async function ensureClient(pipePath: string): Promise<void> {
  if (client !== null && clientPipePath === pipePath) return
  const old = client
  client = null
  await old?.stop()
  clientPipePath = pipePath
  const next = new BridgeClient({
    pipePath,
    version: app.getVersion(),
    onStatus: (status) => {
      bridgeStatus = status
      recomputeStatus()
    },
    log: (message) => logBridge.info(message),
  })
  client = next
  // Liveness probe for the manager's watchdog; cleared with the client.
  manager?.setProbe(() => next.call('coded.ping', {}).then(() => undefined))
  next.start()
}

/** Adapter directories: user install point, env override, dev checkout. */
function adapterDirs(): string[] {
  const dirs = [join(app.getPath('userData'), 'adapters')]
  const fromEnv = process.env['CODED_ADAPTERS_DIR']
  if (fromEnv !== undefined && fromEnv !== '') dirs.push(fromEnv)
  // Dev default: the adapter repo sits beside the shell repo in the workspace.
  const dev = resolve(__dirname, '../../../coded-adapter/packages/backend')
  if (existsSync(dev)) dirs.push(dev)
  return dirs
}

function bootstrapFailed(message: string): void {
  logService.error(message)
  backendStatus = 'failed'
  recomputeStatus()
}

/** Discover adapters, start the selected backend, connect the bridge. Never
 *  throws: failures land in the status broadcast for the renderer to present. */
export function startBridgeService(): void {
  registerBridgeIpc()
  void (async () => {
    const found = await scanAdapters(adapterDirs(), {
      warn: (message) => logService.warn(message),
      info: (message) => logService.info(message),
    })
    if (found.size === 0) {
      bootstrapFailed('no backend adapters discovered (searched userData/adapters, CODED_ADAPTERS_DIR, dev checkout)')
      return
    }
    const envId = process.env['CODED_BACKEND']
    let selected: ScannedBackend | undefined
    if (envId !== undefined && envId !== '') {
      selected = found.get(envId)
      if (selected === undefined) {
        bootstrapFailed(`CODED_BACKEND=${envId} not found; available: ${[...found.keys()].join(', ')}`)
        return
      }
    } else if (found.size === 1) {
      selected = [...found.values()][0]
    } else {
      bootstrapFailed(`multiple adapters available (${[...found.keys()].join(', ')}); set CODED_BACKEND to choose`)
      return
    }
    logService.info(`backend "${selected.manifest.id}" (${selected.manifest.label}) from ${selected.dir}`)
    manager = new BackendManager({
      onStatus: (status) => {
        backendStatus = status
        recomputeStatus()
      },
      onLog: (line) => backendScope(selected!.manifest.id).info(line),
      onPipePath: (pipePath) => {
        void ensureClient(pipePath)
      },
      log: (message) => logService.info(`[${selected!.manifest.id}] ${message}`),
    })
    await manager.start(selected)
  })().catch((error: unknown) => {
    bootstrapFailed(`backend bootstrap failed: ${String(error)}`)
  })
}

/** Idempotent teardown for app quit: stop the manager (binding included),
 *  then the bridge client. */
export async function stopBridgeService(): Promise<void> {
  await manager?.stop()
  await client?.stop()
}
