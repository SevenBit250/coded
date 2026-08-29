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

/** `coded.models.list` response. */
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

/** `coded.permission.modes` response. */
export interface CodedPermissionModes {
  modes: CodedAccessMode[]
  /** Current session mode, when the backend can determine it. */
  current?: string
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
 *  history reads and the live stream — safe as React keys and dedupe anchors. */
export type CodedTranscriptItem =
  | { id: string; kind: 'user'; content: CodedContentPart[] }
  | { id: string; kind: 'assistant'; text: string; streaming?: boolean }
  | { id: string; kind: 'reasoning'; text: string; streaming?: boolean }
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
    }

/** `coded.session.history` response. */
export interface CodedHistoryPage {
  items: CodedTranscriptItem[]
  hasMore: boolean
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
    | { type: 'session.added'; sessionId: string; blank?: boolean }
    | { type: 'session.removed'; sessionId: string }
    | { type: 'session.title'; sessionId: string; title: string }
    | { type: 'session.workspaceChanged'; workspace: { workspaceId: string; title: string; path: string; sessionIds: string[] } }
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
        patch: Partial<Pick<CodedTranscriptItem & { kind: 'tool' }, 'status' | 'title' | 'card' | 'resultText' | 'resultMeta'>>
      }
    | { type: 'approval.requested'; gateId: string; sessionId: string; approvalId: string; toolName: string; callId?: string; reason?: string }
    | { type: 'approval.resolved'; gateId: string; sessionId: string; approvalId: string }
    | { type: 'question.requested'; gateId: string; sessionId: string; questions: unknown[] }
    | { type: 'question.resolved'; gateId: string; sessionId: string }
    | { type: 'queue.changed'; sessionId: string; items: { itemId: string; placement: 'queued' | 'steering' | 'context'; text: string }[] }
    | { type: 'backend.error'; sessionId?: string; message: string }
  )
