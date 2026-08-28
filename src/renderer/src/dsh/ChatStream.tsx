/**
 * ChatStream — the transcript view: user bubbles right, assistant text left,
 * tool-call blocks inline, streaming tail marked. Auto-scrolls to the newest
 * message. `children` render at the transcript tail (the answerable gates
 * live there); `trailTick` tells the scroller the tail changed without
 * diffing children.
 */
import { useEffect, useRef, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import type { ChatMessage } from './use-dsh-session'

export interface ChatStreamProps {
  messages: ChatMessage[]
  /** Bumped when the trailing children change identity (e.g. gate count). */
  trailTick?: number
  children?: ReactNode
}

/** One collapsible tool-call card (running → done). */
function ToolBlock({ message }: { message: ChatMessage }): ReactElement {
  const [open, setOpen] = useState(false)
  const title = message.toolTitle ?? message.toolName ?? '工具调用'
  const meta =
    message.toolStatus === 'running' ? '运行中' : (message.resultMeta ?? '完成')
  const expandable =
    (message.argsText !== undefined || message.resultText !== undefined)
  return (
    <div className={`chat-row chat-row--assistant`}>
      <div className={`tool-card${message.toolStatus === 'running' ? ' tool-card--running' : ''}`}>
        <button
          type="button"
          className="tool-head"
          aria-expanded={open}
          onClick={() => {
            if (expandable) setOpen(!open)
          }}
        >
          <span className={`tool-status tool-status--${message.toolStatus ?? 'done'}`} />
          <span className="tool-title">{title}</span>
          <span className={`tool-meta${message.toolStatus === 'running' ? ' tool-meta--running' : ''}`}>
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
        ) : message.role === 'user' ? (
          <div key={message.id} className="chat-row chat-row--user">
            <div className="chat-bubble chat-bubble--user">{message.text}</div>
          </div>
        ) : (
          <div key={message.id} className="chat-row chat-row--assistant">
            <div
              className={`chat-bubble chat-bubble--assistant${message.streaming ? ' chat-bubble--streaming' : ''}`}
            >
              {message.error !== undefined ? (
                <span className="chat-error">发送失败：{message.error}</span>
              ) : (
                message.text
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
