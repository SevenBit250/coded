import type { ReactElement } from 'react'
import { Dialog } from '@uibase'

/** About dialog props. */
export interface AboutDialogProps {
  open: boolean
  onClose: () => void
}

/**
 * Simple about card on the uibase Dialog: app mark, name, version (from the
 * preload bridge), and a one-line descriptor.
 */
export function AboutDialog({ open, onClose }: AboutDialogProps): ReactElement {
  return (
    <Dialog open={open} onClose={onClose} label="关于 Coded">
      <div className="about-logo" aria-hidden="true">
        C
      </div>
      <h3 className="about-name">Coded</h3>
      <p className="about-version">版本 {window.dshDesktop.version}</p>
      <p className="about-desc">基于 DeepSeek Harness 的桌面客户端</p>
      <button className="about-close" onClick={onClose}>
        关闭
      </button>
    </Dialog>
  )
}
