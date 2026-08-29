/** Global type for the preload bridge exposed to the renderer. */
import type { CodedDesktop } from '../shared/bridge'

declare global {
  interface Window {
    coded: CodedDesktop
  }
}

export {}
