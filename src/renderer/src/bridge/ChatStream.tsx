/**
 * ChatStream — the transcript view over semantic transcript items (§2.3):
 * user content right, assistant markdown left, reasoning + tool-call blocks
 * inline, streaming tails marked. Auto-scrolls to the newest entry.
 * `children` render at the tail (the answerable gates live there);
 * `trailTick` tells the scroller the tail changed without diffing children.
 */
import { useEffect, useRef, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import type { ChatMessage } from './use-session'
import { Markdown } from './Markdown'

export interface ChatStreamProps {
  messages: ChatMessage[]
  /** Bumped when the trailing children change identity (e.g. gate count). */
  trailTick?: number
  children?: ReactNode
}

/** One collapsible tool-call card (running → done). */
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

/** One collapsible reasoning ("thinking") card: open while streaming,
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

export function ChatStream({ messages, trailTick = 0, children }: ChatStreamProps): ReactElement {
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, trailTick])

  return (
    <div className="chat-stream" aria-label="会话消息">
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
          </div>
        ) : (
          <div key={message.id} className="chat-row chat-row--assistant">
            <div
              className={`chat-bubble chat-bubble--assistant${message.streaming ? ' chat-bubble--streaming' : ''}`}
            >
              {message.error !== undefined ? (
                <span className="chat-error">发送失败：{message.error}</span>
              ) : (
                <Markdown text={message.text} />
              )}
            </div>
          </div>
        ),
      )}
      {children}
      <div ref={endRef} />
    </div>
  )
}
