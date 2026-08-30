/**
 * Backend binding contract — the seam between the Coded shell and every
 * agent backend. The shell knows NOTHING about specific backends: it loads
 * directory plugins (each = manifest + entry module exporting
 * `createBackend()`), drives the binding through this interface, and speaks
 * CodedBridge over the returned pipe. Whether the binding spawns a core,
 * connects to a resident server, or anything else is the plugin's private
 * business.
 *
 * The plugin side declares these shapes structurally in its own package
 * (plugins must never import shell internals) — the manifest's `apiVersion`
 * is the compatibility anchor for the whole plugin surface.
 */

/** One number pins the compatibility of all three contracts (manifest shape,
 *  plugin API, and the CB protocol major the shell expects). */
export const BACKEND_API_VERSION = 1

/** Lifecycle of one binding instance. */
export type BackendStatus = 'starting' | 'ready' | 'exited' | 'failed'

export interface BackendBinding {
  /** Stable backend id (mirrors the manifest; log scope, selection key). */
  readonly id: string
  /** Human-readable label (diagnostics / future backend picker). */
  readonly label: string
  /** Bring the backend up; resolves with the CB pipe endpoint when ready. */
  start(): Promise<{ pipePath: string }>
  /** Idempotent teardown of the binding's managed resources. */
  stop(): Promise<void>
  on(event: 'status', cb: (status: BackendStatus) => void): () => void
  on(event: 'log', cb: (line: string) => void): () => void
}

/** `coded.backend.json` — the discovery/validation contract. */
export interface BackendManifest {
  id: string
  label: string
  apiVersion: number
  /** Module path relative to the manifest (CJS entry exporting createBackend). */
  entry: string
}

export type BackendFactory = () => BackendBinding

/** One validated adapter directory. */
export interface ScannedBackend {
  dir: string
  manifest: BackendManifest
  create: BackendFactory
}
