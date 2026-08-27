/**
 * Meta — the behavior base for interactive components.
 *
 * Design contract (aligned with MUI ButtonBase semantics, no DOM):
 *  - registerShortcut / shortcutLabel: the app-global shortcut registry and
 *    platform-expanded display label ("Mod+M" → Ctrl+M on Windows/Linux).
 *  - useShortcut(shortcut, handler, opts): bind a shortcut for the lifetime
 *    of the calling component (or only while `enabled` — pass false when the
 *    owner is disabled and must not respond).
 *
 * Meta renders nothing and occupies no layout space. Components that need
 * only behavior compose the hooks; components needing the full button trio
 * (click + tooltip + shortcut) inherit from MetaButton instead.
 *
 * Tooltip stays a standalone sibling of every consumer — compose it where
 * it is wanted; it is never bundled into Meta.
 */
export { registerShortcut, shortcutLabel } from './shortcuts'
export { useShortcut } from './useShortcut'
