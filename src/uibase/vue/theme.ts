import { toCssVars } from '../ThemeProvider/tokens'
import type { ThemeTokens } from '../ThemeProvider/tokens'

export type { ThemeTokens }
export { toCssVars }

/**
 * Applies a theme by writing its tokens onto :root as CSS custom
 * properties. The application target is deliberately the document root:
 * teleported components (Tooltip, Dialog) escape the DOM subtree, and
 * :root is the only scope that reaches them. Components never read a
 * theme object; they keep consuming var(--x, fallback), so a theme swap
 * is just a data swap — call this from a watcher whenever the choice
 * changes.
 */
let appliedKeys: string[] = []

export function applyTheme(tokens: ThemeTokens, name: string, scheme?: 'light' | 'dark'): void {
  const root = document.documentElement
  for (const key of appliedKeys) root.style.removeProperty(key)
  const vars = toCssVars(tokens)
  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value)
  }
  appliedKeys = Object.keys(vars)
  root.dataset.theme = name
  root.style.colorScheme = scheme ?? name
}
