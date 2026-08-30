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
  /** CodedBridge face: renderer ↔ main ↔ backend adapter (via local pipe). */
  bridge: {
    /** invoke(method, payload) → backend adapter unary response (full form). */
    invoke: 'bridge:invoke',
    /** invoke(name, payload) → stream id; frames arrive on `frame`. */
    streamOpen: 'bridge:stream-open',
    /** send(streamId): shell-side cancellation of an open stream. */
    streamAbort: 'bridge:stream-abort',
    /** event {id, envelope}: one downstream frame (ServerRequest full form). */
    frame: 'bridge:frame',
    /** event {id}: the adapter confirmed the stream is established. */
    streamReady: 'bridge:stream-ready',
    /** event {id, reason?}: the stream finished on the adapter side. */
    streamEnd: 'bridge:stream-end',
    /** invoke() → current lifecycle status (initial read; changes push). */
    statusGet: 'bridge:status-get',
    /** event {status}: runtime/bridge lifecycle broadcast. */
    status: 'bridge:status',
    /** invoke() → adapter hello capabilities of the current bridge epoch. */
    capabilitiesGet: 'bridge:capabilities-get',
    /** invoke() → the loaded backend binding's identity (null while none). */
    backendGet: 'bridge:backend-get',
    /** invoke() → ask the manager to restart the current backend binding. */
    restart: 'bridge:restart',
  },
} as const

/** Any window-control channel name. */
export type WindowControlChannel = (typeof IPC.window)[keyof typeof IPC.window]

/** Any shell-lifecycle channel name. */
export type ShellLifecycleChannel = (typeof IPC.shell)[keyof typeof IPC.shell]
