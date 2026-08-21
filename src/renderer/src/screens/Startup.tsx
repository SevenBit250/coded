import { useEffect } from 'react'
import type { ReactElement } from 'react'

/** Startup screen props. */
export interface StartupProps {
  /** Whether the startup screen is still the visible phase. */
  visible: boolean
  /** Called after the leave animation when the screen is no longer visible. */
  onDone: () => void
}

/**
 * Frosted-glass startup screen (Plan B chrome): the launch splash shown before
 * the main workspace enters. The glass is drawn by CSS (translucent card +
 * backdrop-filter) layered over the transparent/native-acrylic window.
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
      <div className="glass-card">
        <div className="logo" aria-hidden="true">
          <span className="glyph">DSH</span>
        </div>
        <h1 className="name">DeepSeek Harness</h1>
        <p className="tagline">桌面工作区 · 启动中</p>
        <div className="meter" aria-hidden="true">
          <span className="bar" />
        </div>
      </div>
    </section>
  )
}
