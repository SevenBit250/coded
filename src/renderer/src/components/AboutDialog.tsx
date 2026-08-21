import { useEffect } from 'react'
import type { ReactElement } from 'react'

/** About dialog props. */
export interface AboutDialogProps {
  open: boolean
  onClose: () => void
}

/**
 * Simple about card: app mark, name, version (from the preload bridge),
 * and a one-line descriptor. Closes on overlay click or Escape.
 */
export function AboutDialog({ open, onClose }: AboutDialogProps): ReactElement {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return <></>

  return (
    <div className="about-overlay" role="presentation" onMouseDown={onClose}>
      <div
        className="about-card"
        role="dialog"
        aria-modal="true"
        aria-label="关于 Coded"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="about-logo" aria-hidden="true">
          C
        </div>
        <h3 className="about-name">Coded</h3>
        <p className="about-version">版本 {window.dshDesktop.version}</p>
        <p className="about-desc">基于 DeepSeek Harness 的桌面客户端</p>
        <button className="about-close" onClick={onClose}>
          关闭
        </button>
      </div>
    </div>
  )
}
