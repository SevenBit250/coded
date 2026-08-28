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
  /** Host-computed tool presentation, present on tool/call + tool/result. */
  view?: { for: 'call' | 'result'; view: { card?: string; title?: string; [key: string]: unknown } }
}

/** The slice of StreamChunk (dsh-llm) this client surfaces. */
export interface TextChunk {
  type: string
  text?: string
}

/** approval/requested mux frame (payload slot; the answerable id rides the
 *  envelope's rpcId, handed to handlers alongside). */
export interface ApprovalRequestedFrame {
  type: 'approval/requested'
  sessionId: string
  approvalId: string
  toolName: string
  callId?: string
  reason?: string
}

export interface ApprovalResolvedFrame {
  type: 'approval/resolved'
  sessionId: string
  approvalId: string
  outcome: 'allowed-once' | 'rejected' | 'cancelled' | 'unavailable'
}

/** AskUserQuestionItem (dsh-user-questions) as it crosses the wire. */
export interface QuestionItem {
  id: string
  question: string
  header?: string
  detail?: string
  options?: { label: string; description?: string }[]
  multiSelect?: boolean
  intent?: { kind: 'plan-review'; approve: string }
}

export interface QuestionRequestedFrame {
  type: 'question/requested'
  sessionId: string
  questions: QuestionItem[]
}

export interface QuestionResolvedFrame {
  type: 'question/resolved'
  sessionId: string
  questionRpcId: string
  outcome: 'answered' | 'cancelled'
}

/** session/queue mux frame — a FULL snapshot of the session's message queue. */
export interface SessionQueueFrame {
  type: 'session/queue'
  sessionId: string
  items: {
    id: string
    placement: 'queued' | 'steering' | 'context'
    message: { role: string; content: { type: string; text?: string }[] }
  }[]
}

/** rpcResult slot of a respond call: answer value, or the cancel shape. */
export type RespondResult =
  | { ok: true; value: unknown }
  | { ok: false; error: { code: string; message: string } }

/** ---- Directory domain (S2.1): sessions/workspaces listing + host stream. ---- */

/** session.list row. Titles ride the projection baseline, not a field. */
export interface SessionSummary {
  sessionId: string
  /** Epoch ms of creation/latest human prompt. */
  updatedAt: number
  /** Live agent attached and mid-turn. */
  running: boolean
  /** No turn yet — list surfaces hide these (and reuse them for New Session). */
  blank: boolean
  cwd?: string
  agentPreset?: string
  projections?: { values: Record<string, unknown>; asOfSeq: number }
}

export interface WorkspaceView {
  workspaceId: string
  path: string
  title: string
  sessionIds: string[]
}

/** session.history response page. */
export interface SessionHistory {
  events: {
    event: { type: string; data?: unknown }
    view?: { for: 'call' | 'result'; view: { card?: string; title?: string; [key: string]: unknown } }
  }[]
  hasMore: boolean
}

/** Host-stream frames (the host-side counterpart of the mux stream). A closed
 *  union on purpose: unknown frame kinds land in the consumers' default case. */
export type HostFrame =
  | { type: 'host/session-added'; sessionId: string; blank: boolean; cwd?: string }
  | { type: 'host/session-removed'; sessionId: string }
  | { type: 'host/session-status'; sessionId: string; running: boolean }
  | { type: 'host/agent-error'; sessionId: string; message: string }
  | { type: 'host/workspace-changed'; workspace: WorkspaceView }
  | { type: 'host/workspace-removed'; workspaceId: string }
  | { type: 'host/workspace-order-changed'; workspaceIds: string[] }
  | { type: 'host/archived-sessions-changed'; archivedSessionIds: string[] }

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

  /** Full workspace roster + the archived-session set. */
  async listWorkspaces(): Promise<{ items: WorkspaceView[]; archivedSessionIds: string[] }> {
    return (await dsh.call('workspace.list', {})) as {
      items: WorkspaceView[]
      archivedSessionIds: string[]
    }
  },

  /** Every persisted session, updatedAt descending. */
  async listSessions(): Promise<SessionSummary[]> {
    const value = (await dsh.call('session.list', {})) as { items: SessionSummary[] }
    return value.items
  },

  /** Tail page of a session's event log (transcript rebuild source). */
  async sessionHistory(sessionId: string): Promise<SessionHistory> {
    return (await dsh.call('session.history', { sessionId })) as SessionHistory
  },

  async renameSession(sessionId: string, title: string): Promise<void> {
    await dsh.call('session.rename', { sessionId, title })
  },

  /** Fork a session; resolves with the new session's id. */
  async forkSession(sessionId: string): Promise<string | null> {
    const value = (await dsh.call('session.fork', { sessionId })) as { sessionId?: string }
    return value.sessionId ?? null
  },

  async archiveSession(sessionId: string): Promise<void> {
    await dsh.call('workspace.archiveSession', { sessionId })
  },

  /** Abort the session's running turn. Resolves with the carrier receipt. */
  async cancelSession(sessionId: string): Promise<{ accepted: boolean }> {
    return (await dsh.call('session.cancel', { sessionId })) as { accepted: boolean }
  },

  /** Remove one queued message (S2.3 surface; steer/edit come later). */
  async removeQueuedMessage(sessionId: string, itemId: string): Promise<void> {
    await dsh.call('session.updateQueue', { sessionId, itemId, action: { kind: 'remove' } })
  },

  async renameWorkspace(workspaceId: string, title: string): Promise<void> {
    await dsh.call('workspace.rename', { workspaceId, title })
  },

  async deleteWorkspace(workspaceId: string): Promise<void> {
    await dsh.call('workspace.delete', { workspaceId })
  },

  /** Create a session; roots at a workspace when given, else at cwd. */
  async createSession(opts: { workspaceId?: string; cwd?: string }): Promise<string> {
    const value = (await dsh.call('session.create', opts)) as { sessionId: string }
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
   * Answer an answerable frame (approval/question). `rpcId` is the stable id
   * from the frame's envelope; `result` is the rpcResult verbatim. Resolves
   * with the carrier's receipt — check `accepted` (a late/duplicate answer is
   * refused, not an error). NOTE: /api/respond answers with the bare
   * RpcReceipt — no server-response envelope — so this bypasses `call`'s
   * unwrap on purpose.
   */
  async respond(rpcId: string, result: RespondResult): Promise<{ accepted: boolean; reason?: string }> {
    const receipt = (await window.dshDesktop.dsh.invoke('respond', { rpcId, result })) as {
      accepted: boolean
      reason?: string
    }
    return receipt
  },

  /**
   * Subscribe to the mux downstream stream. `onEvent` receives session/event
   * frames; answerable frames (approvals, questions) route to their own
   * handlers with the envelope's rpcId — the stable id a `respond` call
   * echoes. `opts.types` is the adapter-side filter (BridgeStreamOpenPayload)
   * — list exactly the frame kinds the handlers consume, so bulky frames
   * (projections) never cross the pipe or IPC.
   */
  async openMux(
    handlers: {
      onEvent: (frame: SessionEventFrame) => void
      onApproval?: (frame: ApprovalRequestedFrame | ApprovalResolvedFrame, rpcId: string) => void
      onQuestion?: (frame: QuestionRequestedFrame | QuestionResolvedFrame, rpcId: string) => void
      onQueue?: (frame: SessionQueueFrame) => void
      onOpen?: () => void
      onEnd?: (reason?: string) => void
    },
    opts?: { types?: string[] },
  ): Promise<number> {
    return window.dshDesktop.dsh.openStream('mux', { types: opts?.types }, {
      onFrame: (envelope) => {
        // Frames arrive wrapped as full-form ServerRequests; the mux frame
        // (the document typed by `method`) sits in the payload slot.
        const e = envelope as { type?: string; rpcId?: string; payload?: unknown }
        if (e?.type !== 'server-request') return
        const frame = e.payload as { type?: string } | undefined
        const rpcId = typeof e.rpcId === 'string' ? e.rpcId : ''
        switch (frame?.type) {
          case 'session/event':
            handlers.onEvent(frame as unknown as SessionEventFrame)
            return
          case 'approval/requested':
          case 'approval/resolved':
            handlers.onApproval?.(frame as unknown as ApprovalRequestedFrame, rpcId)
            return
          case 'question/requested':
          case 'question/resolved':
            handlers.onQuestion?.(frame as unknown as QuestionRequestedFrame, rpcId)
            return
          case 'session/queue':
            handlers.onQueue?.(frame as unknown as SessionQueueFrame)
            return
          default:
            // Other mux frame kinds (projections, jobs) get dedicated
            // helpers when a surface needs them.
            return
        }
      },
      onOpen: () => {
        handlers.onOpen?.()
      },
      onEnd: (reason) => {
        handlers.onEnd?.(reason)
      },
    })
  },

  /**
   * Subscribe to the host downstream stream (workspace/session roster
   * changes). Same ServerRequest wrapping as the mux stream.
   */
  async openHost(
    handlers: {
      onFrame: (frame: HostFrame) => void
      onOpen?: () => void
      onEnd?: (reason?: string) => void
    },
    opts?: { types?: string[] },
  ): Promise<number> {
    return window.dshDesktop.dsh.openStream('host', { types: opts?.types }, {
      onFrame: (envelope) => {
        const e = envelope as { type?: string; payload?: unknown }
        if (e?.type !== 'server-request') return
        const frame = e.payload as HostFrame | undefined
        if (frame !== undefined && typeof frame.type === 'string') handlers.onFrame(frame)
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
