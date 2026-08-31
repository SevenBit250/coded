/**
 * uibase Vue layer — temporary barrel for the Vue 3 SFC port. During the
 * React→Vue transition the React barrel (../index.ts) stays live for the
 * running app; app-side Vue code imports from '@uibase/vue'. At cutover
 * this barrel's exports fold into index.ts and the alias flips back.
 *
 * Library rules (unchanged in spirit, restated for SFCs):
 *  - Components are presentational; platform calls (IPC) are injected via
 *    events/props, never reached for directly.
 *  - Styles ship as colocated CSS imported by the SFC; theme variables
 *    (var(--text) etc.) always have fallbacks.
 *  - Icons: official sets only (Lucide via iconify) — never hand-drawn.
 */
export { default as Icon } from '../Icon/Icon.vue'
export { default as Spinner } from '../Spinner/Spinner.vue'
export { default as WindowControls } from '../WindowControls/WindowControls.vue'
export { default as Dialog } from '../Dialog/Dialog.vue'
export { default as Tooltip } from '../Tooltip/Tooltip.vue'
export type { TooltipPlacement, TooltipProps } from '../Tooltip/Tooltip.vue'
export { default as MetaButton } from '../MetaButton/MetaButton.vue'
export type { MetaButtonProps } from '../MetaButton/MetaButton.vue'
export { default as Button } from '../Button/Button.vue'
export type { ButtonProps } from '../Button/Button.vue'
export { default as IconButton } from '../IconButton/IconButton.vue'
export type { IconButtonProps } from '../IconButton/IconButton.vue'
export { useShortcut } from './useShortcut'
export { applyTheme, toCssVars } from './theme'
export type { ThemeTokens } from './theme'
export { registerShortcut, shortcutLabel } from '../Meta/shortcuts'
