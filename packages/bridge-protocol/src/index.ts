/**
 * CodedBridge protocol package: wire frames, protocol version, and the local
 * pipe endpoint helper shared by the Coded shell and the adapter plugin.
 */

import { platform } from 'node:os'
export * from './frames.js'
export * from './semantic.js'

/**
 * Default pipe endpoint for a scope name (e.g. the harness profile or a
 * session discriminator). Windows resolves to a named pipe, POSIX to a
 * UDS under the user runtime dir (falls back to /tmp). Same `listen()` /
 * `connect()` call sites work on both — Node picks the semantics from the
 * path shape.
 */
export function defaultPipePath(scope: string): string {
  const name = `coded-bridge-${scope}`
  if (platform() === 'win32') return `\\\\.\\pipe\\${name}`
  const dir = process.env['XDG_RUNTIME_DIR'] ?? '/tmp'
  return `${dir}/${name}.sock`
}
