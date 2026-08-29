/**
 * CodedBridge pipe client (main process side): NDJSON framing over the local
 * pipe to the harness adapter plugin, with automatic reconnect.
 *
 * Contract mirrors the adapter's server (packages/adapter/src/server.ts in
 * coded-adapter): the adapter opens with hello, the shell echoes, then unary
 * RPCs correlate by shell-minted ids and downstream streams by stream ids.
 * Disconnection rejects in-flight calls, ends every stream (so renderer-side
 * reconnect generations can rebuild), and the client keeps retrying with
 * backoff until `stop()`.
 */

import { connect, type Socket } from 'node:net'
import { once } from 'node:events'
import { defaultPipePath, bridgeFrameSchema, BRIDGE_PROTOCOL_VERSION } from '@coded/bridge-protocol'
import type { BridgeFrame } from '@coded/bridge-protocol'

export type BridgeStatus = 'connecting' | 'connected' | 'disconnected' | 'stopped'

export interface StreamHandlers {
  onFrame: (envelope: unknown) => void
  onOpen?: () => void
  onEnd?: (reason?: string) => void
}

export interface BridgeClientOptions {
  /** Pipe scope (resolves through defaultPipePath) unless pipePath is set. */
  scope?: string
  pipePath?: string
  /** Shell implementation version, reported in hello (informational). */
  version: string
  /** Status transitions (change-only). */
  onStatus?: (status: BridgeStatus) => void
  log?: (message: string) => void
}

const CONNECT_TIMEOUT_MS = 4000
const BACKOFF_START_MS = 500
const BACKOFF_MAX_MS = 5000

interface PendingCall {
  resolve: (payload: unknown) => void
  reject: (error: Error) => void
}

interface OpenStream {
  handlers: StreamHandlers
}

export class BridgeClient {
  private socket: Socket | null = null
  private buffer = ''
  private nextCallId = 1
  private nextStreamId = 1
  private readonly pending = new Map<number, PendingCall>()
  private readonly streams = new Map<number, StreamHandlers>()
  private statusValue: BridgeStatus = 'disconnected'
  private stopped = false
  private loop: Promise<void> | null = null

  constructor(private readonly opts: BridgeClientOptions) {}

  status(): BridgeStatus {
    return this.statusValue
  }

  /** Start the (re)connect loop. Idempotent. */
  start(): void {
    if (this.loop !== null) return
    this.loop = this.runLoop()
  }

  /** Stop reconnecting and drop the current connection. */
  async stop(): Promise<void> {
    this.log('stop() called')
    this.stopped = true
    this.setStatus('stopped')
    this.socket?.destroy()
    if (this.loop !== null) await this.loop.catch(() => {})
  }

  /**
   * Unary RPC. Resolves with the carrier's full-form ServerResponse document;
   * rejects on transport failure (call again after the status returns to
   * connected) or an adapter-side `rpc-err`.
   */
  call(method: string, payload: unknown): Promise<unknown> {
    if (this.stopped) return Promise.reject(new Error('bridge stopped'))
    if (this.statusValue !== 'connected' || this.socket === null) {
      return Promise.reject(new Error('bridge not connected'))
    }
    const id = this.nextCallId++
    return new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.send({ t: 'rpc', id, method, payload })
    })
  }

  /** Open a downstream stream; resolves with the shell-side stream id. */
  openStream(stream: 'events', payload: unknown, handlers: StreamHandlers): Promise<number> {
    if (this.statusValue !== 'connected' || this.socket === null) {
      return Promise.reject(new Error('bridge not connected'))
    }
    const id = this.nextStreamId++
    this.streams.set(id, handlers)
    this.send({ t: 'stream-open', id, stream, payload })
    return Promise.resolve(id)
  }

  abortStream(id: number): void {
    if (this.statusValue !== 'connected') return
    this.send({ t: 'stream-abort', id })
    this.streams.delete(id)
  }

  private setStatus(status: BridgeStatus): void {
    if (this.statusValue === status) return
    this.statusValue = status
    this.opts.onStatus?.(status)
  }

  private log(message: string): void {
    this.opts.log?.(message)
  }

  private async runLoop(): Promise<void> {
    let backoff = BACKOFF_START_MS
    while (!this.stopped) {
      try {
        this.setStatus('connecting')
        await this.connectOnce()
        backoff = BACKOFF_START_MS
        // Socket dropped: fail everything the renderer may hold.
        this.log('connection epoch ended; failing in-flight work')
        this.failAll('connection closed')
      } catch (error) {
        this.log(`connect failed: ${String(error)}`)
        this.failAll(String(error))
      }
      if (this.stopped) break
      this.setStatus('disconnected')
      this.log(`reconnecting in ${String(backoff)}ms`)
      await new Promise((resolve) => setTimeout(resolve, backoff))
      backoff = Math.min(backoff * 2, BACKOFF_MAX_MS)
    }
    this.log('runLoop exited')
  }

  /**
   * One connection epoch: connect, handshake, then pump frames. Resolves when
   * the socket drops (or rejects when the handshake/connect fails).
   */
  private async connectOnce(): Promise<Promise<void>> {
    const pipePath = this.opts.pipePath ?? defaultPipePath(this.opts.scope ?? 'default')
    const socket = connect(pipePath)
    const connectTimeout = setTimeout(() => socket.destroy(), CONNECT_TIMEOUT_MS)
    try {
      await once(socket, 'connect')
    } catch {
      clearTimeout(connectTimeout)
      socket.destroy()
      throw new Error(`pipe connect failed (${pipePath})`)
    }
    clearTimeout(connectTimeout)

    this.socket = socket
    socket.on('error', (error) => this.log(`socket error: ${String(error)}`))
    socket.once('close', (hadError: boolean) => this.log(`socket closed (hadError=${String(hadError)})`))
    const closed = once(socket, 'close').then(() => {})

    // Handshake: adapter opens, we echo. The dispatch feed is NOT attached
    // yet — the adapter's hello would otherwise race into it and be policed
    // as a protocol breach, killing the epoch before it starts.
    const hello = await this.waitForFrame(
      socket,
      (f) => f.t === 'hello',
      () => socket.destroy(),
    )
    if (hello.side !== 'adapter' || hello.proto !== BRIDGE_PROTOCOL_VERSION) {
      socket.destroy()
      throw new Error(`handshake mismatch (proto ${String(hello.proto)})`)
    }
    this.send({ t: 'hello', side: 'shell', proto: BRIDGE_PROTOCOL_VERSION, version: this.opts.version, capabilities: [] })

    // Now attach the feed and drain whatever the handshake wait buffered
    // (a chunk may carry the hello and the first post-handshake frame).
    socket.on('data', (chunk: string) => this.feed(chunk))
    this.feed('')

    // Handshake complete — the epoch is live as of here (the runLoop's await
    // only unblocks when the socket drops, so 'connected' must be set now).
    this.setStatus('connected')

    await closed
    this.socket = null
    return closed
  }

  private waitForFrame(
    socket: Socket,
    match: (frame: BridgeFrame) => boolean,
    onTimeout: () => void,
  ): Promise<Extract<BridgeFrame, { t: 'hello' }>> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup()
        onTimeout()
        reject(new Error('handshake timeout'))
      }, CONNECT_TIMEOUT_MS)
      const onData = (chunk: string): void => {
        this.buffer += chunk
        let index: number
        while ((index = this.buffer.indexOf('\n')) >= 0) {
          const line = this.buffer.slice(0, index)
          this.buffer = this.buffer.slice(index + 1)
          if (line.trim() === '') continue
          let frame: BridgeFrame
          try {
            frame = bridgeFrameSchema.parse(JSON.parse(line))
          } catch {
            this.log('malformed frame during handshake')
            continue
          }
          if (!match(frame)) continue
          cleanup()
          resolve(frame as Extract<BridgeFrame, { t: 'hello' }>)
          return
        }
      }
      const cleanup = (): void => {
        clearTimeout(timeout)
        socket.off('data', onData)
      }
      socket.on('data', onData)
      socket.once('close', () => {
        cleanup()
        reject(new Error('socket closed during handshake'))
      })
    })
  }

  /** Connected-phase NDJSON demux (socket data → frame dispatch). */
  private feed(chunk: string): void {
    this.buffer += chunk
    let index: number
    while ((index = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, index)
      this.buffer = this.buffer.slice(index + 1)
      if (line.trim() === '') continue
      let frame: BridgeFrame
      try {
        frame = bridgeFrameSchema.parse(JSON.parse(line))
      } catch {
        this.log('malformed frame from adapter')
        continue
      }
      this.dispatch(frame)
    }
  }

  private dispatch(frame: BridgeFrame): void {
    switch (frame.t) {
      case 'rpc-ok': {
        const pending = this.pending.get(frame.id)
        if (pending !== undefined) {
          this.pending.delete(frame.id)
          pending.resolve(frame.payload)
        }
        return
      }
      case 'rpc-err': {
        const pending = this.pending.get(frame.id)
        if (pending !== undefined) {
          this.pending.delete(frame.id)
          pending.reject(new Error(frame.error.message))
        }
        return
      }
      case 'stream-ready': {
        this.streams.get(frame.id)?.onOpen?.()
        return
      }
      case 'stream-frame': {
        this.streams.get(frame.id)?.onFrame(frame.envelope)
        return
      }
      case 'stream-end': {
        const handlers = this.streams.get(frame.id)
        if (handlers !== undefined) {
          this.streams.delete(frame.id)
          handlers.onEnd?.(frame.reason)
        }
        return
      }
      // Shell-direction frames must never arrive from the adapter.
      case 'rpc':
      case 'stream-open':
      case 'stream-abort':
      case 'hello':
        this.log(`protocol breach: adapter sent ${frame.t}`)
        this.socket?.destroy()
        return
    }
  }

  /** Reject in-flight calls and end every stream with a reason. */
  private failAll(reason: string): void {
    for (const pending of this.pending.values()) pending.reject(new Error(reason))
    this.pending.clear()
    for (const handlers of this.streams.values()) handlers.onEnd?.(reason)
    this.streams.clear()
  }

  private send(frame: BridgeFrame): void {
    if (this.socket === null || this.socket.destroyed) return
    this.socket.write(`${JSON.stringify(frame)}\n`)
  }
}
