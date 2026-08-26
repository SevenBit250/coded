import type { ReactElement } from 'react'
import { OceanScene } from '../components/OceanScene'

/** Startup screen props. */
export interface StartupProps {
  /** Handoff underway: the glass backdrop fades to the workspace color while
   *  the ocean scene keeps drifting. Pure CSS (see `.startup.whitening` in
   *  styles.css); App unmounts this screen when the white dwell is over. */
  whitening?: boolean
  /** Dark glass variant (particle palette swaps; the shark inverts via CSS). */
  dark?: boolean
}

/**
 * Frosted-glass startup screen (Plan B chrome): the window stays transparent
 * so the native acrylic material blurs the desktop behind it. Above the glass
 * tint sits the ocean scene — glow particles filling the bottom two-thirds,
 * whale mark swaying at center. The top chrome (drag region) keeps the brand.
 *
 * Presentational only: App drives the whitening class and unmounts this
 * screen in the same commit that uncovers the workspace.
 */
export function Startup({ whitening = false, dark = false }: StartupProps): ReactElement {
  return (
    <section className={`screen startup${whitening ? ' whitening' : ''}`} aria-label="启动中">
      <OceanScene dark={dark} />
      {/* Empty chrome bar: owns the top drag region during startup. */}
      <div className="startup-chrome" />
    </section>
  )
}
