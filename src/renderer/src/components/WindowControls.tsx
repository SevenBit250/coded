import { useState } from 'react'
import type { ReactElement } from 'react'

/** Frameless-window chrome buttons (pin? / minimize / maximize / close) over
 *  the preload bridge. Shared by the startup glass overlay and the main
 *  titlebar; the pin button is only rendered when requested. */
export function WindowControls({ pin = false }: { pin?: boolean }): ReactElement {
  const [pinned, setPinned] = useState(false)

  const togglePin = async (): Promise<void> => {
    setPinned(await window.dshDesktop.togglePinned())
  }

  return (
    <div className="controls no-drag">
      {pin && (
        <button
          className={`ctl ${pinned ? 'active' : ''}`}
          title={pinned ? '取消置顶' : '置顶'}
          aria-label="置顶"
          aria-pressed={pinned}
          onClick={() => void togglePin()}
        >
          <svg viewBox="0 0 12 12">
            <path d="M3.2 1.4h5.6v2.7l-1.5 1v2.1l-1 .6v1.8h-0.6V7.8l-1-.6V5.1l-1.5-1z" />
          </svg>
        </button>
      )}
      <button
        className="ctl"
        title="最小化"
        aria-label="最小化"
        onClick={() => window.dshDesktop.minimize()}
      >
        <svg viewBox="0 0 12 12">
          <line x1="2" y1="6" x2="10" y2="6" />
        </svg>
      </button>
      <button
        className="ctl"
        title="最大化"
        aria-label="最大化"
        onClick={() => window.dshDesktop.maximize()}
      >
        <svg viewBox="0 0 12 12">
          <rect x="2.5" y="2.5" width="7" height="7" rx="1" />
        </svg>
      </button>
      <button
        className="ctl danger"
        title="关闭"
        aria-label="关闭"
        onClick={() => window.dshDesktop.close()}
      >
        <svg viewBox="0 0 12 12">
          <path d="M3 3l6 6M9 3l-6 6" />
        </svg>
      </button>
    </div>
  )
}
