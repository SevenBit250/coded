import type { ThemeTokens } from '@uibase'

/** Theme name: the two built-in palettes. */
export type ThemeName = 'light' | 'dark'

/**
 * App palettes. `lightTheme` mirrors the :root fallback values in
 * styles.css exactly; `darkTheme` is the hand-tuned dark counterpart.
 * ThemeProvider applies whichever is active — swapping a theme is swapping
 * this data, nothing else.
 */
export const lightTheme: ThemeTokens = {
  bg: '#fbfbfd',
  bgSoft: '#f5f6f8',
  surface: '#ffffff',
  border: '#e6e8ee',
  hairline: '#eceef2',
  text: '#26272d',
  textDim: '#7d828d',
  textFaint: '#aab0bb',
  accent: '#e8734a',
  dark: '#111214',
  onDark: '#ffffff',
  danger: '#e34d59',
  inkRgb: '20, 22, 26',
  shadowRgb: '20, 22, 30',
  overlayBg: 'rgba(20, 22, 26, 0.28)',
  glassTint: 'rgba(250, 250, 252, 0.22)',
  watermarkStroke: 'rgba(35, 38, 45, 0.07)',
  heading: '#2e3138',
  avatarBg: '#e9e1d8',
  avatarText: '#6b5b45',
}

/** Dark palette tuned against ZCode's dark UI: near-black sidebar backdrop,
 *  a hair lighter content area, and clearly raised surfaces. The caption
 *  overlay picks up `bg`, so the native hover block reads light-gray. */
export const darkTheme: ThemeTokens = {
  bg: '#1b1d23',
  bgSoft: '#16171c',
  surface: '#26282f',
  border: '#33363e',
  hairline: '#2a2c34',
  text: '#e5e6ea',
  textDim: '#9ba0aa',
  textFaint: '#6b7079',
  accent: '#e8734a',
  /* The solid action button inverts in dark mode: light fill, dark glyph. */
  dark: '#eceef2',
  onDark: '#17181b',
  danger: '#e34d59',
  inkRgb: '255, 255, 255',
  shadowRgb: '0, 0, 0',
  overlayBg: 'rgba(0, 0, 0, 0.5)',
  glassTint: 'rgba(14, 15, 18, 0.3)',
  watermarkStroke: 'rgba(255, 255, 255, 0.06)',
  heading: '#eceef2',
  avatarBg: '#3d444e',
  avatarText: '#cfd8e3',
}

export const THEMES: Record<ThemeName, ThemeTokens> = {
  light: lightTheme,
  dark: darkTheme,
}

/** localStorage key for the user's explicit theme choice. */
const STORAGE_KEY = 'dsh-theme'

/** The stored choice, or the OS preference when the user never chose. */
export function initialTheme(): ThemeName {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved === 'light' || saved === 'dark') return saved
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/** Persist an explicit choice. */
export function saveTheme(name: ThemeName): void {
  localStorage.setItem(STORAGE_KEY, name)
}
