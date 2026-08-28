/**
 * ChatStream — the minimal transcript view: user bubbles right, assistant
 * text left, streaming tail marked. Auto-scrolls to the newest message.
 * `children` render at the transcript tail (the answerable gates live there);
 * `trailTick` tells the scroller the tail changed without diffing children.
 */
import { useEffect, useRef } from 'react'
import type { ReactElement, ReactNode } from 'react'
import type { ChatMessage } from './use-dsh-session'

export interface ChatStreamProps {
  messages: ChatMessage[]
  /** Bumped when the trailing children change identity (e.g. gate count). */
  trailTick?: number
  children?: ReactNode
}

export function ChatStream({ messages, trailTick = 0, children }: ChatStreamProps): ReactElement {
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, trailTick])

  return (
    <div className="chat-stream" aria-label="会话消息">
      {messages.map((message) =>
        message.role === 'user' ? (
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
