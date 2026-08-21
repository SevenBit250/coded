import type { ReactElement } from 'react'

/**
 * Frameless-window chrome buttons (minimize / maximize / close).
 *
 * On Windows the system caption buttons are drawn by Windows itself via
 * titleBarOverlay (WinUI 3 style title bar), so nothing is rendered here.
 * Other platforms get the custom buttons.
 */
export function WindowControls(): ReactElement {
  if (window.dshDesktop.platform === 'win32') return <></>

  return (
    <div className="controls no-drag">
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
