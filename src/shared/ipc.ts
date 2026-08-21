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
    pin: 'window:pin',
  },
  shell: {
    ready: 'shell:ready',
    transition: 'shell:transition',
  },
} as const

/** Any window-control channel name. */
export type WindowControlChannel = (typeof IPC.window)[keyof typeof IPC.window]

/** Any shell-lifecycle channel name. */
export type ShellLifecycleChannel = (typeof IPC.shell)[keyof typeof IPC.shell]
