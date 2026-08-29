/**
 * CodedBridge client for the renderer — typed helpers over
 * `window.dshDesktop.dsh` (see shared/bridge.ts). Deliberately NOT a subclass
 * of any harness client class: the renderer speaks only the CodedBridge
 * private protocol, so harness upgrades cannot reach this code.
 *
 * Wire facts this file knows about (and the adapter passes through verbatim):
 *  - unary responses arrive as full-form ServerResponse documents
 *    ({type:'server-response', rpcId, result:{ok, value|error}}) — LEGACY
 *    pass-through methods (session.*, workspace.*, respond);
 *  - `coded.*` semantic methods (M1+) answer with Coded-domain payloads
 *    directly, typed by @coded/bridge-protocol/semantic;
 *  - downstream frames arrive as full-form ServerRequest documents
 *    ({type:'server-request', rpcId, method, payload}); the frame itself sits
 *    in the payload slot.
 */

import type {
  CodedHistoryPage,
  CodedModelSelection,
  CodedModelsSnapshot,
  CodedPermissionModes,
  CodedSemanticEvent,
  CodedTranscriptItem,
} from '@coded/bridge-protocol'

// Re-exported for the hooks/components that consume the semantic domain.
export type {
  CodedContentPart,
  CodedHistoryPage,
  CodedSemanticEvent,
  CodedTranscriptItem,
} from '@coded/bridge-protocol'

/** Lifecycle status pushed by the shell (see shared/bridge.ts). */
export type DshStatus = import('../../../shared/bridge').DshBridgeStatus

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

/** One answer inside a question batch response. */
export interface QuestionAnswerItem {
  id: string
  selected: string[]
  custom?: string
}

/** Semantic gate answer (coded.session.respond), §2.2. */
export type GateAnswer =
  | { kind: 'approval'; approvalId: string; outcome: 'allow-once' | 'reject' }
  | { kind: 'question'; answers: QuestionAnswerItem[] }
  | 'cancel'

/** ---- Directory domain (S2.1): sessions/workspaces listing. ---- */

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

  /** Tail page of a session's transcript, as semantic items. */
  async sessionHistory(sessionId: string): Promise<CodedHistoryPage> {
    return (await window.dshDesktop.dsh.invoke('coded.session.history', { sessionId })) as CodedHistoryPage
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
  /** Remove one queued message (the next queue.changed snapshot confirms). */
  async removeQueuedMessage(sessionId: string, itemId: string): Promise<void> {
    await window.dshDesktop.dsh.invoke('coded.queue.remove', { sessionId, itemId })
  },

  /** ---- Semantic domain (M1 pilot): coded.* methods only below. Payloads
   *     arrive as Coded-domain shapes (no backend envelope) — see
   *     codedbridge-protocol.md §2. ---- */

  /** Model roster + current selection for a session. */
  async listModels(sessionId: string): Promise<CodedModelsSnapshot> {
    return (await window.dshDesktop.dsh.invoke('coded.models.list', { sessionId })) as CodedModelsSnapshot
  },

  /** Select the session's model (and optional reasoning effort). */
  async selectModel(
    sessionId: string,
    provider: string,
    model: string,
    reasoningEffort?: string,
  ): Promise<CodedModelSelection> {
    const value = (await window.dshDesktop.dsh.invoke('coded.models.select', {
      sessionId,
      provider,
      model,
      ...(reasoningEffort === undefined ? {} : { reasoningEffort }),
    })) as { selection: CodedModelSelection }
    return value.selection
  },

  /** The deployment's permission modes. */
  async permissionModes(): Promise<CodedPermissionModes> {
    return (await window.dshDesktop.dsh.invoke('coded.permission.modes', {})) as CodedPermissionModes
  },

  /** Switch a session's permission mode. */
  async setPermissionMode(sessionId: string, modeId: string): Promise<void> {
    await window.dshDesktop.dsh.invoke('coded.permission.set', { sessionId, modeId })
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
    await window.dshDesktop.dsh.invoke('coded.session.send', {
      sessionId,
      mode: 'queue',
      content: [{ type: 'text', text }],
    })
  },

  /**
   * Answer an answerable frame (approval/question) through the unified
   * semantic gate (§2.2). `gateId` is the stable id the requested event
   * carried; a late/duplicate answer resolves `{accepted: false, reason}` —
   * refused, not an error.
   */
  async respond(
    sessionId: string,
    gateId: string,
    answer: GateAnswer,
  ): Promise<{ accepted: boolean; reason?: string }> {
    return (await window.dshDesktop.dsh.invoke('coded.session.respond', {
      sessionId,
      gateId,
      answer,
    })) as { accepted: boolean; reason?: string }
  },

  /**
   * Subscribe to the semantic events stream (§2.3): mux + host merged and
   * synthesized adapter-side — the envelope IS the Coded event. `opts.types`
   * filters on semantic event names; approval/question events carry their
   * stable `gateId` for `respond`.
   */
  async openEvents(
    handlers: {
      onEvent: (event: CodedSemanticEvent) => void
      onOpen?: () => void
      onEnd?: (reason?: string) => void
    },
    opts?: { types?: string[] },
  ): Promise<number> {
    return window.dshDesktop.dsh.openStream('events', { types: opts?.types }, {
      onFrame: (envelope) => {
        const e = envelope as { type?: string } | undefined
        if (e !== undefined && typeof e.type === 'string') handlers.onEvent(e as CodedSemanticEvent)
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
