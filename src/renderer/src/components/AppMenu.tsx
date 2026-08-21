import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { AboutDialog } from './AboutDialog'

/** How long the close animation keeps the menu mounted (ms). */
const CLOSE_ANIMATION_MS = 110

/**
 * Application command menu: a WinUI 3 style chevron button in the title bar
 * (left of the caption buttons) dropping a rounded white card. The only
 * entry is the About action; the dialog is modal. Opening pops the card
 * (scale + fade + slide from the top-right anchor); closing fades it out.
 */
export function AppMenu(): ReactElement {
  const [open, setOpen] = useState(false)
  const [closing, setClosing] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<number | null>(null)

  const openMenu = useCallback(() => {
    if (closeTimer.current !== null) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
    setClosing(false)
    setOpen(true)
  }, [])

  const requestClose = useCallback(() => {
    if (!open || closeTimer.current !== null) return
    setClosing(true)
    closeTimer.current = window.setTimeout(() => {
      closeTimer.current = null
      setOpen(false)
      setClosing(false)
    }, CLOSE_ANIMATION_MS)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent): void => {
      if (rootRef.current !== null && !rootRef.current.contains(event.target as Node)) {
        requestClose()
      }
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') requestClose()
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, requestClose])

  return (
    <div className="appmenu-root" ref={rootRef}>
      <button
        className={`appmenu-btn ${open ? 'active' : ''}`}
        title="应用菜单"
        aria-label="应用菜单"
        aria-expanded={open}
        onClick={() => (open ? requestClose() : openMenu())}
      >
        <svg viewBox="0 0 12 12">
          <path d="M3 4.5l3 3 3-3" />
        </svg>
      </button>
      {open && (
        <div className={`appmenu ${closing ? 'closing' : ''}`} role="menu">
          <button
            className="appmenu-item"
            role="menuitem"
            onClick={() => {
              requestClose()
              setAboutOpen(true)
            }}
          >
            <span className="appmenu-label">关于 Coded</span>
          </button>
        </div>
      )}
      <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </div>
  )
}
