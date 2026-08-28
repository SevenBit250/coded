import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import './Menu.css'

/** How long the close animation keeps the menu mounted (ms). */
const CLOSE_ANIMATION_MS = 110

/** Menu-scoped actions handed to items via context. */
interface MenuContextValue {
  requestClose: () => void
}

const MenuContext = createContext<MenuContextValue | null>(null)

/** Menu props. */
export interface MenuProps {
  /** Renders the trigger element; wire `toggle` to its click and reflect
   *  `open` in its aria-expanded/active styling. */
  trigger: (state: { open: boolean; toggle: () => void }) => ReactNode
  /** MenuItem / MenuDivider children. */
  children: ReactNode
  /** Class on the root wrapper (anchor scope for the absolutely-positioned
   *  card and the outside-click boundary). */
  className?: string
  /** Render the card through a body portal, fixed below the trigger's right
   *  edge. Required when the anchor lives inside an overflow-clipped
   *  container (scroll areas), which would otherwise cut the card off. */
  portal?: boolean
  /** Extra class on the card itself (works in both inline and portal mode,
   *  where the wrapper's descendant selectors cannot reach the card). */
  cardClassName?: string
  /** Notified whenever the card opens or closes, for host-side state
   *  (e.g. keeping a row highlighted while its menu is open). */
  onOpenChange?: (open: boolean) => void
}

/**
 * Anchored dropdown menu: trigger render prop plus a card that pops from the
 * anchor and fades out on close. Closes on outside pointer-down, on Escape,
 * and when any MenuItem fires. The card stays mounted for the close
 * animation before unmounting.
 */
export function Menu({
  trigger,
  children,
  className,
  portal = false,
  cardClassName,
  onOpenChange,
}: MenuProps): ReactElement {
  const [open, setOpen] = useState(false)
  const [closing, setClosing] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<number | null>(null)
  // Latest callback in a ref so a changing identity never re-fires the effect.
  const onOpenChangeRef = useRef(onOpenChange)
  onOpenChangeRef.current = onOpenChange
  useEffect(() => {
    onOpenChangeRef.current?.(open)
  }, [open])
  // Portal mode: the trigger's bottom-right corner in viewport coordinates,
  // measured once per open; the card hangs off it (see Menu.css).
  const [anchorCorner, setAnchorCorner] = useState<{ top: number; left: number } | null>(null)

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

  // Two-pass placement in portal mode: mount hidden, measure the trigger,
  // then land — no hidden frame paints. The card's frame sits 4px below the
  // trigger, right-aligned via CSS translateX.
  useLayoutEffect(() => {
    if (!open || !portal) {
      setAnchorCorner(null)
      return
    }
    const rect = rootRef.current?.getBoundingClientRect()
    if (rect !== undefined) setAnchorCorner({ top: rect.bottom + 4, left: rect.right })
  }, [open, portal])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent): void => {
      const target = event.target as Node
      if (rootRef.current !== null && rootRef.current.contains(target)) return
      if (portal && cardRef.current !== null && cardRef.current.contains(target)) return
      requestClose()
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
  }, [open, portal, requestClose])

  // Portal-mode cards hang at a fixed viewport point, so any scroll or
  // resize would leave them stranded away from their anchor — close instead.
  useEffect(() => {
    if (!open || !portal) return
    const onViewportChange = (): void => requestClose()
    window.addEventListener('resize', onViewportChange)
    window.addEventListener('scroll', onViewportChange, true)
    return () => {
      window.removeEventListener('resize', onViewportChange)
      window.removeEventListener('scroll', onViewportChange, true)
    }
  }, [open, portal, requestClose])

  const cardClass = `ui-menu${cardClassName !== undefined ? ` ${cardClassName}` : ''}`
  const card = (closingClass: string): ReactElement => (
    <div
      ref={portal ? cardRef : undefined}
      className={`${cardClass}${closingClass}`}
      role="menu"
      style={portal && anchorCorner === null ? { visibility: 'hidden' } : undefined}
    >
      {children}
    </div>
  )

  return (
    <div className={className} ref={rootRef}>
      {trigger({ open, toggle: open ? requestClose : openMenu })}
      {open && (
        <MenuContext.Provider value={{ requestClose }}>
          {portal ? (
            createPortal(
              <div
                className="ui-menu-portal"
                style={
                  anchorCorner !== null
                    ? { top: anchorCorner.top, left: anchorCorner.left }
                    : undefined
                }
              >
                {card(closing ? ' ui-menu--closing' : '')}
              </div>,
              document.body,
            )
          ) : (
            card(closing ? ' ui-menu--closing' : '')
          )}
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
  /** Destructive entry: renders in the danger color. */
  danger?: boolean
}

/** One menu entry; clicking it also closes the parent menu. */
export function MenuItem({
  onClick,
  children,
  shortcut,
  selected,
  danger = false,
}: MenuItemProps): ReactElement {
  const ctx = useContext(MenuContext)
  return (
    <button
      className={`ui-menu-item${danger ? ' ui-menu-item--danger' : ''}`}
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
