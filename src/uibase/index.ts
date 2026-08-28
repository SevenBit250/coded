/**
 * uibase — Coded's own UI primitives. One directory per component, each
 * exporting its component and props type; this barrel re-exports all.
 *
 * Library rules:
 *  - Components are presentational; platform calls (IPC) are injected as
 *    props, never reached for directly.
 *  - Styles ship as colocated CSS imported by the component; theme
 *    variables (var(--text) etc.) always have fallbacks.
 *
 * Capability layering (keep it clean):
 *  - Meta = zero-DOM behavior base (app-global shortcuts). Compose its hooks
 *    (`useShortcut`) wherever behavior without a shell is needed; never wrap
 *    it around visual output.
 *  - MetaButton = Meta + native button + Tooltip composition — the shared
 *    base for all button forms. Button (text) and IconButton (icon) are
 *    visual specializations of MetaButton, inheriting the same trio.
 *  - Tooltip stays a standalone sibling: it renders a bubble around whatever
 *    it's given and can show a shortcut *text*, but it never owns the
 *    shortcut behavior. Do not bundle Tooltip into other components; compose
 *    it at the trigger site.
 *  - Dropdown inherits from Meta for its cycle shortcut only. Its trigger
 *    may be a pill (built-in) or a fully custom element (renderTrigger) —
 *    tooltip for a custom trigger is composed by the caller at the trigger
 *    site, exactly like everywhere else.
 */
export { registerShortcut, shortcutLabel, useShortcut } from './Meta'
export { Icon } from './Icon'
export type { IconProps } from './Icon'
export { MetaButton } from './MetaButton'
export type { MetaButtonProps } from './MetaButton'
export { Button } from './Button'
export type { ButtonProps } from './Button'
export { IconButton } from './IconButton'
export type { IconButtonProps } from './IconButton'
export { Menu, MenuItem, MenuDivider } from './Menu'
export type { MenuProps, MenuItemProps } from './Menu'
export { Dialog } from './Dialog'
export type { DialogProps } from './Dialog'
export { Dropdown } from './Dropdown'
export type {
  DropdownProps,
  DropdownOption,
  DropdownAction,
  DropdownPlacement,
} from './Dropdown'
export { Split } from './Split'
export type { SplitProps } from './Split'
export { ScrollArea } from './ScrollArea'
export type { ScrollAreaProps } from './ScrollArea'
export { Spinner } from './Spinner'
export type { SpinnerProps } from './Spinner'
export { Tooltip } from './Tooltip'
export type { TooltipPlacement, TooltipProps } from './Tooltip'
export { ThemeProvider, toCssVars } from './ThemeProvider'
export type { ThemeProviderProps, ThemeTokens } from './ThemeProvider'
export { WindowControls } from './WindowControls'
export type { WindowControlsProps } from './WindowControls'
