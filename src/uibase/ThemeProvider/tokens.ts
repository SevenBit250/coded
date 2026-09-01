/**
 * The theme contract every uibase component consumes. Values are plain
 * data; ThemeProvider writes them onto CSS custom properties, and component
 * styles read them via var(--x, fallback). Component CSS always carries the
 * light value as its fallback, so the library still renders sensibly with
 * no provider mounted.
 */
export interface ThemeTokens {
  /** App background (content area). */
  bg: string
  /** Recessed background (sidebar backdrop, composer card). */
  bgSoft: string
  /** Raised surface (cards, menus, dialog). */
  surface: string
  /** Standard border. */
  border: string
  /** Fainter border/divider. */
  hairline: string
  /** Primary text. */
  text: string
  /** Secondary text. */
  textDim: string
  /** Tertiary text, placeholders. */
  textFaint: string
  /** Brand accent. */
  accent: string
  /** Soft tint behind a selected/highlighted row (accent's quiet sibling). */
  accentBg: string
  /** Solid dark action (send button) background. */
  dark: string
  /** Content drawn on top of `dark` / `danger` solids. */
  onDark: string
  /** Destructive action. */
  danger: string
  /**
   * 'r, g, b' triad for hover/active alpha overlays — dark ink in the light
   * theme, white in the dark theme. Used as rgba(var(--ink-rgb), alpha).
   */
  inkRgb: string
  /** 'r, g, b' triad for elevation shadows: rgba(var(--shadow-rgb), alpha). */
  shadowRgb: string
  /** Modal backdrop scrim. */
  overlayBg: string
  /** Startup glass tint over the native compositor material. */
  glassTint: string
  /** Watermark outline color. */
  watermarkStroke: string
  /** Big greeting heading color. */
  heading: string
  /** User avatar chip background. */
  avatarBg: string
  /** User avatar chip text. */
  avatarText: string
}

/** camelCase token keys -> '--kebab-case' custom properties. Accepts a
 *  partial map — override themes only carry the fields they change. */
export function toCssVars(tokens: Partial<ThemeTokens>): Record<string, string> {
  const vars: Record<string, string> = {}
  for (const [key, value] of Object.entries(tokens)) {
    vars['--' + key.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())] = value
  }
  return vars
}
