/** Global type for the preload bridge exposed to the renderer. */
import type { DshDesktopBridge } from '../shared/bridge'

declare global {
  interface Window {
    dshDesktop: DshDesktopBridge
  }
}

export {}
