import type { ReactElement, ReactNode } from 'react'

/** Icon props. */
export interface IconProps {
  /** SVG children (paths/shapes). */
  children: ReactNode
  /** SVG viewBox. Defaults to the lucide 24 grid; the hand-drawn 16 set
   *  passes `'0 0 16 16'`. */
  viewBox?: string
  /** Stroke width in viewBox units (lucide uses 2, the 16 set ~1.3). */
  strokeWidth?: number
  /** Extra class on the svg for app-side sizing/theming hooks. */
  className?: string
}

/**
 * Line-icon wrapper: `currentColor` stroke, no fill, round caps and joins.
 * Icons inherit the surrounding text color; sizing is the caller's CSS.
 */
export function Icon({
  children,
  viewBox = '0 0 24 24',
  strokeWidth = 2,
  className,
}: IconProps): ReactElement {
  return (
    <svg className={className} viewBox={viewBox} aria-hidden="true">
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      >
        {children}
      </g>
    </svg>
  )
}
