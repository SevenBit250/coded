/**
 * IPC channel names shared by the main process and the preload bridge.
 *
 * One literal map is the single source of truth: the two sides can never
 * drift apart, and the renderer-facing surface stays type-checked through
 * the bridge types in `./bridge.ts`.
 */
export const IPC = {
  window: {
    minimize: 'window:minimize',
    maximize: 'window:maximize',
    close: 'window:close',
    isMaximized: 'window:is-maximized',
  },
  shell: {
    ready: 'shell:ready',
    transition: 'shell:transition',
  },
  /** CodedBridge face: renderer ↔ main ↔ harness adapter (via local pipe). */
  dsh: {
    /** invoke(method, payload) → harness ApiProxy unary response (full form). */
    invoke: 'dsh:invoke',
    /** invoke(name, payload) → stream id; frames arrive on `frame`. */
    streamOpen: 'dsh:stream-open',
    /** send(streamId): shell-side cancellation of an open stream. */
    streamAbort: 'dsh:stream-abort',
    /** event {id, envelope}: one downstream frame (ServerRequest full form). */
    frame: 'dsh:frame',
    /** event {id}: the adapter confirmed the stream is established. */
    streamReady: 'dsh:stream-ready',
    /** event {id, reason?}: the stream finished on the adapter side. */
    streamEnd: 'dsh:stream-end',
    /** invoke() → current lifecycle status (initial read; changes push). */
    statusGet: 'dsh:status-get',
    /** event {status}: runtime/bridge lifecycle broadcast. */
    status: 'dsh:status',
  },
} as const

/** Any window-control channel name. */
export type WindowControlChannel = (typeof IPC.window)[keyof typeof IPC.window]

/** Any shell-lifecycle channel name. */
export type ShellLifecycleChannel = (typeof IPC.shell)[keyof typeof IPC.shell]
