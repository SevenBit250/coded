import type { ThemeTokens } from '@uibase'

/** Theme name: the built-in palettes plus the ZCode-tuned pair. */
export type ThemeName = 'light' | 'dark' | 'zcode-light' | 'zcode-dark'

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

/** ZCode light: the reference app's default palette (its stylesheet :root).
 *  Near-white content on gray-50, #f0f0f0 recessed sidebar, pure-white
 *  surfaces, BLACK as the brand/primary (solid buttons are black), and
 *  neutral ink-alpha hovers/selection instead of a tinted accent. */
export const zcodeLight: Partial<ThemeTokens> = {
  bg: '#fafafa',
  bgSoft: '#f0f0f0',
  surface: '#ffffff',
  border: 'rgba(13, 13, 13, 0.1)',
  hairline: 'rgba(13, 13, 13, 0.07)',
  text: '#262626',
  textDim: 'rgba(64, 64, 64, 0.6)',
  textFaint: 'rgba(64, 64, 64, 0.4)',
  accent: '#000000',
  accentBg: 'rgba(13, 13, 13, 0.08)',
  dark: '#000000',
  onDark: '#ffffff',
  danger: '#dc2626',
  inkRgb: '13, 13, 13',
  shadowRgb: '13, 13, 13',
  overlayBg: 'rgba(13, 13, 13, 0.28)',
  glassTint: 'rgba(250, 250, 250, 0.22)',
  watermarkStroke: 'rgba(13, 13, 13, 0.06)',
  heading: '#0a0a0a',
  avatarBg: '#e5e5e5',
  avatarText: '#404040',
}

/** ZCode dark: background/panel grays from its .dark block (#161616 canvas,
 *  #202020 raised surfaces), neutral-300 text, WHITE as the brand/primary
 *  with near-black glyphs, white-alpha hovers/selection. */
export const zcodeDark: Partial<ThemeTokens> = {
  bg: '#161616',
  bgSoft: '#161616',
  surface: '#202020',
  border: 'rgba(255, 255, 255, 0.1)',
  hairline: 'rgba(255, 255, 255, 0.07)',
  text: '#d4d4d4',
  textDim: '#a3a3a3',
  textFaint: '#737373',
  accent: '#ffffff',
  accentBg: 'rgba(255, 255, 255, 0.1)',
  dark: '#ffffff',
  onDark: '#0a0a0a',
  danger: '#f87171',
  inkRgb: '255, 255, 255',
  shadowRgb: '0, 0, 0',
  overlayBg: 'rgba(0, 0, 0, 0.5)',
  glassTint: 'rgba(22, 22, 22, 0.3)',
  watermarkStroke: 'rgba(255, 255, 255, 0.06)',
  heading: '#fafafa',
  avatarBg: '#404040',
  avatarText: '#d4d4d4',
}

/** Overrides per palette name; 'light' is `null` — applyTheme clears the
 *  inline properties and the stylesheet's light theme governs again. */
export const THEME_OVERRIDES: Record<ThemeName, Partial<ThemeTokens> | null> = {
  light: null,
  dark: darkTheme,
  'zcode-light': zcodeLight,
  'zcode-dark': zcodeDark,
}

/** localStorage key for the user's explicit theme choice. */
const STORAGE_KEY = 'coded-theme'

/** What the user picked: the palettes, or follow the OS. */
export type ThemeChoice = 'system' | ThemeName

/** The persisted choice; 'system' when the user never chose. */
export function loadThemeChoice(): ThemeChoice {
  const saved = localStorage.getItem(STORAGE_KEY)
  return saved === 'light' || saved === 'dark' || saved === 'zcode-light' || saved === 'zcode-dark'
    ? saved
    : 'system'
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
