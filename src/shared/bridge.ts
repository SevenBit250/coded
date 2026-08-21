/**
 * The typed surface the preload bridge exposes to the renderer as
 * `window.dshDesktop`. Pure types only — consumed by the preload
 * implementation and by the renderer's global declaration.
 */
export interface DshDesktopBridge {
  /** Shell version string shown in about/startup contexts. */
  version: string
  /** Host platform of the running shell (win32, darwin, linux, ...). */
  platform: NodeJS.Platform
  /** Minimize the host window. */
  minimize: () => void
  /** Toggle maximize/restore of the host window. */
  maximize: () => void
  /** Close the host window (app quits when the last window closes). */
  close: () => void
  /** Resolve whether the host window is maximized (button glyph state). */
  isMaximized: () => Promise<boolean>
  /** Toggle always-on-top; resolves the new pinned state. */
  togglePinned: () => Promise<boolean>
  /** Renderer signals first paint is done and the glass is showing. */
  ready: () => void
  /** Renderer signals the startup animation finished -> main view. */
  transition: () => void
}
