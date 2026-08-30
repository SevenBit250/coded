/**
 * ChatStream — the transcript view over semantic transcript items (§2.3):
 * user content right (light bubble), assistant markdown left as plain
 * text flow (reference style — no card), reasoning + tool-call blocks as
 * quiet fold rows inline. Auto-scrolls to the newest entry.
 * `header` renders at the top of the scroll content (turn timer);
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
  /** Rendered as the first element of the scroll content (turn timer). */
  header?: ReactNode
  children?: ReactNode
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

/** One collapsible tool-call block (running → done). */
function ToolBlock({ message }: { message: ChatMessage }): ReactElement {
  const [open, setOpen] = useState(false)
  if (message.kind !== 'tool') return <></>
  const title = message.title ?? '工具调用'
  const meta = message.status === 'running' ? '运行中' : (message.resultMeta ?? '完成')
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
          <span className={`tool-status tool-status--${message.status}`} />
          <span className="tool-title">{title}</span>
          <span className={`tool-meta${message.status === 'running' ? ' tool-meta--running' : ''}`}>
            {meta}
          </span>
          {expandable && (
            <span className="tool-chev" aria-hidden="true">
              {open ? '▾' : '▸'}
            </span>
          )}
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

/** One collapsible reasoning ("thinking") block: open while streaming,
 *  collapsed once the block ends; click toggles a finished block. */
function ReasoningBlock({ message }: { message: ChatMessage }): ReactElement {
  // Hooks run unconditionally: the item kind never changes for a stable id,
  // but the early return must not sit above hook calls.
  const [toggled, setToggled] = useState<boolean | null>(null)
  if (message.kind !== 'reasoning') return <></>
  const streaming = message.streaming === true
  const open = toggled ?? streaming
  return (
    <div className="chat-row chat-row--assistant">
      <div className={`reasoning-card${streaming ? ' reasoning-card--streaming' : ''}`}>
        <button
          type="button"
          className="tool-head"
          aria-expanded={open}
          onClick={() => {
            if (!streaming) setToggled(!open)
          }}
        >
          <span className={`tool-status tool-status--${streaming ? 'running' : 'done'}`} />
          <span className="tool-title">思考过程</span>
          <span className={`tool-meta${streaming ? ' tool-meta--running' : ''}`}>
            {streaming ? '思考中' : '已完成'}
          </span>
          {!streaming && (
            <span className="tool-chev" aria-hidden="true">
              {open ? '▾' : '▸'}
            </span>
          )}
        </button>
        {open && <pre className="tool-pre reasoning-text">{message.text}</pre>}
      </div>
    </div>
  )
}

export function ChatStream({ messages, trailTick = 0, header, children }: ChatStreamProps): ReactElement {
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

  return (
    <div className="chat-stream-wrap">
      <div ref={streamRef} className="chat-stream" onScroll={onScroll} aria-label="会话消息">
        {header}
        {messages.map((message) =>
          message.kind === 'tool' ? (
            <ToolBlock key={message.id} message={message} />
          ) : message.kind === 'reasoning' ? (
            <ReasoningBlock key={message.id} message={message} />
          ) : message.kind === 'user' ? (
            <div key={message.id} className="chat-row chat-row--user">
              <div className="chat-bubble chat-bubble--user">
                {message.content.map((part, i) => (part.type === 'text' ? <span key={i}>{part.text}</span> : null))}
              </div>
              <MsgActions text={message.content.map((p) => (p.type === 'text' ? p.text : '')).join('')} />
            </div>
          ) : (
            <div key={message.id} className="chat-row chat-row--assistant">
              {message.error !== undefined ? (
                <div className="chat-error">发送失败：{message.error}</div>
              ) : (
                <div className={`chat-assistant${message.streaming ? ' chat-assistant--streaming' : ''}`}>
                  <Markdown text={message.text} />
                </div>
              )}
              {!message.streaming && message.text !== '' && <MsgActions text={message.text} />}
            </div>
          ),
        )}
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
