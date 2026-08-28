/**
 * Sidebar view state: grouping, ordering, and per-group expansion, persisted
 * as one JSON blob under a single localStorage key (harness parity with the
 * workspace view store). The sidebar owns how the session list is presented;
 * this module owns that state's shape, defaults, and persistence.
 */

/** How sessions are grouped in the list. */
export type SidebarGroupBy = 'workspace' | 'flat'

/** How sessions are ordered (manual = declared order, untouched). */
export type SidebarOrderBy = 'manual' | 'updated'

export interface SidebarViewState {
  groupBy: SidebarGroupBy
  orderBy: SidebarOrderBy
  /** Collapsed workspace ids (workspace grouping only; flat ignores it). */
  collapsed: string[]
}

const VIEW_KEY = 'dsh-sidebar-view'

const DEFAULT_VIEW: SidebarViewState = {
  groupBy: 'workspace',
  orderBy: 'updated',
  collapsed: [],
}

/** Read the persisted view; unknown fields or a corrupt blob fall back to
 *  the defaults field-by-field, so a bad write never breaks the sidebar. */
export function loadSidebarView(): SidebarViewState {
  try {
    const raw = localStorage.getItem(VIEW_KEY)
    if (raw === null) return DEFAULT_VIEW
    const parsed = JSON.parse(raw) as Partial<SidebarViewState>
    return {
      groupBy: parsed.groupBy === 'flat' ? 'flat' : 'workspace',
      orderBy: parsed.orderBy === 'manual' ? 'manual' : 'updated',
      collapsed: Array.isArray(parsed.collapsed)
        ? parsed.collapsed.filter((id): id is string => typeof id === 'string')
        : [],
    }
  } catch {
    return DEFAULT_VIEW
  }
}

/** Write the view through; failures (quota, privacy mode) leave the in-app
 *  state untouched — persistence is best-effort. */
export function saveSidebarView(view: SidebarViewState): void {
  try {
    localStorage.setItem(VIEW_KEY, JSON.stringify(view))
  } catch {
    // Ignore — the UI state is already correct for this session.
  }
}
