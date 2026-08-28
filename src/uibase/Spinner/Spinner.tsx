import type { ReactElement } from 'react'
import './Spinner.css'

/** Spinner props. */
export interface SpinnerProps {
  /** Square size in px. Defaults to the inline-list size (13). */
  size?: number
  /** Extra class on the svg for app-side sizing/theming hooks. */
  className?: string
}

/**
 * Indeterminate activity spinner: a faint full ring with a rotating arc.
 * Inherits `currentColor`; drop it inline wherever a task is running.
 */
export function Spinner({ size = 13, className }: SpinnerProps): ReactElement {
  return (
    <svg
      className={className !== undefined ? `ui-spinner ${className}` : 'ui-spinner'}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth={2.6} opacity={0.18} />
      <path
        className="ui-spinner-arc"
        d="M12 3a9 9 0 0 1 9 9"
        stroke="currentColor"
        strokeWidth={2.6}
        strokeLinecap="round"
      />
    </svg>
  )
}
