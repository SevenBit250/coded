/**
 * uibase — Coded's own UI primitives. One directory per component, each
 * exporting its component and props type; this barrel re-exports all.
 *
 * Library rules:
 *  - Components are presentational; platform calls (IPC) are injected as
 *    props, never reached for directly.
 *  - Styles ship as colocated CSS imported by the component; theme
 *    variables (var(--text) etc.) always have fallbacks.
 */
export { Icon } from './Icon'
export type { IconProps } from './Icon'
export { IconButton } from './IconButton'
export type { IconButtonProps } from './IconButton'
export { Menu, MenuItem, MenuDivider } from './Menu'
export type { MenuProps, MenuItemProps } from './Menu'
export { Dialog } from './Dialog'
export type { DialogProps } from './Dialog'
export { WindowControls } from './WindowControls'
export type { WindowControlsProps } from './WindowControls'
