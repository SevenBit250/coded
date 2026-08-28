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
  SessionQueueFrame,
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
  /** 'tool' marks a tool-call block (a transcript card, not a chat bubble). */
  kind?: 'text' | 'tool' | 'reasoning'
  /** Tool block fields (kind === 'tool'). */
  callId?: string
  toolName?: string
  /** Presentation title from the host view (falls back to toolName). */
  toolTitle?: string
  toolCard?: string
  toolStatus?: 'running' | 'done'
  /** Pretty-printed call arguments (expanded view). */
  argsText?: string
  /** Result body (expanded view): terminal output or result text. */
  resultText?: string
  /** Short result meta line, e.g. "exit 0" or the replacement title. */
  resultMeta?: string
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

/** Pretty-printed call arguments for the tool block's expanded view. */
function prettyArgs(raw: unknown): string | undefined {
  if (typeof raw !== 'string' || raw === '') return undefined
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}

/** One queued message (admission pending), rendered in the composer strip. */
export interface QueuedMessage {
  id: string
  placement: 'queued' | 'steering' | 'context'
  text: string
}

export interface DshSession {
  status: DshStatus
  messages: ChatMessage[]
  /** True while a send is in flight (composer locks). */
  busy: boolean
  send: (text: string) => void
  /** Bumped on each turn/end of the active session (directory refresh cue). */
  turnTick: number
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

/** The mux frame kinds this hook consumes (adapter-side filter list). */
const MUX_TYPES = [
  'session/event',
  'session/queue',
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
  /** Queued (not yet admitted) messages of the active session. */
  const [queue, setQueue] = useState<QueuedMessage[]>([])
  const sessionIdRef = useRef<string | null>(null)
  /** Sessions this client created itself — their transcript is already
   *  local, so the switch effect must not rebuild it from history. */
  const selfCreatedRef = useRef<Set<string>>(new Set())
  /** Subscribed at most once per bridge-connected epoch. */
  const subscribedRef = useRef(false)
  /** callId → args summary, for the approval card's arguments line. */
  const toolCallsRef = useRef(new Map<string, string>())
  /** Live reasoning blocks: `${turn}:${step}:${index}` → transcript id. */
  const reasoningBlocksRef = useRef(new Map<string, string>())
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
            onQueue: (frame) => {
              handleQueue(frame)
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
    setQueue([])
    reasoningBlocksRef.current.clear()
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
            // Reasoning blocks ride the message content before the text —
            // rebuild them as collapsed "thinking" cards.
            const content = (data as { message?: { content?: unknown }; content?: unknown })
              ?.message?.content
            if (Array.isArray(content)) {
              for (const block of content) {
                const b = block as { type?: string; text?: string }
                if (b?.type === 'reasoning' && typeof b.text === 'string' && b.text !== '') {
                  rebuilt.push({
                    id: nextId(),
                    role: 'assistant',
                    text: b.text,
                    kind: 'reasoning',
                  })
                }
              }
            }
            const text = messageEventText(data)
            if (text !== '') rebuilt.push({ id: nextId(), role: 'assistant', text })
          } else if (entry.event.type === 'tool/call') {
            const call = data as { callId?: unknown; name?: unknown; arguments?: unknown } | undefined
            if (typeof call?.callId !== 'string') continue
            const callView = entry.view?.for === 'call' ? entry.view.view : undefined
            rebuilt.push({
              id: nextId(),
              role: 'assistant',
              text: '',
              kind: 'tool',
              callId: call.callId,
              ...(typeof call.name === 'string' ? { toolName: call.name } : {}),
              ...(typeof callView?.title === 'string' ? { toolTitle: callView.title } : {}),
              ...(typeof callView?.card === 'string' ? { toolCard: callView.card } : {}),
              toolStatus: 'running',
              ...(prettyArgs(call.arguments) !== undefined
                ? { argsText: prettyArgs(call.arguments) }
                : {}),
            })
          } else if (entry.event.type === 'tool/result') {
            const result = data as { callId?: unknown; content?: unknown } | undefined
            if (typeof result?.callId !== 'string') continue
            const resultView = entry.view?.for === 'result' ? entry.view.view : undefined
            const output =
              typeof resultView?.output === 'string'
                ? resultView.output
                : contentText(result.content)
            for (let i = rebuilt.length - 1; i >= 0; i--) {
              if (rebuilt[i].kind === 'tool' && rebuilt[i].callId === result.callId) {
                rebuilt[i] = {
                  ...rebuilt[i],
                  ...(typeof resultView?.title === 'string' ? { toolTitle: resultView.title } : {}),
                  ...(typeof resultView?.card === 'string' ? { toolCard: resultView.card } : {}),
                  ...(output !== '' ? { resultText: output } : {}),
                  ...(typeof resultView?.exitCode === 'number'
                    ? { resultMeta: `exit ${String(resultView.exitCode)}` }
                    : typeof resultView?.signal === 'string'
                      ? { resultMeta: `signal ${resultView.signal}` }
                      : {}),
                  toolStatus: 'done',
                }
                break
              }
            }
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
      // Merge target is a PLAIN text bubble only — a streaming reasoning card
      // is also role=assistant/streaming, and some models emit text-deltas
      // before the reasoning block-end; merging would pour the body into the
      // thinking card.
      if (
        last !== undefined &&
        last.role === 'assistant' &&
        last.kind === undefined &&
        last.streaming === true
      ) {
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

  /** Append a tool-call block; drops an empty non-streaming bubble that a
   *  textless assistant/message left behind (placeholder cleanup). */
  const appendToolBlock = useCallback((block: ChatMessage): void => {
    setMessages((prev) => {
      const last = prev[prev.length - 1]
      const base =
        last !== undefined && last.kind === undefined && last.role === 'assistant' &&
        last.text === '' && last.streaming !== true && last.error === undefined
          ? prev.slice(0, -1)
          : prev
      return [...base, block]
    })
  }, [])

  /** Pair a tool/result with its running block by callId. */
  const completeToolBlock = useCallback(
    (callId: string, patch: Partial<ChatMessage>): void => {
      setMessages((prev) => {
        for (let i = prev.length - 1; i >= 0; i--) {
          if (prev[i].kind === 'tool' && prev[i].callId === callId) {
            const updated = [...prev]
            updated[i] = { ...prev[i], ...patch, toolStatus: 'done' }
            return updated
          }
        }
        return prev
      })
    },
    [],
  )

  /** Patch one transcript block by id (reasoning deltas / calibration). */
  const patchBlock = useCallback(
    (id: string, patch: (m: ChatMessage) => ChatMessage): void => {
      setMessages((prev) => {
        const i = prev.findIndex((m) => m.id === id)
        if (i < 0) return prev
        const updated = [...prev]
        updated[i] = patch(prev[i])
        return updated
      })
    },
    [],
  )

  /** A live reasoning block: create on first delta (replacing a trailing
   *  empty streaming placeholder — the thinking indicator transforms),
   *  then accumulate. */
  const appendReasoningDelta = useCallback((key: string, text: string): void => {
    const existing = reasoningBlocksRef.current.get(key)
    if (existing !== undefined) {
      patchBlock(existing, (m) => ({ ...m, text: m.text + text }))
      return
    }
    const id = nextId()
    reasoningBlocksRef.current.set(key, id)
    setMessages((prev) => {
      const last = prev[prev.length - 1]
      const base =
        last !== undefined && last.kind === undefined && last.role === 'assistant' &&
        last.text === '' && last.streaming === true && last.error === undefined
          ? prev.slice(0, -1)
          : prev
      return [...base, { id, role: 'assistant', text, kind: 'reasoning', streaming: true }]
    })
  }, [patchBlock])

  /** block-end: the assembled reasoning text calibrates the accumulation. */
  const finalizeReasoning = useCallback((key: string, text: string): void => {
    const id = reasoningBlocksRef.current.get(key)
    if (id === undefined) {
      // No live deltas seen (e.g. resumed mid-block): surface the block whole.
      if (text !== '') {
        const newId = nextId()
        reasoningBlocksRef.current.set(key, newId)
        setMessages((prev) => [
          ...prev,
          { id: newId, role: 'assistant', text, kind: 'reasoning' },
        ])
      }
      return
    }
    patchBlock(id, (m) => ({ ...m, text: text !== '' ? text : m.text, streaming: false }))
  }, [patchBlock])

  const handleSessionEvent = useCallback(
    (frame: SessionEventFrame): void => {
      // Only the active session's events render.
      if (sessionIdRef.current !== null && frame.sessionId !== sessionIdRef.current) return
      const event = frame.event
      // SessionEvent payloads sit in the `data` slot:
      // {type:'assistant/chunk', data:{turn, step, chunk}} and
      // {type:'assistant/message', data:{turn, step, content}}.
      const data = event.data as
        | { turn?: number; step?: number; chunk?: TextChunk; content?: unknown }
        | undefined
      switch (event.type) {
        case 'assistant/chunk': {
          const chunk = data?.chunk as
            | {
                type?: string
                index?: number
                text?: string
                blockType?: string
                block?: { type?: string; text?: string }
              }
            | undefined
          if (chunk?.type === 'text-delta' && typeof chunk.text === 'string') {
            appendAssistantDelta(chunk.text)
          } else if (chunk?.type === 'reasoning-delta' && typeof chunk.text === 'string') {
            const key = `${String(data?.turn ?? 0)}:${String(data?.step ?? 0)}:${String(chunk.index ?? 0)}`
            appendReasoningDelta(key, chunk.text)
          } else if (
            chunk?.type === 'block-end' &&
            chunk.block?.type === 'reasoning' &&
            typeof chunk.block.text === 'string'
          ) {
            const key = `${String(data?.turn ?? 0)}:${String(data?.step ?? 0)}:${String(chunk.index ?? 0)}`
            finalizeReasoning(key, chunk.block.text)
          }
          return
        }
        case 'assistant/message': {
          finalizeAssistant(messageEventText(data))
          return
        }
        case 'tool/call': {
          const call = event.data as
            | { callId?: unknown; name?: unknown; arguments?: unknown }
            | undefined
          if (typeof call?.callId !== 'string') return
          // Remember the arguments so an approval card can show what it is
          // approving (approval/requested itself carries no arguments).
          const summary = summarizeArgs(call.arguments)
          if (summary !== undefined) toolCallsRef.current.set(call.callId, summary)
          // Transcript block. Host presentation view wins for the title.
          const callView = frame.view?.for === 'call' ? frame.view.view : undefined
          appendToolBlock({
            id: nextId(),
            role: 'assistant',
            text: '',
            kind: 'tool',
            callId: call.callId,
            ...(typeof call.name === 'string' ? { toolName: call.name } : {}),
            ...(typeof callView?.title === 'string' ? { toolTitle: callView.title } : {}),
            ...(typeof callView?.card === 'string' ? { toolCard: callView.card } : {}),
            toolStatus: 'running',
            ...(prettyArgs(call.arguments) !== undefined
              ? { argsText: prettyArgs(call.arguments) }
              : {}),
          })
          return
        }
        case 'tool/result': {
          const result = event.data as { callId?: unknown; content?: unknown } | undefined
          if (typeof result?.callId !== 'string') return
          const resultView = frame.view?.for === 'result' ? frame.view.view : undefined
          const output =
            typeof resultView?.output === 'string'
              ? resultView.output
              : contentText(result.content)
          completeToolBlock(result.callId, {
            ...(typeof resultView?.title === 'string' ? { toolTitle: resultView.title } : {}),
            ...(typeof resultView?.card === 'string' ? { toolCard: resultView.card } : {}),
            ...(output !== '' ? { resultText: output } : {}),
            ...(typeof resultView?.exitCode === 'number'
              ? { resultMeta: `exit ${String(resultView.exitCode)}` }
              : typeof resultView?.signal === 'string'
                ? { resultMeta: `signal ${resultView.signal}` }
                : {}),
          })
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
    [appendAssistantDelta, appendReasoningDelta, finalizeAssistant, finalizeReasoning],
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

  /** session/queue frames are full snapshots of one session's queue. */
  const handleQueue = useCallback(
    (frame: SessionQueueFrame): void => {
      if (sessionIdRef.current !== null && frame.sessionId !== sessionIdRef.current) return
      setQueue(
        frame.items.map((item) => ({
          id: item.id,
          placement: item.placement,
          text: contentText(item.message?.content),
        })),
      )
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

  /** Abort the active session's running turn. */
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
    setQueue((prev) => prev.filter((item) => item.id !== itemId))
    void dsh.removeQueuedMessage(id, itemId).catch((error: unknown) => {
      console.log(`[dsh-session] dequeue failed: ${String(error)}`)
    })
  }, [])

  return {
    status,
    messages,
    busy,
    send,
    turnTick,
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
