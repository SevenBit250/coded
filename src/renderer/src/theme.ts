import type { ThemeTokens } from '@uibase'

/** Theme name: the built-in palettes. */
export type ThemeName = 'light' | 'dark'

/**
 * The light theme lives in exactly ONE place: the `:root` block of
 * styles.css — it doubles as the pre-JS fallback, so the very first paint
 * is already correct. This file carries only the per-theme OVERRIDES:
 * fields a theme changes relative to the stylesheet; anything omitted
 * inherits the light value. Adding a theme = add one override map and
 * register it in THEME_OVERRIDES below.
 */

/** Dark palette tuned against ZCode's dark UI: near-black sidebar backdrop,
 *  a hair lighter content area, and clearly raised surfaces. The caption
 *  overlay picks up `bg`, so the native hover block reads light-gray.
 *  accent/danger match light and are intentionally omitted. */
export const darkTheme: Partial<ThemeTokens> = {
  bg: '#1b1d23',
  bgSoft: '#16171c',
  surface: '#26282f',
  border: '#33363e',
  hairline: '#2a2c34',
  text: '#e5e6ea',
  textDim: '#9ba0aa',
  textFaint: '#6b7079',
  /* The solid action button inverts in dark mode: light fill, dark glyph. */
  dark: '#eceef2',
  onDark: '#17181b',
  inkRgb: '255, 255, 255',
  shadowRgb: '0, 0, 0',
  overlayBg: 'rgba(0, 0, 0, 0.5)',
  glassTint: 'rgba(14, 15, 18, 0.3)',
  watermarkStroke: 'rgba(255, 255, 255, 0.06)',
  heading: '#eceef2',
  avatarBg: '#3d444e',
  avatarText: '#cfd8e3',
}

/** Overrides per palette name; 'light' is `null` — applyTheme clears the
 *  inline properties and the stylesheet's light theme governs again. */
export const THEME_OVERRIDES: Record<ThemeName, Partial<ThemeTokens> | null> = {
  light: null,
  dark: darkTheme,
}

/** localStorage key for the user's explicit theme choice. */
const STORAGE_KEY = 'coded-theme'

/** What the user picked: the two palettes, or follow the OS. */
export type ThemeChoice = 'system' | 'light' | 'dark'

/** The persisted choice; 'system' when the user never chose. */
export function loadThemeChoice(): ThemeChoice {
  const saved = localStorage.getItem(STORAGE_KEY)
  return saved === 'light' || saved === 'dark' ? saved : 'system'
}

/** Persist the choice. */
export function saveThemeChoice(choice: ThemeChoice): void {
  localStorage.setItem(STORAGE_KEY, choice)
}

/** The OS preference right now. */
export function systemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

/** Choice + current OS preference -> the active palette name. */
export function resolveTheme(choice: ThemeChoice, systemDark: boolean): ThemeName {
  if (choice === 'system') return systemDark ? 'dark' : 'light'
  return choice
}
