/**
 * CodedBridge client for the renderer — typed helpers over
 * `window.dshDesktop.dsh` (see shared/bridge.ts). Deliberately NOT a subclass
 * of any harness client class: the renderer speaks only the CodedBridge
 * private protocol, so harness upgrades cannot reach this code.
 *
 * Proto 2 posture: every unary goes through the semantic `coded.*` surface
 * (codedbridge-protocol.md §2) and answers with Coded-domain payloads typed
 * by @coded/bridge-protocol/semantic — no backend envelope, no backend method
 * names. Downstream frames arrive on the `events` stream (a control-channel
 * subscription), envelope = the CodedSemanticEvent itself.
 */

import type {
  CodedAgentPreset,
  CodedDescribe,
  CodedHistoryPage,
  CodedModelSelection,
  CodedModelsSnapshot,
  CodedPermissionModes,
  CodedSemanticEvent,
  CodedSession,
  CodedTranscriptItem,
  CodedWorkspace,
} from '@coded/bridge-protocol'

// Re-exported for the hooks/components that consume the semantic domain.
export type {
  CodedAgentPreset,
  CodedContentPart,
  CodedDescribe,
  CodedHistoryPage,
  CodedSemanticEvent,
  CodedSession,
  CodedTranscriptItem,
  CodedWorkspace,
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

/** ---- Directory domain (§2.1/§2.2): sessions/workspaces listing. ---- */

export const dsh = {
  status: (): Promise<DshStatus> => window.dshDesktop.dsh.status(),

  onStatus: (cb: (status: DshStatus) => void): (() => void) =>
    window.dshDesktop.dsh.onStatus(cb),

  /** Backend identity (health surfaces, cwd fallback). */
  async describe(): Promise<CodedDescribe> {
    return (await window.dshDesktop.dsh.invoke('coded.describe', {})) as CodedDescribe
  },

  /** First workspace path, or the user home when none is registered. */
  async defaultCwd(): Promise<string> {
    try {
      const value = (await window.dshDesktop.dsh.invoke('coded.workspace.list', {})) as {
        workspaces: CodedWorkspace[]
      }
      const first = value.workspaces[0]?.path
      if (typeof first === 'string' && first !== '') return first
    } catch {
      // Fall through to home below.
    }
    const { home } = await dsh.describe()
    return home
  },

  /** Full workspace roster (roster order + owned-session order) + archived set. */
  async listWorkspaces(): Promise<{ workspaces: CodedWorkspace[]; archivedSessionIds: string[] }> {
    return (await window.dshDesktop.dsh.invoke('coded.workspace.list', {})) as {
      workspaces: CodedWorkspace[]
      archivedSessionIds: string[]
    }
  },

  /** Every session as a semantic roster row (title/phase/ownership filled). */
  async listSessions(): Promise<CodedSession[]> {
    const value = (await window.dshDesktop.dsh.invoke('coded.session.list', {})) as {
      sessions: CodedSession[]
    }
    return value.sessions
  },

  /** Tail page of a session's transcript, as semantic items. */
  async sessionHistory(sessionId: string): Promise<CodedHistoryPage> {
    return (await window.dshDesktop.dsh.invoke('coded.session.history', { sessionId })) as CodedHistoryPage
  },

  async renameSession(sessionId: string, title: string): Promise<void> {
    await window.dshDesktop.dsh.invoke('coded.session.rename', { sessionId, title })
  },

  /** Fork a session; resolves with the new session's id when the backend says. */
  async forkSession(sessionId: string): Promise<string | null> {
    const value = (await window.dshDesktop.dsh.invoke('coded.session.fork', { sessionId })) as {
      sessionId?: string
    }
    return value.sessionId ?? null
  },

  async archiveSession(sessionId: string): Promise<void> {
    await window.dshDesktop.dsh.invoke('coded.session.archive', { sessionId })
  },

  /** Abort the session's running turn. Resolves with the carrier receipt. */
  async cancelSession(sessionId: string): Promise<{ accepted: boolean }> {
    return (await window.dshDesktop.dsh.invoke('coded.session.cancel', { sessionId })) as {
      accepted: boolean
    }
  },

  /** Remove one queued message (S2.3 surface; steer/edit come later). */
  /** Remove one queued message (the next queue.changed snapshot confirms). */
  async removeQueuedMessage(sessionId: string, itemId: string): Promise<void> {
    await window.dshDesktop.dsh.invoke('coded.queue.remove', { sessionId, itemId })
  },

  /** ---- Semantic domain (M1 pilot): coded.* methods only below. Payloads
   *     arrive as Coded-domain shapes (no backend envelope) — see
   *     codedbridge-protocol.md §2. ---- */

  /**
   * Model roster + current selection. With a sessionId the snapshot is that
   * session's; without one it is the deployment picture (host default
   * selection + host-wide catalog) for pre-session surfaces.
   */
  async listModels(sessionId?: string): Promise<CodedModelsSnapshot> {
    return (await window.dshDesktop.dsh.invoke('coded.models.list', {
      ...(sessionId === undefined ? {} : { sessionId }),
    })) as CodedModelsSnapshot
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

  /** Adapter-declared semantic capabilities of the current bridge epoch. */
  capabilities(): Promise<string[]> {
    return window.dshDesktop.dsh.capabilities()
  },

  /** The deployment's agent-preset roster (empty = none composed). */
  async listPresets(): Promise<CodedAgentPreset[]> {
    const value = (await window.dshDesktop.dsh.invoke('coded.presets.list', {})) as {
      presets: CodedAgentPreset[]
    }
    return value.presets
  },

  /** Switch a blank session's agent preset; resolves with the resolved id. */
  async selectPreset(sessionId: string, presetId: string): Promise<string | null> {
    const value = (await window.dshDesktop.dsh.invoke('coded.presets.select', {
      sessionId,
      presetId,
    })) as { agentPreset?: string }
    return value.agentPreset ?? null
  },

  /** Switch a session's permission mode. */
  async setPermissionMode(sessionId: string, modeId: string): Promise<void> {
    await window.dshDesktop.dsh.invoke('coded.permission.set', { sessionId, modeId })
  },

  async renameWorkspace(workspaceId: string, title: string): Promise<void> {
    await window.dshDesktop.dsh.invoke('coded.workspace.rename', { workspaceId, title })
  },

  /** Detach a workspace from the roster (its folder and sessions remain). */
  async deleteWorkspace(workspaceId: string): Promise<void> {
    await window.dshDesktop.dsh.invoke('coded.workspace.delete', { workspaceId })
  },

  /** Create a session; roots at a workspace when given, else at cwd. */
  async createSession(opts: {
    workspaceId?: string
    cwd?: string
    presetId?: string
  }): Promise<string> {
    const value = (await window.dshDesktop.dsh.invoke('coded.session.create', {
      ...(opts.presetId === undefined ? {} : { presetId: opts.presetId }),
      ...(opts.workspaceId === undefined ? {} : { workspaceId: opts.workspaceId }),
      ...(opts.cwd === undefined ? {} : { cwd: opts.cwd }),
    })) as { sessionId: string }
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
