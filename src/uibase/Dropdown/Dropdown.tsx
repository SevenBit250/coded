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
import { useShortcut, shortcutLabel } from '../Meta'
import './Dropdown.css'

/**
 * Where the panel sits relative to the trigger — the full twelve-way grid:
 * each side (top / bottom / left / right) offers the middle position plus
 * both edge alignments along that side. Alignment is named for the side it
 * hugs: 'bottom-left' = below the trigger, left edges lined up; 'left-top'
 * = beside the trigger on its left, top edges lined up.
 *
 * When the preferred rect would leave the viewport the panel flips to the
 * opposite side (alignment preserved) and is nudged back inside along the
 * cross axis.
 */
export type DropdownPlacement =
  | 'top'
  | 'top-left'
  | 'top-right'
  | 'bottom'
  | 'bottom-left'
  | 'bottom-right'
  | 'left'
  | 'left-top'
  | 'left-bottom'
  | 'right'
  | 'right-top'
  | 'right-bottom'

/** One selectable workspace entry. */
export interface DropdownOption {
  /** Stable identity handed back through `onChange`. */
  id: string
  /** Display label. */
  label: string
  /** Leading glyph drawn left of the label in panel rows, and in the
   *  trigger's head slot when this option is selected (`headSlot='selected'`). */
  icon?: ReactElement
  /** Second dim line under the label in panel rows. */
  description?: string
}

/** One non-selecting command row under the option list. */
export interface DropdownAction {
  /** Stable identity handed back through `onAction`. */
  id: string
  /** Display label. */
  label: string
  /** Leading glyph, sized by the same wrapper as option icons. */
  icon?: ReactElement
}

/** Dropdown props. */
export interface DropdownProps {
  /** Selectable options (searchable). */
  options?: readonly DropdownOption[]
  /** Selected option id, or null for none (the fallback row checks then). */
  value?: string | null
  /** Fires with the new id, or null when the clear button/fallback row is used. */
  onChange?: (id: string | null) => void
  /** Trigger label while nothing is selected. */
  placeholder?: string
  /** Command rows below the option list (after a divider). */
  actions?: readonly DropdownAction[]
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
  /** What anchors the pill's 14px head slot (default 'project'):
   *  - 'project' — built-in folder mark; with a value it crossfades to the
   *    clear × on hover (workspace-selector behavior).
   *  - 'selected' — renders the chosen option's own icon and no clear
   *    affordance (mode-selector behavior: one mode is always active). */
  headSlot?: 'project' | 'selected'
  /** Full replacement for the built-in pill trigger, for triggers that are
   *  not pills at all (a bare icon button etc.). Receives the open flag, the
   *  toggle to wire up, the currently selected option, and the platform
   *  shortcut display label (e.g. 'Mod+Shift+M' reads as Ctrl+Shift+M on
   *  Windows) for tooltips; everything else — placement, dismissal,
   *  keyboard, panel — keeps working unchanged. */
  renderTrigger?: (state: {
    open: boolean
    toggle: () => void
    selected: DropdownOption | undefined
    /** Pre-expanded shortcut hint for the trigger's tooltip. */
    shortcut?: string
  }) => ReactElement
  /** Extra class on the root wrapper so app-side CSS can retheme a
   *  particular instance (e.g. accent-colored access chip). */
  className?: string
  /** Hug the longest row instead of honoring the fixed min-width — for
   *  short-label menus (context actions) where the default width reads
   *  oversized. */
  fitContent?: boolean
  /**
   * App-global shortcut that CYCLES the selection (forward through
   * `options`, wrapping at the end; backward with Shift) without touching
   * the panel. E.g. "Mod+Shift+M": Ctrl on Windows/Linux, Cmd on macOS.
   * Registration is exclusive — the same shortcut bound elsewhere throws.
   */
  cycleShortcut?: string
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

/** Which side of the anchor the panel ended up on — drives which way the
 *  entrance animation grows (a top-side panel must emerge bottom-up). */
type PanelSide = 'top' | 'bottom' | 'left' | 'right'

interface Placement extends Point {
  side: PanelSide
  /** CSS transform-origin matching the resolved side + alignment, so the
   *  pop animation always grows from the anchor's direction. */
  origin: string
}

/** Fixed-position point for the panel, flipped and clamped to the viewport
 *  across the full twelve-way placement grid. Returns the resolved side and
 *  a matching transform-origin for the directional entrance animation. */
function place(
  anchor: DOMRect,
  panelW: number,
  panelH: number,
  placement: DropdownPlacement,
): Placement {
  const [prefSide, align = undefined] = placement.split('-') as
    [PanelSide, ('left' | 'right' | 'top' | 'bottom') | undefined]
  const vw = window.innerWidth
  const vh = window.innerHeight

  let side: PanelSide = prefSide

  const clampX = (x: number): number =>
    Math.min(Math.max(x, MARGIN), Math.max(MARGIN, vw - MARGIN - panelW))
  const clampY = (y: number): number =>
    Math.min(Math.max(y, MARGIN), Math.max(MARGIN, vh - MARGIN - panelH))

  // --- horizontal sides (left / right of the anchor) ---
  if (side === 'left' || side === 'right') {
    let x = side === 'left' ? anchor.left - GAP - panelW : anchor.right + GAP
    if (x < MARGIN && side === 'left') {
      side = 'right'
      x = anchor.right + GAP
    } else if (x + panelW > vw - MARGIN && side === 'right') {
      side = 'left'
      x = anchor.left - GAP - panelW
    }
    x = clampX(x)

    let y =
      align === 'top'
        ? anchor.top
        : align === 'bottom'
          ? anchor.bottom - panelH
          : anchor.top + anchor.height / 2 - panelH / 2
    y = clampY(y)

    return {
      x,
      y,
      side,
      origin: `${side === 'left' ? 'right' : 'left'} ${align ?? 'center'}`,
    }
  }

  // --- vertical sides (above / below the anchor) ---
  let y = side === 'top' ? anchor.top - GAP - panelH : anchor.bottom + GAP
  if (y < MARGIN && side === 'top') {
    side = 'bottom'
    y = anchor.bottom + GAP
  } else if (y + panelH > vh - MARGIN && side === 'bottom') {
    side = 'top'
    y = Math.max(MARGIN, anchor.top - GAP - panelH)
  }

  const x = clampX(
    align === 'left'
      ? anchor.left
      : align === 'right'
        ? anchor.right - panelW
        : anchor.left + anchor.width / 2 - panelW / 2,
  )
  const yClamped = clampY(y)

  return {
    x,
    y: yClamped,
    side,
    origin: `${align ?? 'center'} ${side === 'top' ? 'bottom' : 'top'}`,
  }
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
  headSlot = 'project',
  renderTrigger,
  className,
  fitContent = false,
  cycleShortcut,
}: DropdownProps): ReactElement {
  const [open, setOpen] = useState(false)
  const [closing, setClosing] = useState(false)
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(-1)
  const [pos, setPos] = useState<Placement | null>(null)

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
  // hidden frame paints. While closing, the last position is kept so the
  // exit animation plays in place. CRITICAL: callers commonly pass inline
  // option/action literals, so this effect must not depend on their identity
  // alone — the state write bails when the computed point is unchanged,
  // otherwise an unstable-prop parent render loops into "maximum update
  // depth exceeded" and unmounts the whole tree.
  useLayoutEffect(() => {
    if (!open) return
    const anchor = anchorRef.current
    const panel = panelRef.current
    if (anchor === null || panel === null) return
    const rect = anchor.getBoundingClientRect()
    const next = place(rect, panel.offsetWidth, panel.offsetHeight, placement)
    setPos((prev) =>
      prev !== null && prev.x === next.x && prev.y === next.y && prev.side === next.side
        ? prev
        : next,
    )
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

  // App-global cycle shortcut via Meta: steps the selection WITHOUT touching
  // the panel — the user stays at the current focus, the value moves.
  useShortcut(
    cycleShortcut,
    () => {
      if (options.length === 0) return
      const current = options.findIndex((o) => o.id === value)
      // Nothing selected (or a stale value): anchor at the start so forward
      // lands on the first option, backward on the last.
      const base = current === -1 ? -1 : current
      const next = options[(base + 1 + options.length) % options.length]
      if (next === undefined) return
      onChange?.(next.id)
    },
    { enabled: !disabled },
  )

  const selected = options.find((o) => o.id === value)
  const rowId = (index: number): string => `ui-dd-row-${index}`
  // Resolved anchor side drives which way the entrance animation grows.
  const side: PanelSide = pos?.side ?? 'bottom'

  return (
    <div
      className={`ui-dd${className !== undefined ? ` ${className}` : ''}`}
      ref={anchorRef}
    >
      {renderTrigger !== undefined ? (
        renderTrigger({
          open,
          toggle: open ? requestClose : openPanel,
          selected,
          shortcut: cycleShortcut !== undefined ? shortcutLabel(cycleShortcut) : undefined,
        })
      ) : (
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
          {headSlot === 'selected' ? (
            selected?.icon !== undefined ? (
              <span className="ui-dd-optico">{selected.icon}</span>
            ) : null
          ) : (
            <>
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
            </>
          )}
        </span>
        <span className="ui-dd-label">{selected === undefined ? placeholder : selected.label}</span>
        {/* lucide:chevron-down */}
        <Icon className="ui-dd-chev">
          <path d="m6 9l6 6 6-6" />
        </Icon>
        </button>
      )}

      {(open || closing) &&
        createPortal(
          <div
            ref={panelRef}
            role="listbox"
            className={[
              'ui-dd-panel',
              `ui-dd-side-${side}`,
              closing ? 'ui-dd-panel--closing' : '',
              fitContent ? 'ui-dd-panel--fit' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            style={
              pos !== null
                ? { left: pos.x, top: pos.y, transformOrigin: pos.origin }
                : { visibility: 'hidden' as const }
            }
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

            {/* Option list exists only when there are options: action-only
                menus (no options) skip it entirely, empty state included. */}
            {options.length > 0 && (
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
                      {o.icon !== undefined ? (
                        <span className="ui-dd-optico">{o.icon}</span>
                      ) : (
                        /* lucide:folder (default keeps plain lists recognizable) */
                        <Icon className="ui-dd-ico">
                          <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
                        </Icon>
                      )}
                      <span className="ui-dd-text">
                        <span className="ui-dd-label">{o.label}</span>
                        {o.description !== undefined && (
                          <span className="ui-dd-desc">{o.description}</span>
                        )}
                      </span>
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
            )}

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
                      {a.icon !== undefined && (
                        <span className="ui-dd-optico">{a.icon}</span>
                      )}
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
