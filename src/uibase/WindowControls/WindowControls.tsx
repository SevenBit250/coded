import type { ReactElement } from 'react'
import { Icon } from '../Icon'
import './WindowControls.css'

/** WindowControls props: platform window ops are injected by the app. */
export interface WindowControlsProps {
  onMinimize: () => void
  onMaximize: () => void
  onClose: () => void
}

/**
 * Frameless-window chrome buttons (minimize / maximize / close).
 * Presentational only — the host wires the actual platform calls, and
 * decides whether to render these at all (on Windows the system caption
 * buttons come from titleBarOverlay instead).
 */
export function WindowControls({
  onMinimize,
  onMaximize,
  onClose,
}: WindowControlsProps): ReactElement {
  return (
    <div className="controls no-drag">
      <button className="ctl" title="最小化" aria-label="最小化" onClick={onMinimize}>
        <Icon viewBox="0 0 12 12" strokeWidth={1.3}>
          <line x1="2" y1="6" x2="10" y2="6" />
        </Icon>
      </button>
      <button className="ctl" title="最大化" aria-label="最大化" onClick={onMaximize}>
        <Icon viewBox="0 0 12 12" strokeWidth={1.3}>
          <rect x="2.5" y="2.5" width="7" height="7" rx="1" />
        </Icon>
      </button>
      <button className="ctl danger" title="关闭" aria-label="关闭" onClick={onClose}>
        <Icon viewBox="0 0 12 12" strokeWidth={1.3}>
          <path d="M3 3l6 6M9 3l-6 6" />
        </Icon>
      </button>
    </div>
  )
}
