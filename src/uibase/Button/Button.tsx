import type { ReactElement, ReactNode } from 'react'
import { MetaButton } from '../MetaButton'
import type { MetaButtonProps } from '../MetaButton'
import './Button.css'

/** Button props: MetaButton plus text-button sizing and variant. */
export interface ButtonProps extends Omit<MetaButtonProps, 'children'> {
  /** Button content (text and/or nodes). */
  children: ReactNode
  /** Visual weight: 'primary' (accent fill), 'secondary' (outline), 'ghost'. */
  variant?: 'primary' | 'secondary' | 'ghost'
  /** Height bucket; 'md' matches the composer toolbar pills. */
  size?: 'sm' | 'md' | 'lg'
  /** Stretch to the container width. */
  block?: boolean
}

/**
 * Text button — the text-bearing sibling of IconButton. Behavior (click +
 * tooltip + global shortcut) comes from MetaButton; this layer owns only
 * sizing, variant chrome, and the text label layout.
 */
export function Button({
  children,
  variant = 'secondary',
  size = 'md',
  block = false,
  className,
  ...rest
}: ButtonProps): ReactElement {
  const cls = [
    'ui-btn',
    `ui-btn--${variant}`,
    `ui-btn--${size}`,
    block ? 'ui-btn--block' : '',
    className ?? '',
  ]
    .filter((c) => c !== '')
    .join(' ')

  return (
    <MetaButton {...rest} className={cls}>
      {children}
    </MetaButton>
  )
}
