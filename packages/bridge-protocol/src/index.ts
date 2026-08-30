/**
 * CodedBridge protocol package — the BROWSER-SAFE contract surface: wire
 * frames, protocol version, and semantic types. Pure constants and types
 * only; the Node-only transport helper (defaultPipePath) lives behind the
 * `@coded/bridge-protocol/node` subpath so the renderer can import this
 * package without pulling Node builtins.
 */

export * from './frames.js'
export * from './semantic.js'
