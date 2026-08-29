/**
 * Composer workspace choice, persisted under a single localStorage key: the
 * workspace the next launch defaults to ("上次退出时的工作区"). Stores the id
 * AND the path — ids are roster identities that may not survive a backend
 * restart, so the path is the recovery anchor. An explicit null id is the
 * "不在项目中工作" pick and is honored as such.
 */

export interface LastWorkspace {
  id: string | null
  path: string | null
}

const WORKSPACE_KEY = 'dsh-workspace'

/** Read the persisted choice; null = nothing stored (first run). */
export function loadLastWorkspace(): LastWorkspace | null {
  try {
    const raw = localStorage.getItem(WORKSPACE_KEY)
    if (raw === null) return null
    const parsed = JSON.parse(raw) as Partial<LastWorkspace>
    if (parsed.id !== null && typeof parsed.id !== 'string') return null
    if (parsed.path !== null && typeof parsed.path !== 'string') return null
    return { id: parsed.id ?? null, path: parsed.path ?? null }
  } catch {
    return null
  }
}

/** Write the choice through; failures (quota, privacy mode) are ignored —
 *  persistence is best-effort. */
export function saveLastWorkspace(value: LastWorkspace): void {
  try {
    localStorage.setItem(WORKSPACE_KEY, JSON.stringify(value))
  } catch {
    // Ignore — the UI state is already correct for this session.
  }
}
