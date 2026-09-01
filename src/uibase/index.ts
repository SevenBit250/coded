/**
 * uibase — Coded's own UI primitives (Vue 3 SFC). One directory per
 * component: `Foo.vue` + colocated `Foo.css`; this barrel re-exports all.
 *
 * Library rules:
 *  - Components are presentational; platform calls (IPC) are injected via
 *    props/events, never reached for directly.
 *  - Styles ship as colocated CSS imported by the SFC; theme variables
 *    (var(--text) etc.) always have fallbacks.
 *  - Icons: official sets only (Lucide via iconify) — never hand-drawn
 *    (iron rule, see workspace AGENTS.md).
 *
 * Capability layering (unchanged in spirit from the React library):
 *  - Meta = zero-DOM behavior base (app-global shortcuts). Compose the
 *    `useShortcut` composable wherever behavior without a shell is needed.
 *  - MetaButton = Meta + native button + Tooltip composition — the shared
 *    base for all button forms. Button (text) and IconButton (icon) are
 *    visual specializations.
 *  - Tooltip stays a standalone sibling wrapping the default slot; do not
 *    bundle it into other components — compose at the trigger site.
 *  - Dropdown's custom trigger is a scoped slot (`#trigger`); Menu's
 *    trigger likewise (`renderTrigger` → slot). Item closing flows via
 *    provide/inject ('ui-menu-close').
 *  - ThemeProvider is not a component: `applyTheme(overrides | null, name,
 *    scheme)` writes a theme's OVERRIDES onto :root (null = clear back to
 *    the stylesheet's light theme); call it from a watcher (App.vue).
 */
export { registerShortcut, shortcutLabel } from './Meta/shortcuts'
export { useShortcut } from './Meta/useShortcut'
export { applyTheme, toCssVars } from './ThemeProvider/applyTheme'
export type { ThemeTokens } from './ThemeProvider/applyTheme'
export { default as Icon } from './Icon/Icon.vue'
export { default as Spinner } from './Spinner/Spinner.vue'
export { default as WindowControls } from './WindowControls/WindowControls.vue'
export { default as Dialog } from './Dialog/Dialog.vue'
export { default as Tooltip } from './Tooltip/Tooltip.vue'
export type { TooltipPlacement, TooltipProps } from './Tooltip/Tooltip.vue'
export { default as MetaButton } from './MetaButton/MetaButton.vue'
export type { MetaButtonProps } from './MetaButton/MetaButton.vue'
export { default as Button } from './Button/Button.vue'
export type { ButtonProps } from './Button/Button.vue'
export { default as IconButton } from './IconButton/IconButton.vue'
export type { IconButtonProps } from './IconButton/IconButton.vue'
export { default as Menu } from './Menu/Menu.vue'
export { default as MenuItem } from './Menu/MenuItem.vue'
export { default as MenuDivider } from './Menu/MenuDivider.vue'
export { default as MenuLabel } from './Menu/MenuLabel.vue'
export { default as Dropdown } from './Dropdown/Dropdown.vue'
export type {
  DropdownProps,
  DropdownOption,
  DropdownAction,
  DropdownPlacement,
} from './Dropdown/Dropdown.vue'
export { default as Split } from './Split/Split.vue'
export type { SplitProps } from './Split/Split.vue'
export { default as ScrollArea } from './ScrollArea/ScrollArea.vue'
export type { ScrollAreaProps } from './ScrollArea/ScrollArea.vue'
