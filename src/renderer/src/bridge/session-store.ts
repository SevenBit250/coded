/**
 * useSession — the ACTIVE session's live view over the CodedBridge, ported
 * 1:1 from the React hook into a Pinia store. State: transcript items (with
 * shell-side reasoning timing), busy flag, queue, the ALL-session answerable
 * gates (filtered at render), and the log-resolved agent preset. Logic —
 * strict session gating, append-ignores-known upserts, lazy-create with
 * workspace anchoring — is unchanged; only the container moved.
 */
import { ref } from 'vue'
import { defineStore } from 'pinia'
import { bridge } from './client'
import type {
  BridgeStatus,
  CodedSemanticEvent,
  CodedTranscriptItem,
  QuestionItem,
  QuestionAnswerItem,
} from './client'

export type ChatMessage = CodedTranscriptItem & {
  error?: string
  /** Shell-side wall clock when a streaming reasoning block was announced. */
  startedAt?: number
  /** Shell-measured reasoning duration (finalize − start), for the fold label. */
  durationMs?: number
}

/** A pending tool-call approval (answerable via its stable gateId). */
export interface PendingApproval {
  gateId: string
  sessionId: string
  approvalId: string
  toolName: string
  reason?: string
  /** Best-effort summary of the correlated tool call arguments. */
  argsSummary?: string
}

/** A pending user-question batch (answerable via its stable gateId). */
export interface PendingQuestion {
  gateId: string
  sessionId: string
  questions: QuestionItem[]
}

/** One queued message (admission pending), rendered in the composer strip. */
export interface QueuedMessage {
  itemId: string
  placement: 'queued' | 'steering'
  text: string
}

/** Semantic event kinds this store consumes (adapter-side filter list). */
const EVENT_TYPES = [
  'transcript.appended',
  'transcript.delta',
  'transcript.finalized',
  'toolCall.updated',
  'approval.requested',
  'approval.resolved',
  'question.requested',
  'question.resolved',
  'queue.changed',
]

/** Compact one-line summary of a tool call's arguments (card display). */
function summarizeArgs(raw: unknown): string | undefined {
  if (typeof raw !== 'string' || raw === '') return undefined
  try {
    const args = JSON.parse(raw) as Record<string, unknown>
    // bash/pwsh-style calls: the command IS the summary.
    if (typeof args['command'] === 'string') return args['command']
    return raw.length > 160 ? `${raw.slice(0, 160)}…` : raw
  } catch {
    return raw.length > 160 ? `${raw.slice(0, 160)}…` : raw
  }
}

let idCounter = 0
function nextId(): string {
  idCounter += 1
  return `m${idCounter}`
}

export const useSessionStore = defineStore('session', () => {
  const status = ref<BridgeStatus>('starting')
  const messages = ref<ChatMessage[]>([])
  const busy = ref(false)
  const queue = ref<QueuedMessage[]>([])
  const pendingApprovals = ref<PendingApproval[]>([])
  const pendingQuestions = ref<PendingQuestion[]>([])
  /** Log-resolved preset of the active session (from its history page). */
  const agentPreset = ref<string | undefined>(undefined)

  const sessionIdRef = ref<string | null>(null)
  /** Sessions this client created itself — their transcript is already
   *  local, so a switch to them must not rebuild it from history. */
  const selfCreated = new Set<string>()
  /** Subscribed at most once per bridge-connected epoch. */
  let subscribed = false
  /** callId → args summary, for the approval card's arguments line. */
  const toolCalls = new Map<string, string>()
  /** Composer project picker roots fresh sessions here. */
  const workspaceIdRef = ref<string | null | undefined>(undefined)
  /** The first send of a fresh draft created this session — select it. */
  const onSessionCreatedRef = ref<((sessionId: string) => void) | undefined>(undefined)

  /** Wire the draft context; called from the shell whenever it changes. */
  function configure(opts: { workspaceId?: string | null; onSessionCreated?: (sessionId: string) => void }): void {
    workspaceIdRef.value = opts.workspaceId
    onSessionCreatedRef.value = opts.onSessionCreated
  }

  /** Session switch: rebuild the transcript from the semantic history (items
   *  carry the same ids as the live stream). Self-created sessions skip the
   *  reload — their transcript is live. */
  function select(next: string | null): void {
    if (next === sessionIdRef.value) return
    sessionIdRef.value = next
    busy.value = false
    queue.value = []
    agentPreset.value = undefined
    if (next === null) {
      messages.value = []
      return
    }
    if (selfCreated.has(next)) return
    void bridge
      .sessionHistory(next)
      .then((page) => {
        messages.value = page.items.map((item) => ({ ...item }))
        agentPreset.value = page.agentPreset
      })
      .catch((error: unknown) => {
        console.log(`[session] history load failed: ${String(error)}`)
      })
  }

  /** Upsert one transcript item by id (append ignores known ids so replayed
   *  appends never reset accumulated deltas). */
  function upsertItem(item: CodedTranscriptItem): void {
    const at = messages.value.findIndex((m) => m.id === item.id)
    if (at >= 0) return
    // Stamp the wall clock on a freshly announced streaming block so the
    // fold label can show a live/measured duration (shell-only data).
    const startedAt = item.kind === 'reasoning' && item.streaming === true ? Date.now() : undefined
    messages.value.push(startedAt === undefined ? { ...item } : { ...item, startedAt })
  }

  function appendText(itemRef: string, text: string): void {
    const at = messages.value.findIndex((m) => m.id === itemRef)
    if (at < 0) return
    const target = messages.value[at]
    if (target.kind !== 'assistant' && target.kind !== 'reasoning') return
    messages.value[at] = { ...target, text: target.text + text }
  }

  function finalizeText(itemRef: string, text: string): void {
    const at = messages.value.findIndex((m) => m.id === itemRef)
    if (at < 0) {
      // Never announced (missed deltas): surface the block whole.
      const kind = itemRef.startsWith('r') ? 'reasoning' : 'assistant'
      const item: ChatMessage =
        kind === 'reasoning'
          ? { id: itemRef, kind: 'reasoning', text }
          : { id: itemRef, kind: 'assistant', text }
      if (text !== '') messages.value.push(item)
      return
    }
    const target = messages.value[at]
    if (target.kind !== 'assistant' && target.kind !== 'reasoning') return
    messages.value[at] = {
      ...target,
      text: text !== '' ? text : target.text,
      streaming: false,
      ...(target.kind === 'reasoning' && target.startedAt !== undefined
        ? { durationMs: Date.now() - target.startedAt }
        : {}),
    }
  }

  function handleEvent(event: CodedSemanticEvent): void {
    switch (event.type) {
      case 'transcript.appended': {
        // Strict session gate: a null ref (no active session yet) must NOT
        // act as a wildcard — foreign sessions' items would leak into the
        // transcript after the selection is cleared.
        if (event.sessionId !== sessionIdRef.value) return
        upsertItem(event.item)
        return
      }
      case 'transcript.delta': {
        if (event.sessionId !== sessionIdRef.value) return
        appendText(event.itemRef, event.text)
        return
      }
      case 'transcript.finalized': {
        if (event.sessionId !== sessionIdRef.value) return
        finalizeText(event.itemRef, event.text)
        return
      }
      case 'toolCall.updated': {
        if (event.sessionId !== sessionIdRef.value) return
        const at = messages.value.findIndex((m) => m.kind === 'tool' && m.callId === event.callId)
        if (at < 0) return
        const target = messages.value[at]
        if (target.kind !== 'tool') return
        messages.value[at] = {
          ...target,
          ...(event.patch.title !== undefined ? { title: event.patch.title } : {}),
          ...(event.patch.card !== undefined ? { card: event.patch.card } : {}),
          ...(event.patch.resultText !== undefined ? { resultText: event.patch.resultText } : {}),
          ...(event.patch.resultMeta !== undefined ? { resultMeta: event.patch.resultMeta } : {}),
          status: event.patch.status ?? 'done',
        }
        return
      }
      case 'approval.requested': {
        if (pendingApprovals.value.some((p) => p.gateId === event.gateId)) return
        pendingApprovals.value.push({
          gateId: event.gateId,
          sessionId: event.sessionId,
          approvalId: event.approvalId,
          toolName: event.toolName,
          ...(event.reason !== undefined ? { reason: event.reason } : {}),
          ...(event.callId !== undefined
            ? { argsSummary: toolCalls.get(event.callId) }
            : {}),
        })
        return
      }
      case 'approval.resolved': {
        pendingApprovals.value = pendingApprovals.value.filter((p) => p.approvalId !== event.approvalId)
        return
      }
      case 'question.requested': {
        if (pendingQuestions.value.some((p) => p.gateId === event.gateId)) return
        pendingQuestions.value.push({
          gateId: event.gateId,
          sessionId: event.sessionId,
          questions: (event.questions ?? []) as QuestionItem[],
        })
        return
      }
      case 'question.resolved': {
        pendingQuestions.value = pendingQuestions.value.filter((p) => p.gateId !== event.gateId)
        return
      }
      case 'queue.changed': {
        if (event.sessionId !== sessionIdRef.value) return
        queue.value = event.items
          .filter((item) => item.placement !== 'context')
          .map((item) => ({
            itemId: item.itemId,
            placement: item.placement === 'steering' ? 'steering' : 'queued',
            text: item.text,
          }))
        return
      }
      default:
        return
    }
  }

  // Subscribe the semantic events stream once per bridge epoch (store init
  // = the React mount-once effect). Self-heal: a stream that dies while the
  // bridge stays connected would otherwise leave the UI deaf.
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let lastStatus: BridgeStatus = 'starting'

  function subscribe(): void {
    if (subscribed) return
    subscribed = true
    void bridge
      .openEvents(
        {
          onEvent: (event) => {
            handleEvent(event)
          },
          onEnd: () => {
            subscribed = false
            if (lastStatus === 'bridge-connected') {
              retryTimer = setTimeout(() => {
                retryTimer = null
                if (!subscribed && lastStatus === 'bridge-connected') {
                  subscribe()
                }
              }, 1000)
            }
          },
        },
        { types: EVENT_TYPES },
      )
      .catch((error) => {
        console.log(`[session] events open failed: ${String(error)}`)
        subscribed = false
      })
  }

  function consider(next: BridgeStatus): void {
    lastStatus = next
    status.value = next
    if (next === 'bridge-connected') subscribe()
    if (next === 'bridge-disconnected') subscribed = false
  }

  // Pull the current status first: the bridge-connected broadcast usually
  // fires before the store is first used, so push-only misses it.
  void bridge.status().then((current) => consider(current)).catch(() => {})
  bridge.onStatus(consider)

  /** Respond helpers: optimistic removal, the resolved event confirms. */
  function answerApproval(pending: PendingApproval, outcome: 'allowed-once' | 'rejected'): void {
    pendingApprovals.value = pendingApprovals.value.filter((p) => p.approvalId !== pending.approvalId)
    void bridge
      .respond(pending.sessionId, pending.gateId, {
        kind: 'approval',
        approvalId: pending.approvalId,
        outcome: outcome === 'allowed-once' ? 'allow-once' : 'reject',
      })
      .then((receipt) => {
        if (!receipt.accepted) {
          console.log(`[session] approval respond refused: ${receipt.reason ?? 'unknown'}`)
        }
      })
      .catch((error: unknown) => {
        console.log(`[session] approval respond failed: ${String(error)}`)
      })
  }

  function answerQuestion(pending: PendingQuestion, answers: QuestionAnswerItem[]): void {
    pendingQuestions.value = pendingQuestions.value.filter((p) => p.gateId !== pending.gateId)
    void bridge
      .respond(pending.sessionId, pending.gateId, { kind: 'question', answers })
      .then((receipt) => {
        if (!receipt.accepted) {
          console.log(`[session] question respond refused: ${receipt.reason ?? 'unknown'}`)
        }
      })
      .catch((error: unknown) => {
        console.log(`[session] question respond failed: ${String(error)}`)
      })
  }

  function cancelQuestion(pending: PendingQuestion): void {
    pendingQuestions.value = pendingQuestions.value.filter((p) => p.gateId !== pending.gateId)
    void bridge
      .respond(pending.sessionId, pending.gateId, 'cancel')
      .then((receipt) => {
        if (!receipt.accepted) {
          console.log(`[session] question cancel refused: ${receipt.reason ?? 'unknown'}`)
        }
      })
      .catch((error: unknown) => {
        console.log(`[session] question cancel failed: ${String(error)}`)
      })
  }

  function interrupt(): void {
    const id = sessionIdRef.value
    if (id === null) return
    void bridge
      .cancelSession(id)
      .then((receipt) => {
        if (!receipt.accepted) {
          console.log('[session] cancel refused')
        }
      })
      .catch((error: unknown) => {
        console.log(`[session] cancel failed: ${String(error)}`)
      })
  }

  /** Remove one queued message (optimistic; the next snapshot confirms). */
  function dequeue(itemId: string): void {
    const id = sessionIdRef.value
    if (id === null) return
    queue.value = queue.value.filter((item) => item.itemId !== itemId)
    void bridge.removeQueuedMessage(id, itemId).catch((error: unknown) => {
      console.log(`[session] dequeue failed: ${String(error)}`)
    })
  }

  function send(text: string): void {
    const trimmed = text.trim()
    if (trimmed === '' || busy.value) return
    busy.value = true
    // No optimistic bubbles: the backend echo arrives as transcript items
    // (user text, then reasoning/text blocks) within milliseconds.
    void (async () => {
      try {
        if (sessionIdRef.value === null) {
          const workspaceId = workspaceIdRef.value ?? null
          const cwd = workspaceId === null ? await bridge.defaultCwd() : undefined
          sessionIdRef.value = await bridge.createSession(
            workspaceId !== null
              ? { workspaceId }
              : { cwd: cwd ?? '' },
          )
          selfCreated.add(sessionIdRef.value)
          onSessionCreatedRef.value?.(sessionIdRef.value)
        }
        await bridge.prompt(sessionIdRef.value, trimmed)
      } catch (error) {
        messages.value.push({
          id: nextId(),
          kind: 'assistant',
          text: '',
          error: error instanceof Error ? error.message : String(error),
        })
      } finally {
        busy.value = false
      }
    })()
  }

  return {
    status,
    messages,
    busy,
    queue,
    pendingApprovals,
    pendingQuestions,
    agentPreset,
    configure,
    select,
    send,
    interrupt,
    dequeue,
    answerApproval,
    answerQuestion,
    cancelQuestion,
  }
})
