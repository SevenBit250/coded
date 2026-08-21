import { useEffect } from 'react'
import type { ReactElement } from 'react'
import { WindowControls } from '../components/WindowControls'

/** Startup screen props. */
export interface StartupProps {
  /** Whether the startup screen is still the visible phase. */
  visible: boolean
  /** Called after the leave animation when the screen is no longer visible. */
  onDone: () => void
}

/**
 * Frosted-glass startup screen (Plan B chrome): the window stays transparent
 * so the native acrylic material blurs the desktop behind it, with a light
 * translucent tint and a centered dark logo — the reference look. The top
 * chrome (drag region + window controls) mirrors the main titlebar.
 */
export function Startup({ visible, onDone }: StartupProps): ReactElement {
  useEffect(() => {
    if (visible) return
    // Give the leave animation time to finish before unmounting.
    const t = setTimeout(onDone, 520)
    return () => clearTimeout(t)
  }, [visible, onDone])

  if (!visible) return <></>

  return (
    <section className="screen startup" aria-label="启动中">
      <div className="startup-chrome">
        <span className="startup-brand">DeepSeek Harness</span>
        <WindowControls />
      </div>
      <div className="startup-logo" aria-hidden="true">
        DSH
      </div>
    </section>
  )
}
