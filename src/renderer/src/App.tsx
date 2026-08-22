import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { Startup } from './screens/Startup'
import { Main } from './screens/Main'

/** Startup-sequence phase. */
type ShellPhase = 'startup' | 'entering' | 'main'

/** How long the glass startup screen holds before entering the main UI (ms). */
const BOOT_HOLD_MS = 1400

/** Tuning aid: keep the startup ocean scene mounted, skip the main
 *  transition. Flip back to false (or remove) when done tuning. */
const HOLD_ON_STARTUP = true

/**
 * Root shell: drives the startup -> main transition.
 *
 * Sequence (matches the Plan B chrome spec):
 *  1. Startup screen (frosted glass) mounts first and reports `ready`.
 *  2. After a short "boot" hold so the glass reads as a launch moment, the
 *     screen cross-fades into the main workspace.
 */
export function App(): ReactElement {
  const [phase, setPhase] = useState<ShellPhase>('startup')
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

  return (
    <>
      <Startup visible={phase === 'startup'} onDone={beginTransition} />
      {phase !== 'startup' && (
        <Main shown={phase === 'main'} onShown={() => setPhase('main')} />
      )}
    </>
  )
}
