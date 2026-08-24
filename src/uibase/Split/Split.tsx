import { useRef, useState } from 'react'
import type {
  CSSProperties,
  KeyboardEvent,
  PointerEvent,
  ReactElement,
} from 'react'
import './Split.css'

/** Split props. */
export interface SplitProps {
  /** Current size (px) of the pane this sash resizes. */
  value: number
  /** Called with the clamped size as the sash is dragged or keyed. */
  onChange: (size: number) => void
  /** Smallest allowed size (px). */
  min?: number
  /** Largest allowed size (px). */
  max?: number
  /** Arrow-key step (px). */
  step?: number
  /** Split axis: 'horizontal' splits into left/right panes (a vertical strip
   *  with a col-resize cursor); 'vertical' splits into top/bottom panes. */
  orientation?: 'horizontal' | 'vertical'
  /** Which pane `value` measures, relative to the sash: 'start' (left/top)
   *  grows when dragging right/down; 'end' (right/bottom) grows the other way. */
  pane?: 'start' | 'end'
  /** Called when a pointer drag starts/ends, so the parent can suspend
   *  layout animations and hold the resize cursor while it lasts. */
  onDragStart?: () => void
  onDragEnd?: () => void
  /** Accessible name for the separator. */
  label?: string
  /** Extra class for app-side positioning/theming. */
  className?: string
  /** Inline positioning — the sash ships unpositioned; the parent owns layout. */
  style?: CSSProperties
}

/**
 * Draggable sash between the two panes of a split layout. Presentational
 * and layout-agnostic: the parent owns the pane geometry, positions this
 * strip at the pane edge, and holds the size state — Split only turns
 * pointer drags and arrow keys into clamped size updates. Pointer capture
 * keeps the drag tracking when the pointer leaves the strip.
 */
export function Split({
  value,
  onChange,
  min = 0,
  max = Number.POSITIVE_INFINITY,
  step = 10,
  orientation = 'horizontal',
  pane = 'start',
  onDragStart,
  onDragEnd,
  label = '调整面板大小',
  className,
  style,
}: SplitProps): ReactElement {
  const drag = useRef<{
    pointerId: number
    startPos: number
    startSize: number
  } | null>(null)
  const [dragging, setDragging] = useState(false)

  const clamp = (size: number): number =>
    Math.min(max, Math.max(min, Math.round(size)))
  const sign = pane === 'start' ? 1 : -1

  const posOf = (e: PointerEvent<HTMLDivElement>): number =>
    orientation === 'horizontal' ? e.clientX : e.clientY

  const handleDown = (e: PointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return
    e.preventDefault()
    // No focus() here: mouse users must never see the keyboard-only
    // :focus-visible hairline; the sash stays reachable via Tab instead.
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { pointerId: e.pointerId, startPos: posOf(e), startSize: value }
    setDragging(true)
    onDragStart?.()
  }

  const handleMove = (e: PointerEvent<HTMLDivElement>): void => {
    const d = drag.current
    if (d === null || e.pointerId !== d.pointerId) return
    onChange(clamp(d.startSize + sign * (posOf(e) - d.startPos)))
  }

  const handleUp = (e: PointerEvent<HTMLDivElement>): void => {
    if (drag.current === null || e.pointerId !== drag.current.pointerId) return
    drag.current = null
    setDragging(false)
    onDragEnd?.()
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    const grow = orientation === 'horizontal' ? 'ArrowRight' : 'ArrowDown'
    const shrink = orientation === 'horizontal' ? 'ArrowLeft' : 'ArrowUp'
    if (e.key !== grow && e.key !== shrink) return
    e.preventDefault()
    onChange(clamp(value + sign * (e.key === grow ? step : -step)))
  }

  return (
    <div
      className={`ui-split${dragging ? ' dragging' : ''}${className !== undefined ? ` ${className}` : ''}`}
      style={style}
      role="separator"
      tabIndex={0}
      aria-label={label}
      aria-orientation={orientation === 'horizontal' ? 'vertical' : 'horizontal'}
      aria-valuenow={Math.round(value)}
      aria-valuemin={Math.round(min)}
      aria-valuemax={Number.isFinite(max) ? Math.round(max) : undefined}
      data-orientation={orientation}
      onPointerDown={handleDown}
      onPointerMove={handleMove}
      onPointerUp={handleUp}
      onPointerCancel={handleUp}
      onLostPointerCapture={handleUp}
      onKeyDown={handleKeyDown}
    />
  )
}
