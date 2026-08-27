import type { ReactElement, ReactNode } from 'react'
import { Tooltip } from '../Tooltip'
import type { TooltipPlacement } from '../Tooltip'
import { useShortcut, shortcutLabel } from '../Meta'
import './MetaButton.css'

/** MetaButton props. */
export interface MetaButtonProps {
  /** Accessible name. */
  label: string
  /** Button content (icon node, text, or a mix). */
  children?: ReactNode
  onClick?: () => void
  /** Extra class for app-side theming. */
  className?: string
  /** Tooltip text; falls back to `label` when omitted. */
  tip?: string
  /** Tooltip placement. */
  tipPlacement?: TooltipPlacement
  /**
   * In-app global shortcut, e.g. "Mod+M" ("Mod" is Ctrl on Windows/Linux,
   * Cmd on macOS). While the button is mounted the key fires `onClick`
   * app-wide — whenever the window is focused — and is shown in the
   * tooltip. Registration is exclusive: the same shortcut cannot be bound
   * twice.
   */
  shortcut?: string
}

/**
 * Base uibase button: chrome shell, built-in Tooltip, and global shortcut
 * binding. Variants (IconButton, Button, later text/chip buttons) compose it
 * and add their own classes and content.
 *
 * Internally this is a pure composition of three abilities:
 *  - shortcut binding comes from Meta's useShortcut (zero-DOM behavior base);
 *  - tooltip is a standalone sibling rendered around the native button;
 *  - the button itself is the only element MetaButton contributes.
 *
 * Keep this file a thin composer — behavior lives in Meta, presentation in
 * this file's CSS, tooltip stays a peer.
 */
export function MetaButton({
  label,
  children,
  onClick,
  className,
  tip,
  tipPlacement = 'top',
  shortcut,
}: MetaButtonProps): ReactElement {
  // Latest handler in a ref so re-renders never tear the binding down.
  useShortcut(shortcut, () => onClick?.())

  return (
    <Tooltip
      label={tip ?? label}
      placement={tipPlacement}
      shortcut={shortcut !== undefined ? shortcutLabel(shortcut) : undefined}
    >
      <button
        className={`ui-metabtn${className !== undefined ? ` ${className}` : ''}`}
        aria-label={label}
        onClick={onClick}
      >
        {children}
      </button>
    </Tooltip>
  )
}
