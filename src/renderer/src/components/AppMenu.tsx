import { useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { AboutDialog } from './AboutDialog'

/**
 * Application command menu: a WinUI 3 style chevron button in the title bar
 * (left of the caption buttons) dropping a rounded white card. The only
 * entry is the About action; the dialog is modal.
 */
export function AppMenu(): ReactElement {
  const [open, setOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent): void => {
      if (rootRef.current !== null && !rootRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className="appmenu-root" ref={rootRef}>
      <button
        className={`appmenu-btn ${open ? 'active' : ''}`}
        title="应用菜单"
        aria-label="应用菜单"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <svg viewBox="0 0 12 12">
          <path d="M3 4.5l3 3 3-3" />
        </svg>
      </button>
      {open && (
        <div className="appmenu" role="menu">
          <button
            className="appmenu-item"
            role="menuitem"
            onClick={() => {
              setOpen(false)
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
