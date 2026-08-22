import { useEffect } from 'react'
import type { ReactElement, ReactNode } from 'react'
import './Dialog.css'

/** Dialog props. */
export interface DialogProps {
  /** Whether the dialog is mounted. */
  open: boolean
  /** Called on overlay click or Escape. */
  onClose: () => void
  /** Accessible dialog name (aria-label). */
  label: string
  children: ReactNode
}

/**
 * Modal dialog: dimmed overlay plus a centered card. Closes on overlay
 * pointer-down and Escape; clicks inside the card do not close it.
 */
export function Dialog({ open, onClose, label, children }: DialogProps): ReactElement {
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
    <div className="ui-dialog-overlay" role="presentation" onMouseDown={onClose}>
      <div
        className="ui-dialog-card"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}
