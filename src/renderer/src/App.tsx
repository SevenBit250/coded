import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { ThemeProvider } from '@uibase'
import { Startup } from './screens/Startup'
import { Main } from './screens/Main'
import { THEMES, initialTheme, saveTheme } from './theme'
import type { ThemeName } from './theme'

/** Startup-sequence phase. */
type ShellPhase = 'startup' | 'entering' | 'main'

/** How long the glass startup screen holds before entering the main UI (ms). */
const BOOT_HOLD_MS = 1400

/** Tuning aid: keep the startup ocean scene mounted, skip the main
 *  transition. Flip back to false (or remove) when done tuning. */
const HOLD_ON_STARTUP = false

/**
 * Root shell: drives the startup -> main transition and owns the theme.
 *
 * Sequence (matches the Plan B chrome spec):
 *  1. Startup screen (frosted glass) mounts first and reports `ready`.
 *  2. After a short "boot" hold so the glass reads as a launch moment, the
 *     screen cross-fades into the main workspace.
 *
 * Theme state lives here because it must wrap BOTH screens: ThemeProvider
 * writes the active palette onto :root before paint, and the choice is
 * persisted (localStorage).
 */
export function App(): ReactElement {
  const [phase, setPhase] = useState<ShellPhase>('startup')
  const [theme, setTheme] = useState<ThemeName>(initialTheme)
  const started = useRef(false)

  const beginTransition = useCallback(() => {
    if (started.current) return
    started.current = true
    setPhase('entering')
    void window.dshDesktop.transition()
  }, [])

  useEffect(() => {
    // Signal first paint so the main process can show the window.
    window.dshDesktop.ready()
    if (HOLD_ON_STARTUP) return
    const timer = setTimeout(beginTransition, BOOT_HOLD_MS)
    return () => clearTimeout(timer)
  }, [beginTransition])

  useEffect(() => {
    saveTheme(theme)
  }, [theme])

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'))
  }, [])

  return (
    <ThemeProvider tokens={THEMES[theme]} name={theme} scheme={theme}>
      <Startup
        visible={phase === 'startup'}
        onDone={beginTransition}
        dark={theme === 'dark'}
      />
      {phase !== 'startup' && (
        <Main
          shown={phase === 'main'}
          onShown={() => setPhase('main')}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
      )}
    </ThemeProvider>
  )
}
