/**
 * ChatStream — the transcript view over semantic transcript items (§2.3):
 * user content right (light bubble), assistant markdown left as plain
 * text flow (reference style — no card). Everything after a user message
 * forms that message's TURN GROUP: step rows (reasoning + tool calls) fold
 * under a single group header — "工作中 N 秒" while the turn runs, then
 * "已工作 N 秒" with a collapse chevron (collapsed by default, the answer
 * text stays visible). Auto-scrolls to the newest entry.
 * `children` render at the tail (the answerable gates live there);
 * `trailTick` tells the scroller the tail changed without diffing children.
 */
import { useEffect, useRef, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { Icon } from '@uibase'
import type { ChatMessage } from './use-session'
import { Markdown } from './Markdown'

export interface ChatStreamProps {
  messages: ChatMessage[]
  /** Bumped when the trailing children change identity (e.g. gate count). */
  trailTick?: number
  children?: ReactNode
  /** Seconds elapsed on the running turn (present only while one runs). */
  runningSec?: number | null
  /** Measured wall-clock span of the most recently finished turn. */
  lastTurnMs?: number | null
}

/** Small chevron for fold heads (rotates when open). Lucide `chevron-right`. */
function Chev({ open }: { open: boolean }): ReactElement {
  return (
    <Icon
      viewBox="0 0 24 24"
      strokeWidth={1.8}
      className={`fold-chev${open ? ' fold-chev--open' : ''}`}
    >
      <path d="m9 18 6-6-6-6" />
    </Icon>
  )
}

/** Hover action row under one message: copy + (timestamp when available). */
function MsgActions({ text }: { text: string }): ReactElement {
  const [copied, setCopied] = useState(false)
  return (
    <div className="msg-actions">
      <button
        type="button"
        aria-label="复制内容"
        onClick={() => {
          void navigator.clipboard.writeText(text).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 1200)
          })
        }}
      >
        {copied ? (
          '已复制'
        ) : (
          <Icon viewBox="0 0 24 24" strokeWidth={1.6}>
            {/* lucide:copy */}
            <rect x="9" y="9" width="12" height="12" rx="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </Icon>
        )}
      </button>
    </div>
  )
}

type StepIconKind = 'think' | 'terminal' | 'skill' | 'write' | 'read' | 'search' | 'todo' | 'generic'

/**
 * Lucide icon bodies (fetched from api.iconify.design; same vocabulary the
 * reference UI uses). NEVER hand-drawn — see the icon rule in AGENTS.md.
 */
const LUCIDE: Record<StepIconKind, ReactElement> = {
  think: (
    <>
      <path d="M12 18V5m3 8a4.17 4.17 0 0 1-3-4 4.17 4.17 0 0 1-3 4m8.598-6.5A3 3 0 1 0 12 5a3 3 0 1 0-5.598 1.5" />
      <path d="M17.997 5.125a4 4 0 0 1 2.526 5.77" />
      <path d="M18 18a4 4 0 0 0 2-7.464" />
      <path d="M19.967 17.483A4 4 0 1 1 12 18a4 4 0 1 1-7.967-.517" />
      <path d="M6 18a4 4 0 0 1-2-7.464" />
      <path d="M6.003 5.125a4 4 0 0 0-2.526 5.77" />
    </>
  ),
  terminal: (
    <>
      <path d="m7 11 2-2-2-2m4 6h4" />
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
    </>
  ),
  skill: (
    <>
      <path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z" />
      <circle cx="4" cy="20" r="2" />
    </>
  ),
  write: (
    <>
      <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z" />
    </>
  ),
  read: (
    <>
      <path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" />
      <path d="M14 2v5a1 1 0 0 0 1 1h5M10 9H8m8 4H8m8 4H8" />
    </>
  ),
  search: (
    <>
      <path d="m21 21-4.34-4.34" />
      <circle cx="11" cy="11" r="8" />
    </>
  ),
  todo: (
    <>
      <path d="M13 5h8m-8 7h8m-8 7h8M3 17l2 2 4-4" />
      <rect width="6" height="6" x="3" y="4" rx="1" />
    </>
  ),
  generic: <circle cx="12" cy="12" r="10" />,
}

/** Category glyph for a fold row (reference look: icon + label + summary). */
function StepIcon({ kind }: { kind: StepIconKind }): ReactElement {
  return (
    <Icon viewBox="0 0 24 24" strokeWidth={1.6} className="step-ico">
      {LUCIDE[kind]}
    </Icon>
  )
}

function firstString(args: Record<string, unknown> | undefined, keys: string[]): string | undefined {
  if (args === undefined) return undefined
  for (const key of keys) {
    const value = args[key]
    if (typeof value === 'string' && value.trim() !== '') return value.trim()
  }
  return undefined
}

/** Map a tool call onto its human fold label + one-line summary. Unknown
 *  tools keep their raw name as the label. */
function toolCategory(
  title: string,
  argsText: string | undefined,
): { label: string; icon: StepIconKind; summary?: string } {
  let args: Record<string, unknown> | undefined
  try {
    args = argsText === undefined ? undefined : (JSON.parse(argsText) as Record<string, unknown>)
  } catch {
    args = undefined
  }
  const clip = (value: string | undefined): string | undefined =>
    value === undefined ? undefined : value.length > 90 ? `${value.slice(0, 90)}…` : value
  const name = title.toLowerCase()
  if (['pwsh', 'powershell', 'bash', 'sh', 'cmd', 'zsh'].includes(name))
    return { label: '终端', icon: 'terminal', summary: clip(firstString(args, ['command', 'cmd', 'script'])) }
  if (name === 'skill') {
    const id = firstString(args, ['skill', 'name'])
    const desc = firstString(args, ['description'])
    return { label: '技能', icon: 'skill', summary: clip([id, desc].filter(Boolean).join('  ') || undefined) }
  }
  if (['write', 'edit', 'multiedit', 'notebookedit'].includes(name))
    return { label: '写入', icon: 'write', summary: clip(firstString(args, ['path', 'file_path', 'notebook_path'])) }
  if (name === 'read')
    return { label: '读取', icon: 'read', summary: clip(firstString(args, ['path', 'file_path'])) }
  if (['glob', 'grep', 'ls'].includes(name))
    return { label: '搜索', icon: 'search', summary: clip(firstString(args, ['pattern', 'path', 'query'])) }
  if (name.includes('todo')) return { label: '待办', icon: 'todo' }
  return {
    label: title === '' ? '工具调用' : title,
    icon: 'generic',
    summary: clip(firstString(args, Object.keys(args ?? {}))),
  }
}

/** One collapsible tool-call row: icon + category label + summary; the raw
 *  args/result stay behind the fold. */
function ToolBlock({ message }: { message: ChatMessage }): ReactElement {
  const [open, setOpen] = useState(false)
  if (message.kind !== 'tool') return <></>
  const cat = toolCategory(message.title ?? '', message.argsText)
  const expandable = message.argsText !== undefined || message.resultText !== undefined
  return (
    <div className="chat-row chat-row--assistant">
      <div className={`tool-card${message.status === 'running' ? ' tool-card--running' : ''}`}>
        <button
          type="button"
          className="tool-head"
          aria-expanded={open}
          onClick={() => {
            if (expandable) setOpen(!open)
          }}
        >
          <StepIcon kind={cat.icon} />
          <span className="tool-label">{cat.label}</span>
          {cat.summary !== undefined && <span className="tool-sum">{cat.summary}</span>}
          {expandable && <Chev open={open} />}
        </button>
        {open && (
          <div className="tool-body">
            {message.argsText !== undefined && <pre className="tool-pre">{message.argsText}</pre>}
            {message.resultText !== undefined && <pre className="tool-pre">{message.resultText}</pre>}
          </div>
        )}
      </div>
    </div>
  )
}

/** One collapsible reasoning row. Default COLLAPSED in every state: while
 *  streaming the head shows "正在思考 · 〈live tail of the text〉", once done
 *  "思考 · 持续了 N 秒"; clicking expands the text behind a left rule. */
function ReasoningBlock({ message, tick }: { message: ChatMessage; tick?: number | null }): ReactElement {
  const [open, setOpen] = useState(false)
  if (message.kind !== 'reasoning') return <></>
  void tick // per-second re-render trigger while the turn runs
  const streaming = message.streaming === true
  const elapsed =
    streaming && message.startedAt !== undefined
      ? Math.max(0, Math.floor((Date.now() - message.startedAt) / 1000))
      : undefined
  const duration =
    message.durationMs !== undefined ? Math.max(1, Math.round(message.durationMs / 1000)) : undefined
  const meta = streaming
    ? elapsed !== undefined
      ? `持续了 ${elapsed} 秒`
      : undefined
    : duration !== undefined
      ? `持续了 ${duration} 秒`
      : undefined
  const snippet = message.text === '' ? undefined : `…${message.text.slice(-72)}`
  return (
    <div className="chat-row chat-row--assistant">
      <div className={`reasoning-card${streaming ? ' reasoning-card--streaming' : ''}`}>
        <button
          type="button"
          className="tool-head"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <StepIcon kind="think" />
          {streaming && !open ? (
            <>
              <span className="tool-label">正在思考</span>
              {snippet !== undefined && <span className="think-snippet">{snippet}</span>}
            </>
          ) : (
            <>
              <span className="tool-label">思考</span>
              {meta !== undefined && <span className="tool-meta">{meta}</span>}
            </>
          )}
          <Chev open={open} />
        </button>
        {open && (
          /* Same body wrapper as the tool fold: rule on the icon axis, text
             on the label axis — without it the pre sits at the card's raw
             left edge, outdented past the head row. */
          <div className="tool-body">
            <pre className="tool-pre reasoning-text">{message.text}</pre>
          </div>
        )}
      </div>
    </div>
  )
}

/** One transcript row, any kind. */
function Row({ message, tick }: { message: ChatMessage; tick?: number | null }): ReactElement {
  if (message.kind === 'tool') return <ToolBlock message={message} />
  if (message.kind === 'reasoning') return <ReasoningBlock message={message} tick={tick} />
  if (message.kind === 'user') {
    return (
      <div className="chat-row chat-row--user">
        <div className="chat-bubble chat-bubble--user">
          {message.content.map((part, i) => (part.type === 'text' ? <span key={i}>{part.text}</span> : null))}
        </div>
        <MsgActions text={message.content.map((p) => (p.type === 'text' ? p.text : '')).join('')} />
      </div>
    )
  }
  return (
    <div className="chat-row chat-row--assistant">
      {message.error !== undefined ? (
        <div className="chat-error">发送失败：{message.error}</div>
      ) : (
        <div className={`chat-assistant${message.streaming ? ' chat-assistant--streaming' : ''}`}>
          <Markdown text={message.text} />
        </div>
      )}
      {!message.streaming && message.text !== '' && <MsgActions text={message.text} />}
    </div>
  )
}

/** One turn's fold: a quiet header ("工作中 N 秒" / "已工作 N 秒 ˅") over the
 *  turn's step rows. Open while the turn runs; collapsed once it ends (the
 *  answer text rows stay visible), click toggles. */
function TurnGroup({
  running,
  elapsedSec,
  doneMs,
  items,
}: {
  running: boolean
  elapsedSec?: number | null
  doneMs?: number | null
  items: ChatMessage[]
}): ReactElement {
  const [expanded, setExpanded] = useState(false)
  const open = running || expanded
  const fmt = (ms: number): string => {
    const s = Math.max(1, Math.round(ms / 1000))
    return s < 60 ? `${s} 秒` : `${Math.floor(s / 60)} 分 ${s % 60} 秒`
  }
  const label = running
    ? `工作中 ${elapsedSec ?? 0} 秒`
    : `已工作${doneMs != null ? ` ${fmt(doneMs)}` : ''}`
  const visible = open ? items : items.filter((m) => m.kind !== 'tool' && m.kind !== 'reasoning')
  return (
    <div className="turn-group">
      <button
        type="button"
        className={`turn-head${running ? ' turn-head--running' : ''}`}
        aria-expanded={open}
        onClick={() => {
          if (!running) setExpanded(!expanded)
        }}
      >
        <span className={`turn-head-label${running ? ' turn-head-label--running' : ''}`}>{label}</span>
        {!running && <Chev open={open} />}
      </button>
      <div className="turn-steps">
        {visible.map((m) => (
          <Row key={m.id} message={m} tick={running ? elapsedSec : null} />
        ))}
      </div>
    </div>
  )
}

export function ChatStream({
  messages,
  trailTick = 0,
  runningSec = null,
  lastTurnMs = null,
  children,
}: ChatStreamProps): ReactElement {
  const streamRef = useRef<HTMLDivElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const [jumpVisible, setJumpVisible] = useState(false)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, trailTick])

  const onScroll = (): void => {
    const el = streamRef.current
    if (el === null) return
    const fromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    setJumpVisible(fromBottom > 240)
  }

  const jumpToBottom = (): void => {
    streamRef.current?.scrollTo({ top: streamRef.current.scrollHeight, behavior: 'smooth' })
  }

  // Segment into turn groups: everything after a user message belongs to that
  // message's turn. The last group carries the live clock / finished duration.
  const segments: ReactElement[] = []
  let group: ChatMessage[] = []
  let groupStart = 0
  messages.forEach((message, index) => {
    if (message.kind === 'user') {
      if (group.length > 0)
        segments.push(
          <TurnGroup key={`turn-${groupStart}`} running={false} doneMs={null} items={group} />,
        )
      group = []
      segments.push(<Row key={message.id} message={message} />)
      groupStart = index + 1
      return
    }
    if (group.length === 0) groupStart = index
    group.push(message)
  })
  if (group.length > 0) {
    const running = runningSec !== null && runningSec !== undefined
    segments.push(
      <TurnGroup
        key={`turn-${groupStart}`}
        running={running}
        elapsedSec={runningSec}
        doneMs={running ? null : lastTurnMs}
        items={group}
      />,
    )
  }

  return (
    <div className="chat-stream-wrap">
      <div ref={streamRef} className="chat-stream" onScroll={onScroll} aria-label="会话消息">
        {segments}
        {children}
        <div ref={endRef} />
      </div>
      {jumpVisible && (
        <button
          type="button"
          className="chat-jump"
          aria-label="滚动到底部"
          onClick={jumpToBottom}
        >
          <Icon viewBox="0 0 24 24" strokeWidth={1.8}>
            <path d="m6 9 6 6 6-6" />
          </Icon>
        </button>
      )}
    </div>
  )
}
