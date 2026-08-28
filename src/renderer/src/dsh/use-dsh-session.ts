/**
 * useDshSession — the renderer's session state machine over the CodedBridge:
 * lifecycle status, the ACTIVE session (switched from the sidebar), and the
 * chat transcript.
 *
 * Event mapping (mux stream): `assistant/chunk` text deltas append to the
 * streaming assistant message; `assistant/message` finalizes it (the
 * assembled text wins over the delta accumulation, in case a chunk was
 * dropped); user messages render locally on send and are not re-rendered
 * from the echo. Answerable frames (approvals/questions) live in pending
 * lists keyed by their stable rpcId, replayed by the host on resubscribe.
 *
 * Switching: `sessionId` arrives as a prop (sidebar selection); null means
 * "fresh draft" — the first send creates the session and reports it through
 * `onSessionCreated` so the sidebar can select it.
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

/** Extract the plain text out of an assembled message's content blocks
 *  (defensive — the content block shape belongs to dsh-llm). */
function contentText(content: unknown): string {
  if (!Array.isArray(content)) return ''
  return content
    .map((block) => {
      const b = block as { type?: string; text?: string }
      return b?.type === 'text' && typeof b.text === 'string' ? b.text : ''
    })
    .join('')
}

/**
 * Read the text of a message SessionEvent's data slot. The event carries the
 * message in the `message` slot (live mux and history API agree); the
 * bare-`content` fallback covers the raw journal shape.
 */
function messageEventText(data: unknown): string {
  const d = data as { message?: { content?: unknown }; content?: unknown } | undefined
  return contentText(d?.message?.content ?? d?.content)
}

/** True for a genuine human-authored user/message — injected context
 *  (agent-instructions, system-prompt plugin snapshots) also rides
 *  user/message but with a non-user source kind. */
function isHumanUserMessage(data: unknown): boolean {
  const source = (data as { source?: { kind?: unknown } } | undefined)?.source
  return source?.kind === 'user'
}

export interface DshSession {
  status: DshStatus
  messages: ChatMessage[]
  /** True while a send is in flight (composer locks). */
  busy: boolean
  send: (text: string) => void
  /** Bumped on each turn/end of the active session (directory refresh cue). */
  turnTick: number
  /** Answerable frames awaiting the user (all sessions; filter at render). */
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
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([])
  const [pendingQuestions, setPendingQuestions] = useState<PendingQuestion[]>([])
  /** Bumped on every turn/end of the active session (directory refresh cue). */
  const [turnTick, setTurnTick] = useState(0)
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

  // Session switch: rebuild the transcript from the durable event log.
  // Sessions this client created skip the reload — their transcript is live.
  useEffect(() => {
    if (sessionId === sessionIdRef.current) return
    sessionIdRef.current = sessionId
    setBusy(false)
    if (sessionId === null) {
      setMessages([])
      return
    }
    if (selfCreatedRef.current.has(sessionId)) return
    let stale = false
    setMessages([])
    console.log(`[dsh-session] history load start: ${sessionId}`)
    void dsh
      .sessionHistory(sessionId)
      .then((history) => {
        if (stale) return
        const rebuilt: ChatMessage[] = []
        for (const entry of history.events) {
          const data = entry.event.data
          if (entry.event.type === 'user/message') {
            // Injected context (AGENTS.md, system-prompt snapshots) also
            // rides user/message — only genuine human input renders.
            if (!isHumanUserMessage(data)) continue
            const text = messageEventText(data)
            if (text !== '') rebuilt.push({ id: nextId(), role: 'user', text })
          } else if (entry.event.type === 'assistant/message') {
            const text = messageEventText(data)
            if (text !== '') rebuilt.push({ id: nextId(), role: 'assistant', text })
          }
        }
        console.log(`[dsh-session] history rebuilt: ${String(rebuilt.length)} messages from ${String(history.events.length)} events`)
        setMessages(rebuilt)
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
          finalizeAssistant(messageEventText(data))
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
        case 'turn/end': {
          // Sidebar titles/recency ride the directory's baseline; bump a tick
          // so it re-pulls once the turn's title/projection writes landed.
          setTurnTick((n) => n + 1)
          return
        }
        default:
          return
      }
    },
    [appendAssistantDelta, finalizeAssistant],
  )

  /** Answerable approval frames: requested adds, resolved removes. Pendings
   *  are tracked for every session (the render side filters) so the replay
   *  baseline at subscribe time — which precedes any selection — survives. */
  const handleApproval = useCallback(
    (frame: ApprovalRequestedFrame | ApprovalResolvedFrame, rpcId: string): void => {
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
            const workspaceId = workspaceIdRef.current ?? null
            const cwd = workspaceId === null ? await dsh.defaultCwd() : undefined
            sessionIdRef.current = await dsh.createSession(
              workspaceId !== null
                ? { workspaceId }
                : { cwd: cwd ?? '' },
            )
            selfCreatedRef.current.add(sessionIdRef.current)
            console.log(`[dsh-session] session created: ${sessionIdRef.current}`)
            onSessionCreatedRef.current?.(sessionIdRef.current)
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
    turnTick,
    pendingApprovals,
    pendingQuestions,
    answerApproval,
    answerQuestion,
    cancelQuestion,
  }
}

/** Convenience for components that only want the element. */
export type DshSessionElement = ReactElement
