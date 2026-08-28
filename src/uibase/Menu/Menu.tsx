import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import './Menu.css'

/** How long the close animation keeps the menu mounted (ms). */
const CLOSE_ANIMATION_MS = 110

/** Menu-scoped actions handed to items via context. */
interface MenuContextValue {
  requestClose: () => void
}

const MenuContext = createContext<MenuContextValue | null>(null)

/** Dropdown menu props. */
export interface MenuProps {
  /** Renders the trigger element; wire `toggle` to its click and reflect
   *  `open` in its aria-expanded/active styling. */
  trigger: (state: { open: boolean; toggle: () => void }) => ReactNode
  /** MenuItem / MenuDivider children. */
  children: ReactNode
  /** Class on the root wrapper (anchor scope for the absolutely-positioned
   *  card and the outside-click boundary). */
  className?: string
}

/**
 * Anchored dropdown menu: trigger render prop plus a card that pops from the
 * anchor and fades out on close. Closes on outside pointer-down, on Escape,
 * and when any MenuItem fires. The card stays mounted for the close
 * animation before unmounting.
 */
export function Menu({ trigger, children, className }: MenuProps): ReactElement {
  const [open, setOpen] = useState(false)
  const [closing, setClosing] = useState(false)
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
    <div className={className} ref={rootRef}>
      {trigger({ open, toggle: open ? requestClose : openMenu })}
      {open && (
        <MenuContext.Provider value={{ requestClose }}>
          <div className={`ui-menu${closing ? ' ui-menu--closing' : ''}`} role="menu">
            {children}
          </div>
        </MenuContext.Provider>
      )}
    </div>
  )
}

/** Non-interactive group caption inside a menu. */
export function MenuLabel({ children }: { children: ReactNode }): ReactElement {
  return (
    <div className="ui-menu-label" role="presentation">
      {children}
    </div>
  )
}

/** MenuItem props. */
export interface MenuItemProps {
  /** Fires after the menu starts closing. */
  onClick?: () => void
  children: ReactNode
  /** Right-aligned shortcut hint text. */
  shortcut?: string
  /** When set, the item renders a trailing check and checkbox semantics
   *  (option-style menus: view options, toggles). */
  selected?: boolean
}

/** One menu entry; clicking it also closes the parent menu. */
export function MenuItem({ onClick, children, shortcut, selected }: MenuItemProps): ReactElement {
  const ctx = useContext(MenuContext)
  return (
    <button
      className="ui-menu-item"
      role={selected === undefined ? 'menuitem' : 'menuitemcheckbox'}
      aria-checked={selected === undefined ? undefined : selected}
      onClick={() => {
        ctx?.requestClose()
        onClick?.()
      }}
    >
      <span>{children}</span>
      {selected === true ? (
        <svg className="ui-menu-check" viewBox="0 0 16 16" aria-hidden="true">
          <path d="m3.5 8.5 3 3 6-7" />
        </svg>
      ) : shortcut !== undefined ? (
        <span className="ui-menu-shortcut">{shortcut}</span>
      ) : null}
    </button>
  )
}

/** Horizontal rule separating menu groups. */
export function MenuDivider(): ReactElement {
  return <div className="ui-menu-divider" role="separator" />
}
