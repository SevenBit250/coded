import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, ReactElement } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../Icon/Icon'
import type { TooltipPlacement } from '../Tooltip/Tooltip'
import './Dropdown.css'

/**
 * Where the panel sits relative to the trigger — the full eight-way set:
 * a side plus an edge alignment ('bottom-left' = below the trigger, left
 * edges lined up). When the preferred side would leave the viewport the
 * panel flips to the opposite side and is nudged back inside along the
 * cross axis (shared semantics with TooltipPlacement).
 */
export type DropdownPlacement = TooltipPlacement

/** One selectable workspace entry. */
export interface DropdownOption {
  /** Stable identity handed back through `onChange`. */
  id: string
  /** Display label. */
  label: string
}

/** One non-selecting command row under the option list. */
export interface DropdownAction {
  /** Stable identity handed back through `onAction`. */
  id: string
  /** Display label. */
  label: string
}

/** Dropdown props. */
export interface DropdownProps {
  /** Selectable options (searchable). */
  options?: DropdownOption[]
  /** Selected option id, or null for none (the fallback row checks then). */
  value?: string | null
  /** Fires with the new id, or null when the clear button/fallback row is used. */
  onChange?: (id: string | null) => void
  /** Trigger label while nothing is selected. */
  placeholder?: string
  /** Command rows below the option list (after a divider). */
  actions?: DropdownAction[]
  /** Fires for an action row; the menu closes either way. */
  onAction?: (id: string) => void
  /** Label of the null-selection row shown (checked) while `value` is null. */
  noneLabel?: string
  /** Whether the panel leads with a search field (default true). */
  searchable?: boolean
  /** Preferred panel placement; flips to survive the viewport edges. */
  placement?: DropdownPlacement
  /** Disabled triggers neither open nor clear. */
  disabled?: boolean
}

/** Anchor↔panel gap and the viewport margin kept on every side (px). */
const GAP = 6
const MARGIN = 8

/** How long the close animation keeps the panel mounted (ms). */
const CLOSE_ANIMATION_MS = 110

interface Point {
  x: number
  y: number
}

/** Fixed-position point for the panel, flipped and clamped to the viewport
 *  (same eight-way contract as the tooltip placer). */
function place(
  anchor: DOMRect,
  panelW: number,
  panelH: number,
  placement: DropdownPlacement,
): Point {
  const [side, align] = placement.split('-')
  const vw = window.innerWidth
  const vh = window.innerHeight

  let x =
    align === 'left'
      ? anchor.left
      : align === 'right'
        ? anchor.right - panelW
        : anchor.left + anchor.width / 2 - panelW / 2
  let y = anchor.top + anchor.height / 2 - panelH / 2

  if (side === 'top') y = anchor.top - GAP - panelH
  else if (side === 'bottom') y = anchor.bottom + GAP
  else if (side === 'left') x = anchor.left - GAP - panelW
  else x = anchor.right + GAP

  // Flip to the opposite side when the preferred one overflows.
  if (side === 'top' && y < MARGIN) y = anchor.bottom + GAP
  else if (side === 'bottom' && y + panelH > vh - MARGIN) y = anchor.top - GAP - panelH
  if (side === 'left' && x < MARGIN) x = anchor.right + GAP
  else if (side === 'right' && x + panelW > vw - MARGIN) x = anchor.left - GAP - panelW

  // Never leave the viewport along either axis.
  x = Math.min(Math.max(x, MARGIN), Math.max(MARGIN, vw - MARGIN - panelW))
  y = Math.min(Math.max(y, MARGIN), Math.max(MARGIN, vh - MARGIN - panelH))

  return { x, y }
}

/** One flat keyboard-navigable row inside the open panel. */
interface Row {
  kind: 'option' | 'action' | 'none'
  id: string
}

/**
 * Select dropdown: a pill trigger (folder + label + chevron, with a clear
 * button once a value is picked) and a portaled panel — search field over
 * filtered options, then command actions, then the checked fallback row for
 * the null selection. The panel supports the full eight-way placement with
 * viewport flipping, and keyboard navigation (arrows/Home/End/Enter/Escape).
 * Dismisses on outside pointer-down, Escape, resize, or outside scroll.
 */
export function Dropdown({
  options = [],
  value = null,
  onChange,
  placeholder = '选择项目',
  actions = [],
  onAction,
  noneLabel,
  searchable = true,
  placement = 'bottom-left',
  disabled = false,
}: DropdownProps): ReactElement {
  const [open, setOpen] = useState(false)
  const [closing, setClosing] = useState(false)
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(-1)
  const [pos, setPos] = useState<Point | null>(null)

  const anchorRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const closeTimer = useRef<number | null>(null)

  const closeTimerClear = (): void => {
    if (closeTimer.current !== null) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }

  const requestClose = useCallback((): void => {
    if (!open || closeTimer.current !== null) return
    setClosing(true)
    closeTimer.current = window.setTimeout(() => {
      closeTimer.current = null
      setOpen(false)
      setClosing(false)
    }, CLOSE_ANIMATION_MS)
  }, [open])

  const openPanel = (): void => {
    if (disabled || open) return
    closeTimerClear()
    setClosing(false)
    setQuery('')
    setHighlight(-1)
    setOpen(true)
  }

  // Flat navigation model: filtered options, then actions, then the none row.
  const filteredOptions = useMemo(
    () =>
      query.trim() === ''
        ? options
        : options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase())),
    [options, query],
  )
  const rows = useMemo<Row[]>(() => {
    const list: Row[] = filteredOptions.map((o) => ({ kind: 'option' as const, id: o.id }))
    for (const a of actions) list.push({ kind: 'action', id: a.id })
    if (noneLabel !== undefined) list.push({ kind: 'none', id: '' })
    return list
  }, [filteredOptions, actions, noneLabel])

  const activateRow = (row: Row | undefined): void => {
    if (row === undefined) return
    if (row.kind === 'option') {
      onChange?.(row.id)
      requestClose()
      triggerRef.current?.focus()
    } else if (row.kind === 'none') {
      onChange?.(null)
      requestClose()
      triggerRef.current?.focus()
    } else {
      onAction?.(row.id)
      requestClose()
      triggerRef.current?.focus()
    }
  }

  const onKeyDown = (event: ReactKeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      requestClose()
      triggerRef.current?.focus()
      return
    }
    if (event.key === 'Tab') {
      requestClose()
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const step = event.key === 'ArrowDown' ? 1 : -1
      setHighlight((h) => {
        const first = h === -1 ? (event.key === 'ArrowDown' ? 0 : rows.length - 1) : h + step
        return Math.min(Math.max(first, 0), rows.length - 1)
      })
    } else if (event.key === 'Home') {
      event.preventDefault()
      setHighlight(rows.length === 0 ? -1 : 0)
    } else if (event.key === 'End') {
      event.preventDefault()
      setHighlight(rows.length - 1)
    } else if (event.key === 'Enter' || event.key === ' ') {
      if (highlight >= 0 && highlight < rows.length) {
        event.preventDefault()
        activateRow(rows[highlight])
      }
    }
  }

  // Two-pass placement, mirroring the tooltip: the panel mounts hidden, is
  // measured, then lands at its point — all inside one layout effect so no
  // hidden frame paints. While closing, the last position holds for the
  // exit animation.
  useLayoutEffect(() => {
    if (!open) return
    const anchor = anchorRef.current
    const panel = panelRef.current
    if (anchor === null || panel === null) return
    setPos(place(anchor.getBoundingClientRect(), panel.offsetWidth, panel.offsetHeight, placement))
  }, [open, placement, options, query])

  // Open focuses the search field so typing filters immediately; query
  // changes keep the caret there.
  useEffect(() => {
    if (open && searchable) searchRef.current?.focus()
  }, [open, searchable])

  // Global dismissal routes. Outside-scroll exempts the panel itself, whose
  // option list scrolls internally.
  useEffect(() => {
    if (!open) return
    const isInside = (target: Node): boolean =>
      (anchorRef.current?.contains(target) ?? false) ||
      (panelRef.current?.contains(target) ?? false)
    const onPointerDown = (event: MouseEvent): void => {
      if (!isInside(event.target as Node)) requestClose()
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') requestClose()
    }
    const onScroll = (event: Event): void => {
      if (!isInside(event.target as Node)) requestClose()
    }
    const onResize = (): void => requestClose()
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open, requestClose])

  // A pending close timer must not fire after unmount.
  useEffect(
    () => () => {
      closeTimerClear()
    },
    [],
  )

  const selected = options.find((o) => o.id === value)
  const rowId = (index: number): string => `ui-dd-row-${index}`

  return (
    <div className="ui-dd" ref={anchorRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`ui-dd-trigger${selected !== undefined ? ' ui-dd-trigger--filled' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={open ? requestClose : openPanel}
      >
        {/* Head slot: the folder mark always anchors the pill; with a value
            picked, the clear × stacks over it and they crossfade on hover. */}
        <span className="ui-dd-slot">
          {/* lucide:folder */}
          <Icon className="ui-dd-fold">
            <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
          </Icon>
          {selected !== undefined && (
            <span
              className="ui-dd-clear"
              role="button"
              aria-label="清除选中"
              tabIndex={-1}
              onMouseDown={(e) => {
                e.stopPropagation()
                e.preventDefault()
              }}
              onClick={(e) => {
                e.stopPropagation()
                onChange?.(null)
              }}
            >
              {/* lucide:x */}
              <Icon className="ui-dd-x">
                <path d="M18 6L6 18M6 6l12 12" />
              </Icon>
            </span>
          )}
        </span>
        <span className="ui-dd-label">{selected === undefined ? placeholder : selected.label}</span>
        {/* lucide:chevron-down */}
        <Icon className="ui-dd-chev">
          <path d="m6 9l6 6 6-6" />
        </Icon>
      </button>

      {(open || closing) &&
        createPortal(
          <div
            ref={panelRef}
            role="listbox"
            className={`ui-dd-panel${closing ? ' ui-dd-panel--closing' : ''}`}
            style={pos !== null ? { left: pos.x, top: pos.y } : { visibility: 'hidden' }}
            onKeyDown={onKeyDown}
            onAnimationEnd={() => {
              if (closing) {
                closeTimerClear()
                setOpen(false)
                setClosing(false)
              }
            }}
          >
            {searchable && (
              <div className="ui-dd-search">
                {/* lucide:search */}
                <Icon className="ui-dd-search-ico">
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.3-4.3" />
                </Icon>
                <input
                  ref={searchRef}
                  type="text"
                  className="ui-dd-search-input"
                  placeholder="搜索工作区"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value)
                    setHighlight(-1)
                  }}
                  aria-label="搜索工作区"
                />
              </div>
            )}

            <div className="ui-dd-list">
              {filteredOptions.map((o) => {
                const index = rows.findIndex((r) => r.kind === 'option' && r.id === o.id)
                return (
                  <button
                    key={o.id}
                    type="button"
                    role="option"
                    aria-selected={o.id === value}
                    id={rowId(index)}
                    className={`ui-dd-item${index === highlight ? ' ui-dd-item--hot' : ''}`}
                    onMouseEnter={() => setHighlight(index)}
                    onClick={() => activateRow({ kind: 'option', id: o.id })}
                  >
                    {/* lucide:folder */}
                    <Icon className="ui-dd-ico">
                      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
                    </Icon>
                    <span className="ui-dd-label">{o.label}</span>
                    {o.id === value && (
                      // lucide:check
                      <Icon className="ui-dd-check">
                        <path d="M20 6L9 17l-5-5" />
                      </Icon>
                    )}
                  </button>
                )
              })}
              {filteredOptions.length === 0 && (
                <div className="ui-dd-empty">无匹配工作区</div>
              )}
            </div>

            {actions.length > 0 && (
              <>
                <div className="ui-dd-divider" role="separator" />
                {actions.map((a) => {
                  const index = rows.findIndex((r) => r.kind === 'action' && r.id === a.id)
                  return (
                    <button
                      key={a.id}
                      type="button"
                      role="menuitem"
                      id={rowId(index)}
                      className={`ui-dd-item${index === highlight ? ' ui-dd-item--hot' : ''}`}
                      onMouseEnter={() => setHighlight(index)}
                      onClick={() => {
                        onAction?.(a.id)
                        requestClose()
                        triggerRef.current?.focus()
                      }}
                    >
                      <span className="ui-dd-label">{a.label}</span>
                    </button>
                  )
                })}
              </>
            )}

            {noneLabel !== undefined && (
              <>
                <div className="ui-dd-divider" role="separator" />
                {(() => {
                  const index = rows.findIndex((r) => r.kind === 'none')
                  return (
                    <button
                      type="button"
                      role="option"
                      aria-selected={value === null}
                      id={rowId(index)}
                      className={`ui-dd-item${index === highlight ? ' ui-dd-item--hot' : ''}`}
                      onMouseEnter={() => setHighlight(index)}
                      onClick={() => {
                        onChange?.(null)
                        requestClose()
                        triggerRef.current?.focus()
                      }}
                    >
                      {/* lucide:message-circle (fallback conversation mark) */}
                      <Icon className="ui-dd-ico">
                        <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
                      </Icon>
                      <span className="ui-dd-label">{noneLabel}</span>
                      {value === null && (
                        // lucide:check
                        <Icon className="ui-dd-check">
                          <path d="M20 6L9 17l-5-5" />
                        </Icon>
                      )}
                    </button>
                  )
                })()}
              </>
            )}
          </div>,
          document.body,
        )}
    </div>
  )
}
