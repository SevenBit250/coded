import type { ReactElement, ReactNode } from 'react'
import './IconButton.css'

/** IconButton props. */
export interface IconButtonProps {
  /** The icon node (usually a uibase `Icon`). */
  icon: ReactNode
  /** Accessible name; doubles as the tooltip. */
  label: string
  onClick?: () => void
  /** Extra class for app-side theming (color overrides, entry animation). */
  className?: string
}

/**
 * Ghost icon button for chrome/sidebar toolbars: transparent until hovered.
 * Always `no-drag` — these sit inside the window's drag region, and drag
 * regions swallow pointer events before hover/click can fire.
 */
export function IconButton({
  icon,
  label,
  onClick,
  className,
}: IconButtonProps): ReactElement {
  return (
    <button
      className={`ui-iconbtn${className !== undefined ? ` ${className}` : ''}`}
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      {icon}
    </button>
  )
}
