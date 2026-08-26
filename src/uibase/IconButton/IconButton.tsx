import type { ReactElement, ReactNode } from 'react'
import { MetaButton } from '../MetaButton'
import type { MetaButtonProps } from '../MetaButton'
import './IconButton.css'

/** IconButton props: MetaButton plus an icon slot. */
export interface IconButtonProps extends Omit<MetaButtonProps, 'children'> {
  /** The icon node (usually a uibase `Icon`). */
  icon: ReactNode
}

/**
 * Ghost icon button for chrome/sidebar toolbars — MetaButton with the icon
 * square chrome (.ui-iconbtn) and an icon slot. Tooltip and global shortcut
 * behavior come from MetaButton.
 */
export function IconButton({
  icon,
  className,
  ...rest
}: IconButtonProps): ReactElement {
  return (
    <MetaButton
      {...rest}
      className={className !== undefined ? `ui-iconbtn ${className}` : 'ui-iconbtn'}
    >
      {icon}
    </MetaButton>
  )
}
