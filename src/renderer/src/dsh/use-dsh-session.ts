/**
 * useDshSession — the renderer's session state machine over the CodedBridge:
 * lifecycle status, one active session, and the chat transcript.
 *
 * Event mapping (mux stream): `assistant/chunk` text deltas append to the
 * streaming assistant message; `assistant/message` finalizes it (the
 * assembled text wins over the delta accumulation, in case a chunk was
 * dropped); user messages render locally on send and are not re-rendered
 * from the echo.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { dsh } from './client'
import type {
  ApprovalRequestedFrame,
  ApprovalResolvedFrame,
  DshStatus,
  QuestionItem,
  QuestionRequestedFrame,
  QuestionResolvedFrame,
  SessionEventFrame,
  TextChunk,
} from './client'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  /** True while the assistant message is still receiving deltas. */
  streaming?: boolean
  /** Set when the send failed before/while dispatching. */
  error?: string
}

/** A pending tool-call approval (answerable via its stable envelope rpcId). */
export interface PendingApproval {
  rpcId: string
  sessionId: string
  approvalId: string
  toolName: string
  reason?: string
  /** Best-effort summary of the correlated tool/call arguments. */
  argsSummary?: string
}

/** A pending user-question batch (answerable via its stable envelope rpcId). */
export interface PendingQuestion {
  rpcId: string
  sessionId: string
  questions: QuestionItem[]
}

/** One answer inside a question batch response. */
export interface QuestionAnswerItem {
  id: string
  selected: string[]
  custom?: string
}

let idCounter = 0
function nextId(): string {
  idCounter += 1
  return `m${idCounter}`
}

/** Extract the plain text out of an assembled AssistantMessage (defensive —
 *  the content block shape belongs to dsh-llm). */
function assistantText(message: unknown): string {
  const content = (message as { content?: unknown })?.content
  if (!Array.isArray(content)) return ''
  return content
    .map((block) => {
      const b = block as { type?: string; text?: string }
      return b?.type === 'text' && typeof b.text === 'string' ? b.text : ''
    })
    .join('')
}

export interface DshSession {
  status: DshStatus
  messages: ChatMessage[]
  /** True while a send is in flight (composer locks). */
  busy: boolean
  send: (text: string) => void
  /** Answerable frames awaiting the user (active session only). */
  pendingApprovals: PendingApproval[]
  pendingQuestions: PendingQuestion[]
  answerApproval: (pending: PendingApproval, outcome: 'allowed-once' | 'rejected') => void
  answerQuestion: (pending: PendingQuestion, answers: QuestionAnswerItem[]) => void
  cancelQuestion: (pending: PendingQuestion) => void
}

/** The mux frame kinds this hook consumes (adapter-side filter list). */
const MUX_TYPES = [
  'session/event',
  'approval/requested',
  'approval/resolved',
  'question/requested',
  'question/resolved',
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

export function useDshSession(): DshSession {
  const [status, setStatus] = useState<DshStatus>('starting')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [busy, setBusy] = useState(false)
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([])
  const [pendingQuestions, setPendingQuestions] = useState<PendingQuestion[]>([])
  const sessionIdRef = useRef<string | null>(null)
  /** Subscribed at most once per bridge-connected epoch. */
  const subscribedRef = useRef(false)
  /** callId → args summary, for the approval card's arguments line. */
  const toolCallsRef = useRef(new Map<string, string>())

  useEffect(() => {
    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let lastStatus: DshStatus = 'starting'
    /** Subscribe the mux stream once per bridge-connected epoch. */
    const subscribe = (): void => {
      if (subscribedRef.current) return
      subscribedRef.current = true
      console.log('[dsh-session] opening mux stream')
      void dsh
        .openMux(
          {
            onEvent: (frame) => {
              handleSessionEvent(frame)
            },
            onApproval: (frame, rpcId) => {
              handleApproval(frame, rpcId)
            },
            onQuestion: (frame, rpcId) => {
              handleQuestion(frame, rpcId)
            },
            onEnd: (reason) => {
              console.log(`[dsh-session] mux ended: ${reason ?? 'closed'}`)
              subscribedRef.current = false
              // Self-heal: a mux that dies while the bridge stays connected
              // would otherwise leave the UI deaf until the next reconnect.
              if (!cancelled && lastStatus === 'bridge-connected') {
                retryTimer = setTimeout(() => {
                  retryTimer = null
                  if (!cancelled && !subscribedRef.current && lastStatus === 'bridge-connected') {
                    console.log('[dsh-session] resubscribing mux after unexpected end')
                    subscribe()
                  }
                }, 1000)
              }
            },
          },
          // Only chat + answerable traffic crosses the pipe — bulky
          // projections stay host-side (adapter-side filter).
          { types: MUX_TYPES },
        )
        .catch((error) => {
          console.log(`[dsh-session] mux open failed: ${String(error)}`)
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

  const appendAssistantDelta = useCallback((text: string): void => {
    setMessages((prev) => {
      const last = prev[prev.length - 1]
      if (last !== undefined && last.role === 'assistant' && last.streaming === true) {
        return [...prev.slice(0, -1), { ...last, text: last.text + text }]
      }
      return [...prev, { id: nextId(), role: 'assistant', text, streaming: true }]
    })
  }, [])

  const finalizeAssistant = useCallback((text: string): void => {
    setMessages((prev) => {
      const last = prev[prev.length - 1]
      if (last !== undefined && last.role === 'assistant' && last.streaming === true) {
        const settled = text !== '' ? text : last.text
        return [...prev.slice(0, -1), { ...last, text: settled, streaming: false }]
      }
      if (text !== '') return [...prev, { id: nextId(), role: 'assistant', text }]
      return prev
    })
  }, [])

  const handleSessionEvent = useCallback(
    (frame: SessionEventFrame): void => {
      // Only the active session's events render.
      if (sessionIdRef.current !== null && frame.sessionId !== sessionIdRef.current) return
      const event = frame.event
      // SessionEvent payloads sit in the `data` slot:
      // {type:'assistant/chunk', data:{turn, step, chunk}} and
      // {type:'assistant/message', data:{turn, step, content}}.
      const data = event.data as { chunk?: TextChunk; content?: unknown } | undefined
      switch (event.type) {
        case 'assistant/chunk': {
          const chunk = data?.chunk
          if (chunk?.type === 'text-delta' && typeof chunk.text === 'string') {
            appendAssistantDelta(chunk.text)
          }
          return
        }
        case 'assistant/message': {
          finalizeAssistant(assistantText(data))
          return
        }
        case 'tool/call': {
          // Remember the arguments so an approval card can show what it is
          // approving (approval/requested itself carries no arguments).
          const call = event.data as { callId?: unknown; arguments?: unknown } | undefined
          if (typeof call?.callId === 'string') {
            const summary = summarizeArgs(call.arguments)
            if (summary !== undefined) toolCallsRef.current.set(call.callId, summary)
          }
          return
        }
        default:
          return
      }
    },
    [appendAssistantDelta, finalizeAssistant],
  )

  /** Answerable approval frames: requested adds, resolved removes. */
  const handleApproval = useCallback(
    (frame: ApprovalRequestedFrame | ApprovalResolvedFrame, rpcId: string): void => {
      if (sessionIdRef.current !== null && frame.sessionId !== sessionIdRef.current) return
      if (frame.type === 'approval/requested') {
        setPendingApprovals((prev) => {
          if (prev.some((p) => p.approvalId === frame.approvalId)) return prev
          return [
            ...prev,
            {
              rpcId,
              sessionId: frame.sessionId,
              approvalId: frame.approvalId,
              toolName: frame.toolName,
              ...(frame.reason !== undefined ? { reason: frame.reason } : {}),
              ...(frame.callId !== undefined
                ? { argsSummary: toolCallsRef.current.get(frame.callId) }
                : {}),
            },
          ]
        })
        return
      }
      // approval/resolved
      setPendingApprovals((prev) => prev.filter((p) => p.approvalId !== frame.approvalId))
    },
    [],
  )

  /** Answerable question frames: requested adds, resolved removes by rpcId. */
  const handleQuestion = useCallback(
    (frame: QuestionRequestedFrame | QuestionResolvedFrame, rpcId: string): void => {
      if (sessionIdRef.current !== null && frame.sessionId !== sessionIdRef.current) return
      if (frame.type === 'question/requested') {
        setPendingQuestions((prev) => {
          if (prev.some((p) => p.rpcId === rpcId)) return prev
          return [...prev, { rpcId, sessionId: frame.sessionId, questions: frame.questions }]
        })
        return
      }
      // question/resolved keys by the request's rpcId.
      setPendingQuestions((prev) => prev.filter((p) => p.rpcId !== frame.questionRpcId))
    },
    [],
  )

  /** Respond helpers: optimistic removal, the resolved frame confirms. */
  const answerApproval = useCallback(
    (pending: PendingApproval, outcome: 'allowed-once' | 'rejected'): void => {
      setPendingApprovals((prev) => prev.filter((p) => p.approvalId !== pending.approvalId))
      void dsh
        .respond(pending.rpcId, {
          ok: true,
          value: { sessionId: pending.sessionId, approvalId: pending.approvalId, outcome },
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
      setPendingQuestions((prev) => prev.filter((p) => p.rpcId !== pending.rpcId))
      void dsh
        .respond(pending.rpcId, {
          ok: true,
          value: { sessionId: pending.sessionId, answer: { answers } },
        })
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
      setPendingQuestions((prev) => prev.filter((p) => p.rpcId !== pending.rpcId))
      void dsh
        .respond(pending.rpcId, {
          ok: false,
          error: { code: 'cancelled', message: 'the user cancelled' },
        })
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

  const send = useCallback(
    (text: string): void => {
      const trimmed = text.trim()
      if (trimmed === '' || busy) return
      setBusy(true)
      setMessages((prev) => [
        ...prev,
        { id: nextId(), role: 'user', text: trimmed },
        // Thinking indicator: the first delta may take a while (reasoning
        // models), silence must still look alive.
        { id: nextId(), role: 'assistant', text: '', streaming: true },
      ])
      void (async () => {
        try {
          if (sessionIdRef.current === null) {
            const cwd = await dsh.defaultCwd()
            sessionIdRef.current = await dsh.createSession(cwd)
            console.log(`[dsh-session] session created: ${sessionIdRef.current}`)
          }
          await dsh.prompt(sessionIdRef.current, trimmed)
        } catch (error) {
          console.log(`[dsh-session] send failed: ${String(error)}`)
          setMessages((prev) => [
            ...prev,
            {
              id: nextId(),
              role: 'assistant',
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
    pendingApprovals,
    pendingQuestions,
    answerApproval,
    answerQuestion,
    cancelQuestion,
  }
}

/** Convenience for components that only want the element. */
export type DshSessionElement = ReactElement
