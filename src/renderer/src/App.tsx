import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { ThemeProvider } from '@uibase'
import { Startup } from './screens/Startup'
import { Main } from './screens/Main'
import { THEMES, initialTheme, saveTheme } from './theme'
import type { ThemeName } from './theme'

/** Startup-sequence phase: the glass, then the workspace. The glass whitens
 *  for a beat before the swap; only the atomically-committed screen change
 *  is phase-visible, so no intermediate state can paint blank. */
type ShellPhase = 'startup' | 'main'

/**
 * Placeholder for the real readiness gate. The startup screen exists to wait
 * for dsh to launch; until the harness transport is wired, a fixed hold stands
 * in for that signal — swap this timeout for the ready event later.
 */
const BOOT_HOLD_MS = 1400

/** Pre-mount the workspace this far into the boot hold (ms): the first
 *  render/layout/paint of the (large) main tree lands while the glass is
 *  idle, so the final swap presents the workspace the very frame it fires —
 *  no blank gap. */
const MAIN_PREMOUNT_MS = 600

/** How long the glass backdrop takes to whiten once the hold ends (ms).
 *  Must stay in sync with the `.startup.whitening::after` transition. */
const WHITEN_MS = 450

/** Dwell on the fully-white glass before swapping to the workspace (ms):
 *  a beat of calm white so the cut lands as a non-event. */
const UNVEIL_DELAY_MS = 300

/** Tuning aid: keep the startup ocean scene mounted, skip the main
 *  transition. Flip back to false (or remove) when done tuning. */
const HOLD_ON_STARTUP = false

/**
 * Root shell: drives the startup -> main handoff and owns the theme.
 *
 * Sequence (matches the Plan B chrome spec):
 *  1. `startup` — the frosted-glass screen mounts first and reports `ready`.
 *     It stands in for dsh launching (BOOT_HOLD_MS placeholder above); the
 *     workspace pre-mounts underneath partway through the hold.
 *  2. At the end of the hold the glass BACKDROP fades to the workspace color
 *     (scene keeps drifting), dwells white for UNVEIL_DELAY_MS.
 *  3. `main` — one atomic swap: Startup unmounts and Main uncovers in the
 *     same commit, landing on pixels identical to the white it replaces.
 *
 * Theme state lives here because it must wrap BOTH screens: ThemeProvider
 * writes the active palette onto :root before paint, and the choice is
 * persisted (localStorage).
 */
export function App(): ReactElement {
  const [phase, setPhase] = useState<ShellPhase>('startup')
  const [theme, setTheme] = useState<ThemeName>(initialTheme)
  const [mainMounted, setMainMounted] = useState(false)
  const [whitening, setWhitening] = useState(false)
  const started = useRef(false)

  const beginTransition = useCallback(() => {
    if (started.current) return
    started.current = true
    // Handoff begins: whiten the glass backdrop first; the actual screen
    // swap waits for the white dwell below.
    setWhitening(true)
  }, [])

  useEffect(() => {
    if (!whitening) return
    const t = setTimeout(() => {
      setPhase('main')
      void window.dshDesktop.transition()
    }, WHITEN_MS + UNVEIL_DELAY_MS)
    return () => clearTimeout(t)
  }, [whitening])

  useEffect(() => {
    // Signal first paint so the main process can show the window.
    window.dshDesktop.ready()
    if (HOLD_ON_STARTUP) return
    const timer = setTimeout(beginTransition, BOOT_HOLD_MS)
    return () => clearTimeout(timer)
  }, [beginTransition])

  // Workspace pre-mount (see MAIN_PREMOUNT_MS): goes up during the idle part
  // of the hold, hidden at opacity 0 under the startup glass.
  useEffect(() => {
    if (HOLD_ON_STARTUP) return
    const t = setTimeout(() => setMainMounted(true), MAIN_PREMOUNT_MS)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    saveTheme(theme)
  }, [theme])

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'))
  }, [])

  return (
    <ThemeProvider tokens={THEMES[theme]} name={theme} scheme={theme}>
      {phase === 'startup' && <Startup whitening={whitening} dark={theme === 'dark'} />}
      {mainMounted && (
        <Main visible={phase === 'main'} theme={theme} onToggleTheme={toggleTheme} />
      )}
    </ThemeProvider>
  )
}
