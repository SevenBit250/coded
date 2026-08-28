/**
 * CodedBridge client for the renderer — typed helpers over
 * `window.dshDesktop.dsh` (see shared/bridge.ts). Deliberately NOT a subclass
 * of any harness client class: the renderer speaks only the CodedBridge
 * private protocol, so harness upgrades cannot reach this code.
 *
 * Wire facts this file knows about (and the adapter passes through verbatim):
 *  - unary responses arrive as full-form ServerResponse documents
 *    ({type:'server-response', rpcId, result:{ok, value|error}});
 *  - downstream frames arrive as full-form ServerRequest documents
 *    ({type:'server-request', rpcId, method, payload}); the mux frame itself
 *    sits in the payload slot, and the ones we care about are
 *    `{type:'session/event', sessionId, event}`.
 */

/** Lifecycle status pushed by the shell (see shared/bridge.ts). */
export type DshStatus = import('../../../shared/bridge').DshBridgeStatus

/** One session/event frame as it crosses the bridge. */
export interface SessionEventFrame {
  type: 'session/event'
  sessionId: string
  /** SessionEvent: payload lives in the `data` slot (e.g. data.chunk). */
  event: { type: string; data?: unknown; [key: string]: unknown }
}

/** The slice of StreamChunk (dsh-llm) this client surfaces. */
export interface TextChunk {
  type: string
  text?: string
}

/** Unwrap a full-form ServerResponse: value on ok, throw on business error. */
function unwrap(serverResponse: unknown): unknown {
  const sr = serverResponse as {
    result?: { ok?: boolean; value?: unknown; error?: { message?: string } }
  }
  if (sr.result?.ok === true) return sr.result.value
  const message = sr.result?.error?.message ?? 'harness rpc failed'
  throw new Error(message)
}

export const dsh = {
  status: (): Promise<DshStatus> => window.dshDesktop.dsh.status(),

  onStatus: (cb: (status: DshStatus) => void): (() => void) =>
    window.dshDesktop.dsh.onStatus(cb),

  /** Harness unary call; resolves with the response `value`. */
  async call(method: string, payload: unknown): Promise<unknown> {
    const value = unwrap(await window.dshDesktop.dsh.invoke(method, payload))
    return value
  },

  /** Connectivity + environment probe (host-side identity). */
  async describe(): Promise<{ version: string; home: string; model: string }> {
    const value = (await dsh.call('host.describe', {})) as {
      version: string
      home: string
      model: string
    }
    return value
  },

  /** First workspace path, or the user home when none is registered. */
  async defaultCwd(): Promise<string> {
    try {
      const value = (await dsh.call('workspace.list', {})) as {
        items: { path: string }[]
      }
      const first = value.items[0]?.path
      if (typeof first === 'string' && first !== '') return first
    } catch {
      // Fall through to home below.
    }
    const { home } = await dsh.describe()
    return home
  },

  /** Create a session rooted at `cwd`; returns the session id. */
  async createSession(cwd: string): Promise<string> {
    const value = (await dsh.call('session.create', { cwd })) as { sessionId: string }
    return value.sessionId
  },

  /** Queue one text prompt into the session. */
  async prompt(sessionId: string, text: string): Promise<void> {
    await dsh.call('session.prompt', {
      sessionId,
      mode: 'queue',
      content: [{ type: 'text', text }],
    })
  },

  /**
   * Subscribe to the mux downstream stream. `onEvent` receives only
   * session/event frames; other frame types (approvals, projections) arrive
   * later through dedicated helpers. `opts.types` is the adapter-side filter
   * (BridgeStreamOpenPayload) — list exactly the frame kinds the handlers
   * consume, so bulky frames (projections) never cross the pipe or IPC.
   */
  async openMux(
    handlers: {
      onEvent: (frame: SessionEventFrame) => void
      onOpen?: () => void
      onEnd?: (reason?: string) => void
    },
    opts?: { types?: string[] },
  ): Promise<number> {
    return window.dshDesktop.dsh.openStream('mux', { types: opts?.types }, {
      onFrame: (envelope) => {
        // Frames arrive wrapped as full-form ServerRequests; the mux frame
        // (the document typed by `method`) sits in the payload slot.
        const e = envelope as { type?: string; payload?: unknown }
        if (e?.type !== 'server-request') return
        const frame = e.payload as { type?: string } | undefined
        if (frame?.type === 'session/event') handlers.onEvent(frame as unknown as SessionEventFrame)
        // Other mux frame kinds (projections, approvals, queue views) get
        // dedicated helpers when a surface needs them.
      },
      onOpen: () => {
        handlers.onOpen?.()
      },
      onEnd: (reason) => {
        handlers.onEnd?.(reason)
      },
    })
  },
}
