/**
 * CodedBridge semantic domain (proto 1 pilot: models + permission).
 *
 * These types are the CONTRACT between the shell and any adapter — the shell
 * must never see backend shapes. Per codedbridge-protocol.md §2; migration
 * plan M1 covers exactly this file's domains. Backend dialect knowledge lives
 * in each adapter's translation layer, never here.
 */

/** One reasoning effort of an exact model route (adapter-owned vocabulary). */
export interface CodedReasoningEffort {
  id: string
  name: string
  description?: string
}

/** One selectable model route flattened from its provider group. */
export interface CodedModelRoute {
  provider: string
  providerName: string
  model: string
  modelName: string
  description?: string
  /** Present only when the model supports thinking (adapter-owned efforts). */
  efforts?: CodedReasoningEffort[]
  /** Adapter-configured default effort. */
  defaultEffort?: string
}

/** Complete model selection for one session. */
export interface CodedModelSelection {
  provider: string
  model: string
  reasoningEffort?: string
}

/**
 * `coded.models.list` response. With `sessionId` the snapshot is
 * session-scoped (its live selection). Without one it is the deployment
 * picture for pre-session surfaces: `current` mirrors the host default
 * selection (what the next session starts from) and `routes` is the
 * host-wide catalog.
 */
export interface CodedModelsSnapshot {
  current: CodedModelSelection
  /** False = the current provider has no live adapter; shell blocks input. */
  routable: boolean
  routes: CodedModelRoute[]
}

/** One permission mode (a backend permission preset). */
export interface CodedAccessMode {
  id: string
  name: string
  description?: string
}

/** One agent preset the deployment can compose a session from. */
export interface CodedAgentPreset {
  id: string
  /** Published display name; the adapter folds the id in when absent. */
  name: string
  description?: string
  /** Sessions naming no preset are composed from this one. */
  isDefault?: boolean
}

/** `coded.permission.modes` response. */
export interface CodedPermissionModes {
  modes: CodedAccessMode[]
  /** Current session mode, when the backend can determine it. */
  current?: string
}

/** ---- M4: directory domain — workspace + session rosters (§2.1/§2.2). ---- */

/** One workspace roster row (`coded.workspace.list`, `session.workspaceChanged`). */
export interface CodedWorkspace {
  workspaceId: string
  title: string
  path: string
  /** Owned sessions in roster order — the sidebar's within-group order. */
  sessionIds: string[]
}

/** One session roster row (`coded.session.list`). */
export interface CodedSession {
  id: string
  /** Owning workspace, when the session is registered to one. */
  workspaceId?: string
  cwd?: string
  /** Title projection value; '' when unnamed (the shell shows its blank label). */
  title: string
  updatedAt: number
  phase: 'blank' | 'idle' | 'running' | 'errored'
  archived: boolean
  /** The agent preset this session runs, when it names one. */
  agentPreset?: string
}

/** `coded.describe` response — backend identity for health surfaces. */
export interface CodedDescribe {
  backend: string
  backendVersion: string
  home: string
  currentModel: string
}

/** ---- M2: transcript + semantic event stream (§2.3). ---- */

/** One content part of a message (v1 renders text; others are reserved). */
export type CodedContentPart =
  | { type: 'text'; text: string }
  | {
      type: 'image' | 'audio' | 'video' | 'document'
      mediaType: string
      name?: string
      payload: { kind: 'inline'; data: string } | { kind: 'file'; path: string }
    }

/** One transcript entry (user-visible, ordered). Ids are stable across
 *  history reads and the live stream — safe as React keys and dedupe anchors.
 *  `time` is the host log event's wall clock (Unix epoch ms); `endTime` on
 *  tool items is the paired tool/result's clock — together they let a shell
 *  rebuild per-turn working durations after a restart. */
export type CodedTranscriptItem =
  | { id: string; kind: 'user'; content: CodedContentPart[]; time?: number }
  | { id: string; kind: 'assistant'; text: string; streaming?: boolean; time?: number }
  | { id: string; kind: 'reasoning'; text: string; streaming?: boolean; time?: number }
  | {
      id: string
      kind: 'tool'
      callId: string
      status: 'running' | 'done'
      title?: string
      card?: string
      argsText?: string
      resultText?: string
      resultMeta?: string
      time?: number
      endTime?: number
    }

/** Whole-session conversation figures, folded host-side from the complete
 *  durable log (the dsh `sessionStats` projection). Survives restarts and
 *  is independent of how much history a client has paged in. */
export interface CodedSessionStats {
  /** Turns carrying at least one closed step. */
  turns: number
  /** Closed steps (completed, failed, and cancelled alike). */
  steps: number
  /** Summed model wall time (step/start → assistant/message), ms. */
  llmMs: number
  /** Summed tool wall time (tool/call → tool/result pairs), ms. */
  toolMs: number
  /** Summed first-token latency, ms. */
  ttftMs: number
  /** Steps carrying a recorded first token. */
  ttftSteps: number
  /** Summed decode wall time, ms. */
  decodeMs: number
  /** Summed provider output tokens. */
  decodeTokens: number
}

/** `coded.session.history` response. */
export interface CodedHistoryPage {
  items: CodedTranscriptItem[]
  hasMore: boolean
  /**
   * The log-resolved agent preset (newest selection wins), read from the
   * same events as the transcript. The cold session list serves the header's
   * creation-time value only, so this is the authoritative echo for sessions
   * that switched preset while blank.
   */
  agentPreset?: string
  /**
   * Whole-session stats from the host's projection block (tail pages only —
   * a `maxMessages`-clamped read still receives them). Absent when the
   * adapter's host lacks the stats capability.
   */
  stats?: CodedSessionStats
}

/** Discriminator: every semantic event carries its type + sessionId. */
export interface CodedSemanticEventBase {
  seq?: number
}

/**
 * The downstream semantic event stream (single `events` stream, envelope =
 * the event object itself). See codedbridge-protocol.md §2.3.
 */
export type CodedSemanticEvent = CodedSemanticEventBase &
  (
    | { type: 'session.phase'; sessionId: string; phase: 'blank' | 'idle' | 'running' | 'errored' }
    | {
        type: 'session.added'
        sessionId: string
        blank?: boolean
        agentPreset?: string
      }
    | { type: 'session.removed'; sessionId: string }
    | { type: 'session.title'; sessionId: string; title: string }
    | { type: 'session.workspaceChanged'; workspace: CodedWorkspace }
    | { type: 'session.workspaceRemoved'; workspaceId: string }
    | { type: 'session.workspaceOrderChanged'; workspaceIds: string[] }
    | { type: 'session.archivedChanged' }
    | { type: 'transcript.appended'; sessionId: string; item: CodedTranscriptItem }
    | { type: 'transcript.delta'; sessionId: string; itemRef: string; blockKind: 'text' | 'reasoning'; text: string }
    | { type: 'transcript.finalized'; sessionId: string; itemRef: string; text: string }
    | {
        type: 'toolCall.updated'
        sessionId: string
        callId: string
        patch: Partial<Pick<CodedTranscriptItem & { kind: 'tool' }, 'status' | 'title' | 'card' | 'resultText' | 'resultMeta' | 'time' | 'endTime'>>
      }
    | { type: 'approval.requested'; gateId: string; sessionId: string; approvalId: string; toolName: string; callId?: string; reason?: string }
    | { type: 'approval.resolved'; gateId: string; sessionId: string; approvalId: string }
    | { type: 'question.requested'; gateId: string; sessionId: string; questions: unknown[] }
    | { type: 'question.resolved'; gateId: string; sessionId: string }
    | { type: 'queue.changed'; sessionId: string; items: { itemId: string; placement: 'queued' | 'steering' | 'context'; text: string }[] }
    | { type: 'backend.error'; sessionId?: string; message: string }
  )
