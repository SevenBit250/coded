/**
 * useDshSession — the renderer's session state machine over the CodedBridge:
 * lifecycle status, the ACTIVE session (switched from the sidebar), and the
 * transcript.
 *
 * M2: everything below consumes ONLY the semantic domain (§2.3) — the
 * `events` stream (transcript/answerable/queue events) and `coded.*` unary
 * methods. No backend dialect knowledge lives here.
 *
 * Rendering model: the backend echo is the source of truth. A send() pushes
 * no optimistic bubbles — the user item arrives as `transcript.appended`,
 * streamed blocks as reasoning/assistant items with `transcript.delta`, and
 * every item settles via `transcript.finalized` (the authoritative value).
 * Item ids are stable across history and the live stream, so history rebuilds
 * and live appends dedupe naturally.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { dsh } from './client'
import type {
  CodedContentPart,
  CodedSemanticEvent,
  CodedTranscriptItem,
  DshStatus,
  QuestionAnswerItem,
  QuestionItem,
} from './client'

/** One transcript entry plus the shell-local send-error decoration. */
export type ChatMessage = CodedTranscriptItem & { error?: string }

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

/** One answer inside a question batch response (wire shape lives in client). */
export type { QuestionAnswerItem }

/** One queued message (admission pending), rendered in the composer strip. */
export interface QueuedMessage {
  itemId: string
  placement: 'queued' | 'steering'
  text: string
}

let idCounter = 0
function nextId(): string {
  idCounter += 1
  return `m${idCounter}`
}

export interface DshSession {
  status: DshStatus
  /** Transcript items of the active session (semantic shapes). */
  messages: ChatMessage[]
  /** True while a send is in flight (composer locks). */
  busy: boolean
  send: (text: string) => void
  /** Queued (not yet admitted) messages of the active session. */
  queue: QueuedMessage[]
  /** Abort the active session's running turn. */
  interrupt: () => void
  /** Remove one queued message. */
  dequeue: (itemId: string) => void
  /** Answerable frames awaiting the user (all sessions; filter at render). */
  pendingApprovals: PendingApproval[]
  pendingQuestions: PendingQuestion[]
  answerApproval: (pending: PendingApproval, outcome: 'allowed-once' | 'rejected') => void
  answerQuestion: (pending: PendingQuestion, answers: QuestionAnswerItem[]) => void
  cancelQuestion: (pending: PendingQuestion) => void
}

/** Semantic event kinds this hook consumes (adapter-side filter list). */
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

export interface UseDshSessionOptions {
  /** Workspace to root a fresh session in (composer project picker). */
  workspaceId?: string | null
  /** The first send of a fresh draft created this session — select it. */
  onSessionCreated?: (sessionId: string) => void
}

export function useDshSession(
  sessionId: string | null,
  opts?: UseDshSessionOptions,
): DshSession {
  const [status, setStatus] = useState<DshStatus>('starting')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [busy, setBusy] = useState(false)
  const [queue, setQueue] = useState<QueuedMessage[]>([])
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([])
  const [pendingQuestions, setPendingQuestions] = useState<PendingQuestion[]>([])
  const sessionIdRef = useRef<string | null>(null)
  /** Sessions this client created itself — their transcript is already
   *  local, so the switch effect must not rebuild it from history. */
  const selfCreatedRef = useRef<Set<string>>(new Set())
  /** Subscribed at most once per bridge-connected epoch. */
  const subscribedRef = useRef(false)
  /** callId → args summary, for the approval card's arguments line. */
  const toolCallsRef = useRef(new Map<string, string>())
  const onSessionCreatedRef = useRef(opts?.onSessionCreated)
  onSessionCreatedRef.current = opts?.onSessionCreated
  const workspaceIdRef = useRef(opts?.workspaceId)
  workspaceIdRef.current = opts?.workspaceId

  useEffect(() => {
    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let lastStatus: DshStatus = 'starting'
    /** Subscribe the semantic events stream once per bridge epoch. */
    const subscribe = (): void => {
      if (subscribedRef.current) return
      subscribedRef.current = true
      void dsh
        .openEvents(
          {
            onEvent: (event) => {
              handleEvent(event)
            },
            onEnd: (reason) => {
              subscribedRef.current = false
              // Self-heal: a stream that dies while the bridge stays connected
              // would otherwise leave the UI deaf until the next reconnect.
              if (!cancelled && lastStatus === 'bridge-connected') {
                retryTimer = setTimeout(() => {
                  retryTimer = null
                  if (!cancelled && !subscribedRef.current && lastStatus === 'bridge-connected') {
                    subscribe()
                  }
                }, 1000)
              }
            },
          },
          { types: EVENT_TYPES },
        )
        .catch((error) => {
          console.log(`[dsh-session] events open failed: ${String(error)}`)
          subscribedRef.current = false
        })
    }

    const consider = (next: DshStatus): void => {
      if (cancelled) return
      lastStatus = next
      setStatus(next)
      if (next === 'bridge-connected') subscribe()
      if (next === 'bridge-disconnected') subscribedRef.current = false
    }

    // Pull the current status first: the bridge-connected broadcast usually
    // fires before React finishes mounting, so push-only misses it.
    void dsh.status().then((current) => consider(current)).catch(() => {})
    const off = dsh.onStatus(consider)
    return () => {
      cancelled = true
      if (retryTimer !== null) clearTimeout(retryTimer)
      off()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Session switch: rebuild the transcript from the semantic history (items
  // carry the same ids as the live stream). Self-created sessions skip the
  // reload — their transcript is live.
  useEffect(() => {
    if (sessionId === sessionIdRef.current) return
    sessionIdRef.current = sessionId
    setBusy(false)
    setQueue([])
    if (sessionId === null) {
      setMessages([])
      return
    }
    if (selfCreatedRef.current.has(sessionId)) return
    let stale = false
    setMessages([])
    void dsh
      .sessionHistory(sessionId)
      .then((page) => {
        if (stale) return
        setMessages(page.items.map((item) => ({ ...item })))
      })
      .catch((error: unknown) => {
        if (!stale) {
          console.log(`[dsh-session] history load failed: ${String(error)}`)
        }
      })
    return () => {
      stale = true
    }
  }, [sessionId])

  /** Upsert one transcript item by id (append ignores known ids so replayed
   *  appends never reset accumulated deltas). */
  const upsertItem = useCallback((item: CodedTranscriptItem): void => {
    setMessages((prev) => {
      const at = prev.findIndex((m) => m.id === item.id)
      if (at >= 0) return prev
      return [...prev, { ...item }]
    })
  }, [])

  const appendText = useCallback((itemRef: string, text: string): void => {
    setMessages((prev) => {
      const at = prev.findIndex((m) => m.id === itemRef)
      if (at < 0) return prev
      const target = prev[at]
      if (target.kind !== 'assistant' && target.kind !== 'reasoning') return prev
      const updated = [...prev]
      updated[at] = { ...target, text: target.text + text }
      return updated
    })
  }, [])

  const finalizeText = useCallback((itemRef: string, text: string): void => {
    setMessages((prev) => {
      const at = prev.findIndex((m) => m.id === itemRef)
      if (at < 0) {
        // Never announced (missed deltas): surface the block whole.
        const kind = itemRef.startsWith('r') ? 'reasoning' : 'assistant'
        const item: ChatMessage =
          kind === 'reasoning'
            ? { id: itemRef, kind: 'reasoning', text }
            : { id: itemRef, kind: 'assistant', text }
        return text === '' ? prev : [...prev, item]
      }
      const target = prev[at]
      if (target.kind !== 'assistant' && target.kind !== 'reasoning') return prev
      const updated = [...prev]
      updated[at] = {
        ...target,
        text: text !== '' ? text : target.text,
        streaming: false,
      }
      return updated
    })
  }, [])

  const handleEvent = useCallback(
    (event: CodedSemanticEvent): void => {
      switch (event.type) {
        case 'transcript.appended': {
          if (sessionIdRef.current !== null && event.sessionId !== sessionIdRef.current) return
          upsertItem(event.item)
          return
        }
        case 'transcript.delta': {
          if (event.sessionId !== sessionIdRef.current) return
          appendText(event.itemRef, event.text)
          return
        }
        case 'transcript.finalized': {
          if (event.sessionId !== sessionIdRef.current) return
          finalizeText(event.itemRef, event.text)
          return
        }
        case 'toolCall.updated': {
          if (event.sessionId !== sessionIdRef.current) return
          setMessages((prev) => {
            const at = prev.findIndex((m) => m.kind === 'tool' && m.callId === event.callId)
            if (at < 0) return prev
            const target = prev[at]
            if (target.kind !== 'tool') return prev
            const updated = [...prev]
            updated[at] = {
              ...target,
              ...(event.patch.title !== undefined ? { title: event.patch.title } : {}),
              ...(event.patch.card !== undefined ? { card: event.patch.card } : {}),
              ...(event.patch.resultText !== undefined
                ? { resultText: event.patch.resultText }
                : {}),
              ...(event.patch.resultMeta !== undefined
                ? { resultMeta: event.patch.resultMeta }
                : {}),
              status: event.patch.status ?? 'done',
            }
            return updated
          })
          return
        }
        case 'approval.requested': {
          setPendingApprovals((prev) => {
            if (prev.some((p) => p.gateId === event.gateId)) return prev
            return [
              ...prev,
              {
                gateId: event.gateId,
                sessionId: event.sessionId,
                approvalId: event.approvalId,
                toolName: event.toolName,
                ...(event.reason !== undefined ? { reason: event.reason } : {}),
                ...(event.callId !== undefined
                  ? { argsSummary: toolCallsRef.current.get(event.callId) }
                  : {}),
              },
            ]
          })
          return
        }
        case 'approval.resolved': {
          setPendingApprovals((prev) => prev.filter((p) => p.approvalId !== event.approvalId))
          return
        }
        case 'question.requested': {
          setPendingQuestions((prev) => {
            if (prev.some((p) => p.gateId === event.gateId)) return prev
            return [
              ...prev,
              {
                gateId: event.gateId,
                sessionId: event.sessionId,
                questions: (event.questions ?? []) as QuestionItem[],
              },
            ]
          })
          return
        }
        case 'question.resolved': {
          setPendingQuestions((prev) => prev.filter((p) => p.gateId !== event.gateId))
          return
        }
        case 'queue.changed': {
          if (event.sessionId !== sessionIdRef.current) return
          setQueue(
            event.items
              .filter((item) => item.placement !== 'context')
              .map((item) => ({
                itemId: item.itemId,
                placement: item.placement === 'steering' ? 'steering' : 'queued',
                text: item.text,
              })),
          )
          return
        }
        default:
          return
      }
    },
    [upsertItem, appendText, finalizeText],
  )

  /** Respond helpers: optimistic removal, the resolved event confirms. */
  const answerApproval = useCallback(
    (pending: PendingApproval, outcome: 'allowed-once' | 'rejected'): void => {
      setPendingApprovals((prev) => prev.filter((p) => p.approvalId !== pending.approvalId))
      void dsh
        .respond(pending.sessionId, pending.gateId, {
          kind: 'approval',
          approvalId: pending.approvalId,
          outcome: outcome === 'allowed-once' ? 'allow-once' : 'reject',
        })
        .then((receipt) => {
          if (!receipt.accepted) {
            console.log(`[dsh-session] approval respond refused: ${receipt.reason ?? 'unknown'}`)
          }
        })
        .catch((error: unknown) => {
          console.log(`[dsh-session] approval respond failed: ${String(error)}`)
        })
    },
    [],
  )

  const answerQuestion = useCallback(
    (pending: PendingQuestion, answers: QuestionAnswerItem[]): void => {
      setPendingQuestions((prev) => prev.filter((p) => p.gateId !== pending.gateId))
      void dsh
        .respond(pending.sessionId, pending.gateId, { kind: 'question', answers })
        .then((receipt) => {
          if (!receipt.accepted) {
            console.log(`[dsh-session] question respond refused: ${receipt.reason ?? 'unknown'}`)
          }
        })
        .catch((error: unknown) => {
          console.log(`[dsh-session] question respond failed: ${String(error)}`)
        })
    },
    [],
  )

  const cancelQuestion = useCallback(
    (pending: PendingQuestion): void => {
      setPendingQuestions((prev) => prev.filter((p) => p.gateId !== pending.gateId))
      void dsh
        .respond(pending.sessionId, pending.gateId, 'cancel')
        .then((receipt) => {
          if (!receipt.accepted) {
            console.log(`[dsh-session] question cancel refused: ${receipt.reason ?? 'unknown'}`)
          }
        })
        .catch((error: unknown) => {
          console.log(`[dsh-session] question cancel failed: ${String(error)}`)
        })
    },
    [],
  )

  const interrupt = useCallback((): void => {
    const id = sessionIdRef.current
    if (id === null) return
    void dsh
      .cancelSession(id)
      .then((receipt) => {
        if (!receipt.accepted) {
          console.log('[dsh-session] cancel refused')
        }
      })
      .catch((error: unknown) => {
        console.log(`[dsh-session] cancel failed: ${String(error)}`)
      })
  }, [])

  /** Remove one queued message (optimistic; the next snapshot confirms). */
  const dequeue = useCallback((itemId: string): void => {
    const id = sessionIdRef.current
    if (id === null) return
    setQueue((prev) => prev.filter((item) => item.itemId !== itemId))
    void dsh.removeQueuedMessage(id, itemId).catch((error: unknown) => {
      console.log(`[dsh-session] dequeue failed: ${String(error)}`)
    })
  }, [])

  const send = useCallback(
    (text: string): void => {
      const trimmed = text.trim()
      if (trimmed === '' || busy) return
      setBusy(true)
      // No optimistic bubbles: the backend echo arrives as transcript items
      // (user text, then reasoning/text blocks) within milliseconds.
      void (async () => {
        try {
          if (sessionIdRef.current === null) {
            const workspaceId = workspaceIdRef.current ?? null
            const cwd = workspaceId === null ? await dsh.defaultCwd() : undefined
            sessionIdRef.current = await dsh.createSession(
              workspaceId !== null
                ? { workspaceId }
                : { cwd: cwd ?? '' },
            )
            selfCreatedRef.current.add(sessionIdRef.current)
            onSessionCreatedRef.current?.(sessionIdRef.current)
          }
          await dsh.prompt(sessionIdRef.current, trimmed)
        } catch (error) {
          setMessages((prev) => [
            ...prev,
            {
              id: nextId(),
              kind: 'assistant',
              text: '',
              error: error instanceof Error ? error.message : String(error),
            },
          ])
        } finally {
          setBusy(false)
        }
      })()
    },
    [busy],
  )

  return {
    status,
    messages,
    busy,
    send,
    queue,
    interrupt,
    dequeue,
    pendingApprovals,
    pendingQuestions,
    answerApproval,
    answerQuestion,
    cancelQuestion,
  }
}

/** Convenience for components that only want the element. */
export type DshSessionElement = ReactElement
