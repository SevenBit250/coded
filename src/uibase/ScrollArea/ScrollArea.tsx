import { useEffect, useRef, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import './ScrollArea.css'

/**
 * ScrollArea props. A custom overlay scrollbar that stays out of the layout
 * (content is never inset) and hides at rest.
 */
export interface ScrollAreaProps {
  /** Scrollable content. */
  children: ReactNode
  /** Extra class on the root wrapper (app-side sizing/layout). */
  className?: string
  /** Thumb thickness while visible (px). */
  size?: number
  /** Hover variant thickness (px). */
  hoverSize?: number
  /** Minimum thumb height (px). */
  minThumb?: number
  /** Fade-out delay after scrolling stops (ms). */
  idleDelay?: number
  /** Axis to show; vertical is the common case. */
  axis?: 'y' | 'x'
  /** aria-label for the scrollable region. */
  label?: string
  /** Push the thumb this many pixels PAST the container's right edge so it
   *  can hug an outer seam (e.g. the split sash beside a sidebar pane). */
  outside?: number
}

/**
 * Custom overlay scrollbar: zero layout impact (thumb paints over the
 * padding edge, never inside the content), fully transparent at rest, and
 * fades in while scrolling or while the pointer hovers the track. The
 * component owns no theme opinion beyond the thumb hairline — colors come
 * from theme vars so every theme keeps its own weight.
 */
export function ScrollArea({
  children,
  className,
  size = 5,
  hoverSize = 8,
  minThumb = 28,
  idleDelay = 900,
  axis = 'y',
  label,
  outside = 0,
}: ScrollAreaProps): ReactElement {
  const rootRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const [thumbH, setThumbH] = useState(0)
  const [thumbTop, setThumbTop] = useState(0)
  const [visible, setVisible] = useState(false)
  const idleTimer = useRef<number | null>(null)

  const recalc = (): void => {
    const viewport = viewportRef.current
    if (viewport === null) return
    const { scrollHeight, clientHeight, scrollTop } = viewport
    if (scrollHeight <= clientHeight) {
      setThumbH(0)
      setVisible(false)
      return
    }
    const ratio = clientHeight / scrollHeight
    const h = Math.max(minThumb, Math.round(clientHeight * ratio))
    const maxTop = clientHeight - h
    const top = Math.round((scrollTop / (scrollHeight - clientHeight)) * maxTop)
    setThumbH(h)
    setThumbTop(top)
    setVisible(true)
    bump()
  }

  const bump = (): void => {
    if (idleTimer.current !== null) clearTimeout(idleTimer.current)
    idleTimer.current = window.setTimeout(() => setVisible(false), idleDelay)
  }

  useEffect(() => {
    const viewport = viewportRef.current
    if (viewport === null) return
    const ro = new ResizeObserver(recalc)
    ro.observe(viewport)
    recalc()
    return () => {
      ro.disconnect()
      if (idleTimer.current !== null) clearTimeout(idleTimer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      ref={rootRef}
      className={`ui-scroll-area${className !== undefined ? ` ${className}` : ''}`}
      style={{ ['--ui-scroll-size' as string]: `${size}px`, ['--ui-scroll-hover' as string]: `${hoverSize}px` }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      <div
        ref={viewportRef}
        className="ui-scroll-viewport"
        role="region"
        aria-label={label}
        onScroll={recalc}
      >
        {children}
      </div>
      {axis === 'y' && thumbH > 0 && (
        <div
          className={`ui-scroll-thumb${visible ? ' ui-scroll-thumb--on' : ''}${outside > 0 ? ' ui-scroll-thumb--outside' : ''}`}
          style={{ height: thumbH, top: thumbTop, ['--ui-scroll-outside' as string]: `${outside}px` }}
          aria-hidden="true"
        />
      )}
    </div>
  )
}
