import { useEffect } from 'react'
import type { ReactElement } from 'react'
import { OceanScene } from '../components/OceanScene'

/** Startup screen props. */
export interface StartupProps {
  /** Whether the startup screen is still the visible phase. */
  visible: boolean
  /** Called after the leave animation when the screen is no longer visible. */
  onDone: () => void
}

/**
 * Frosted-glass startup screen (Plan B chrome): the window stays transparent
 * so the native acrylic material blurs the desktop behind it. Above the glass
 * tint sits the ocean scene — glow particles filling the bottom two-thirds,
 * whale mark swaying at center. The top chrome (drag region) keeps the brand.
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
      <OceanScene />
      <div className="startup-chrome">
        <span className="startup-brand">Coded</span>
      </div>
    </section>
  )
}
