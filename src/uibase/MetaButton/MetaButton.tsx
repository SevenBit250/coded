import { useEffect, useRef } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { Tooltip } from '../Tooltip'
import type { TooltipPlacement } from '../Tooltip'
import { registerShortcut, shortcutLabel } from './shortcuts'
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
 * binding. Variants (IconButton, later text/chip buttons) compose it and
 * add their own classes and content.
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
  const onClickRef = useRef(onClick)
  onClickRef.current = onClick

  useEffect(() => {
    if (shortcut === undefined) return
    return registerShortcut(shortcut, () => onClickRef.current?.())
  }, [shortcut])

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
