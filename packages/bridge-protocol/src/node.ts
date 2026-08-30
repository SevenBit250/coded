/**
 * Node-only transport helper. Split from the package root so the browser
 * bundle (the renderer imports this package for contract types/constants)
 * never pulls in Node builtins — vite externalizes them and the module
 * evaluation throws. Main-process consumers import from `@coded/bridge-protocol/node`.
 */

import { platform } from 'node:os'

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
