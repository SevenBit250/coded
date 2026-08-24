import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import './Tooltip.css'

/**
 * Where the bubble sits relative to its anchor: a side (top/bottom/left/
 * right, centered on that side) or a side with an edge alignment —
 * 'top-left' means above the anchor with the bubble's left edge lined up
 * with the anchor's left edge.
 */
export type TooltipPlacement =
  | 'top'
  | 'bottom'
  | 'left'
  | 'right'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'

/** Tooltip props. */
export interface TooltipProps {
  /** Bubble text. */
  label: string
  /** Optional keyboard shortcut, shown dimmed after the label. */
  shortcut?: string
  /** Preferred placement. When the bubble would leave the viewport it flips
   *  to the opposite side, and it is always nudged back inside along the
   *  cross axis. */
  placement?: TooltipPlacement
  /** Hover intent delay before showing (ms). Keyboard focus shows at once. */
  delay?: number
  /** The trigger element: hover or focus shows the bubble. */
  children: ReactNode
  /** Extra class for app-side theming (applied to the bubble). */
  className?: string
}

/** Anchor↔bubble gap and the viewport margin kept on every side (px). */
const GAP = 8
const MARGIN = 8

interface Point {
  x: number
  y: number
}

/** Fixed-position point for the bubble, flipped and clamped to the viewport. */
function place(
  anchor: DOMRect,
  tipW: number,
  tipH: number,
  placement: TooltipPlacement,
): Point {
  const [side, align] = placement.split('-')
  const vw = window.innerWidth
  const vh = window.innerHeight

  let x =
    align === 'left'
      ? anchor.left
      : align === 'right'
        ? anchor.right - tipW
        : anchor.left + anchor.width / 2 - tipW / 2
  let y = anchor.top + anchor.height / 2 - tipH / 2

  if (side === 'top') y = anchor.top - GAP - tipH
  else if (side === 'bottom') y = anchor.bottom + GAP
  else if (side === 'left') x = anchor.left - GAP - tipW
  else x = anchor.right + GAP

  // Flip to the opposite side when the preferred one overflows.
  if (side === 'top' && y < MARGIN) y = anchor.bottom + GAP
  else if (side === 'bottom' && y + tipH > vh - MARGIN) y = anchor.top - GAP - tipH
  if (side === 'left' && x < MARGIN) x = anchor.right + GAP
  else if (side === 'right' && x + tipW > vw - MARGIN) x = anchor.left - GAP - tipW

  // Never leave the viewport along either axis.
  x = Math.min(Math.max(x, MARGIN), Math.max(MARGIN, vw - MARGIN - tipW))
  y = Math.min(Math.max(y, MARGIN), Math.max(MARGIN, vh - MARGIN - tipH))

  return { x, y }
}

/**
 * Hover/focus tooltip bubble. The trigger is wrapped in a positioning
 * anchor; the bubble itself is portaled to <body> and fixed-positioned, so
 * overflow-clipping ancestors (scroll areas, rounded panels) cannot cut it.
 * The bubble never intercepts the pointer, and it dismisses on Escape,
 * scroll, or window resize. Hiding plays a short exit animation; the bubble
 * unmounts when that animation ends.
 */
export function Tooltip({
  label,
  shortcut,
  placement = 'top',
  delay = 150,
  children,
  className,
}: TooltipProps): ReactElement {
  const anchorRef = useRef<HTMLSpanElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const timer = useRef<number | null>(null)
  // `open` is the target visibility; `mounted` keeps the bubble in the DOM
  // for the exit animation after `open` flips false.
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [pos, setPos] = useState<Point | null>(null)
  const id = useId()

  const show = (): void => {
    setMounted(true)
    setOpen(true)
  }
  const hide = (): void => setOpen(false)

  const handleEnter = (): void => {
    timer.current = window.setTimeout(show, delay)
  }
  const handleLeave = (): void => {
    if (timer.current !== null) {
      clearTimeout(timer.current)
      timer.current = null
    }
    hide()
  }

  // Two-pass placement: the bubble mounts hidden, is measured, then lands at
  // its point — all inside one layout effect, so no hidden frame paints.
  // While closing, the last position is kept so the exit animation plays
  // in place.
  useLayoutEffect(() => {
    if (!open) return
    const anchor = anchorRef.current
    const tip = tipRef.current
    if (anchor === null || tip === null) return
    const rect = anchor.getBoundingClientRect()
    setPos(place(rect, tip.offsetWidth, tip.offsetHeight, placement))
  }, [open, placement, label, shortcut])

  // Dismissal routes that don't come from the anchor itself.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') hide()
    }
    const onDismiss = (): void => hide()
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', onDismiss)
    window.addEventListener('scroll', onDismiss, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onDismiss)
      window.removeEventListener('scroll', onDismiss, true)
    }
  }, [open])

  // A pending show timer must not fire after unmount.
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current)
    },
    [],
  )

  return (
    <>
      <span
        ref={anchorRef}
        className="ui-tip"
        aria-describedby={open ? id : undefined}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        onFocus={show}
        onBlur={hide}
      >
        {children}
      </span>
      {mounted &&
        createPortal(
          <div
            ref={tipRef}
            id={id}
            role="tooltip"
            className={`ui-tip-bubble${open ? '' : ' leaving'}${className !== undefined ? ` ${className}` : ''}`}
            style={pos !== null ? { left: pos.x, top: pos.y } : { visibility: 'hidden' }}
            onAnimationEnd={() => {
              if (!open) setMounted(false)
            }}
          >
            <span>{label}</span>
            {shortcut !== undefined && (
              <span className="ui-tip-shortcut">{shortcut}</span>
            )}
          </div>,
          document.body,
        )}
    </>
  )
}
