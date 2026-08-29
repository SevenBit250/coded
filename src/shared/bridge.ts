/**
 * The typed surface the preload bridge exposes to the renderer as
 * `window.dshDesktop`. Pure types only — consumed by the preload
 * implementation and by the renderer's global declaration.
 */

/** Lifecycle of the harness runtime + CodedBridge, as seen from the shell. */
export type DshBridgeStatus =
  | 'starting'
  | 'runtime-ready'
  | 'bridge-connected'
  | 'bridge-disconnected'
  | 'runtime-exited'
  | 'failed'

/** Callbacks for one open downstream stream (mux/host frames). */
export interface DshStreamHandlers {
  /** One downstream frame: a ServerRequest full-form document. */
  onFrame: (envelope: unknown) => void
  /** The adapter confirmed the subscription is established. */
  onOpen?: () => void
  /** The stream finished on the adapter side (or the bridge dropped). */
  onEnd?: (reason?: string) => void
}

/** CodedBridge face: renderer ↔ main ↔ harness adapter (via local pipe). */
export interface DshBridgeSurface {
  /** Current lifecycle status (async: resolved over IPC). */
  status: () => Promise<DshBridgeStatus>
  /** Subscribe to status changes; returns the unsubscribe function. */
  onStatus: (cb: (status: DshBridgeStatus) => void) => () => void
  /**
   * Harness ApiProxy unary call. Resolves with the carrier's full-form
   * ServerResponse document ({type:'server-response', rpcId, ok, value|error}).
   */
  invoke: (method: string, payload: unknown) => Promise<unknown>
  /**
   * Open a downstream event stream ('mux' | 'host'). Resolves with the
   * shell-side stream id once dispatched (open confirmation arrives through
   * handlers.onOpen).
   */
  openStream: (stream: 'mux' | 'host' | 'events', payload: unknown, handlers: DshStreamHandlers) => Promise<number>
  /** Shell-side cancellation of an open stream. */
  abortStream: (id: number) => void
}

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
  /** Renderer signals first paint is done and the glass is showing. */
  ready: () => void
  /** Renderer signals the startup animation finished -> main view. */
  transition: () => void
  /** Harness runtime + bridge surface. */
  dsh: DshBridgeSurface
}
