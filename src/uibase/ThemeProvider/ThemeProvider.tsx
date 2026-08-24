import { useLayoutEffect } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { toCssVars } from './tokens'
import type { ThemeTokens } from './tokens'

/** ThemeProvider props. */
export interface ThemeProviderProps {
  /** The token set to apply. */
  tokens: ThemeTokens
  /** Theme name, mirrored to `data-theme` on <html> so attribute selectors
   *  can swap what variables cannot express (raster assets, filters). */
  name: string
  /** Value for the CSS `color-scheme` property (native scrollbars, form
   *  controls). Usually the same as `name`. */
  scheme?: 'light' | 'dark'
  children?: ReactNode
}

/**
 * Applies a theme by writing its tokens onto :root as CSS custom
 * properties, before paint. The application target is deliberately the
 * document root: portal-rendered components (Tooltip, Dialog) escape the
 * DOM subtree, and :root is the only scope that reaches them.
 *
 * This is the whole mechanism — components never read a theme context; they
 * keep consuming var(--x, fallback), so a theme swap is just a data swap.
 */
export function ThemeProvider({
  tokens,
  name,
  scheme,
  children,
}: ThemeProviderProps): ReactElement {
  useLayoutEffect(() => {
    const root = document.documentElement
    const vars = toCssVars(tokens)
    for (const [key, value] of Object.entries(vars)) {
      root.style.setProperty(key, value)
    }
    root.dataset.theme = name
    root.style.colorScheme = scheme ?? name
    return () => {
      for (const key of Object.keys(vars)) root.style.removeProperty(key)
      delete root.dataset.theme
      root.style.removeProperty('color-scheme')
    }
  }, [tokens, name, scheme])
  return <>{children}</>
}
