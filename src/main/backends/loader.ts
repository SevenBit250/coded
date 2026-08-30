/**
 * Backend plugin loader: scan adapter directories, validate manifests against
 * the shell's plugin API version, and load entry modules at runtime.
 *
 * Directories are plain folders containing `coded.backend.json` plus the
 * entry module it names. Loading is lazy: scanning only reads and validates
 * manifests; the entry module is imported when the backend is selected. A
 * broken candidate never takes the shell down — it is skipped with a logged
 * reason.
 */

import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  BACKEND_API_VERSION,
  type BackendFactory,
  type BackendManifest,
  type ScannedBackend,
} from './types'

export interface LoaderLog {
  warn: (message: string) => void
  info: (message: string) => void
}

/** Parse + validate one manifest; throws with a reason on any defect. */
function parseManifest(dir: string): BackendManifest {
  const file = join(dir, 'coded.backend.json')
  if (!existsSync(file)) throw new Error('no coded.backend.json')
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    throw new Error(`manifest unreadable: ${String(error)}`)
  }
  const m = raw as Partial<BackendManifest>
  if (typeof m.id !== 'string' || m.id === '') throw new Error('manifest id missing')
  if (typeof m.label !== 'string') throw new Error('manifest label missing')
  if (m.apiVersion !== BACKEND_API_VERSION) {
    throw new Error(`apiVersion ${String(m.apiVersion)} != shell ${String(BACKEND_API_VERSION)}`)
  }
  if (typeof m.entry !== 'string' || m.entry === '') throw new Error('manifest entry missing')
  return { id: m.id, label: m.label, apiVersion: m.apiVersion, entry: m.entry }
}

/** Dynamically load one entry module and extract its factory. CJS entries via
 *  createRequire; ESM entries via native import — both stay untouched by the
 *  bundler because the specifier is computed at runtime. */
async function loadFactory(dir: string, manifest: BackendManifest, log: LoaderLog): Promise<BackendFactory> {
  const entryPath = resolve(dir, manifest.entry)
  if (!existsSync(entryPath)) throw new Error(`entry not found: ${manifest.entry}`)
  let mod: Record<string, unknown>
  try {
    mod = (await import(/* @vite-ignore */ pathToFileURL(entryPath).href)) as Record<string, unknown>
  } catch (error) {
    // Native import of a CJS module works on every supported runtime, but a
    // bundler or loader quirk may leave plain require() as the only path.
    log.warn(`import(${manifest.entry}) failed (${String(error)}); falling back to require`)
    mod = createRequire(__filename)(entryPath) as Record<string, unknown>
  }
  const create = mod['createBackend']
  if (typeof create !== 'function') throw new Error('entry exports no createBackend()')
  return create as BackendFactory
}

/**
 * Scan adapter directories (later dirs win conflicts? no — the FIRST
 * declaration of an id wins, mirroring the harness root precedence).
 * @returns the scanned backends keyed by manifest id; every defective
 *   candidate is logged and skipped, never thrown.
 */
export async function scanAdapters(dirs: string[], log: LoaderLog): Promise<Map<string, ScannedBackend>> {
  const found = new Map<string, ScannedBackend>()
  for (const dir of dirs) {
    if (!existsSync(dir)) continue
    try {
      const manifest = parseManifest(dir)
      if (found.has(manifest.id)) {
        log.warn(`adapter id "${manifest.id}" already declared; ignoring ${dir}`)
        continue
      }
      found.set(manifest.id, { dir, manifest, create: () => {
        throw new Error('factory not loaded')
      } })
    } catch (error) {
      log.warn(`skipping adapter dir ${dir}: ${String(error)}`)
    }
  }
  // Entry modules load after the scan so one broken entry cannot mask the
  // rest of the roster.
  for (const backend of [...found.values()]) {
    try {
      backend.create = await loadFactory(backend.dir, backend.manifest, log)
    } catch (error) {
      log.warn(`skipping adapter "${backend.manifest.id}": ${String(error)}`)
      found.delete(backend.manifest.id)
    }
  }
  return found
}
