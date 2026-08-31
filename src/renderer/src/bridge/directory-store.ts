/**
 * useDirectory — the sidebar's real roster over the CodedBridge: workspace
 * + session baselines from unary calls, kept live by the semantic events
 * stream (§2.3): session added/removed/phase/title, agent errors, workspace
 * changes, and the archived set.
 *
 * Composition rules follow the harness web surface: blank sessions (no turn
 * yet) and archived sessions are hidden from lists; the semantic
 * `session.title` event keeps titles live without a baseline re-pull.
 *
 * Ported 1:1 from the React hook: the event reducer operates on plain Maps
 * and republishes a composed snapshot — same shapes, same rules, now as a
 * Pinia store (app-lifetime singleton, subscription wired at store init).
 */
import { ref } from 'vue'
import { defineStore } from 'pinia'
import { bridge } from './client'
import type { CodedSemanticEvent, CodedSession, CodedWorkspace, BridgeStatus } from './client'

export interface DirectorySession {
  id: string
  title: string
  updatedAt: number
  running: boolean
  /** Last agent errored (maps to the interrupted marker). */
  errored: boolean
  blank: boolean
  /** The agent preset this session runs, when it names one. */
  agentPreset?: string
}

export interface DirectoryWorkspace {
  id: string
  title: string
  path: string
  sessions: DirectorySession[]
}

/** Semantic event kinds this store consumes (adapter-side filter list). */
const EVENT_TYPES = [
  'session.added',
  'session.removed',
  'session.phase',
  'session.title',
  'backend.error',
  'session.workspaceChanged',
  'session.workspaceRemoved',
  'session.archivedChanged',
]

/** Sidebar row from the semantic roster: '' titles fold onto the blank label. */
function toDirectorySession(session: CodedSession): DirectorySession {
  return {
    id: session.id,
    title: session.title !== '' ? session.title : '新会话',
    updatedAt: session.updatedAt,
    running: session.phase === 'running',
    errored: session.phase === 'errored',
    blank: session.phase === 'blank',
    ...(session.agentPreset !== undefined ? { agentPreset: session.agentPreset } : {}),
  }
}

/** Compose the sidebar rows: workspaces in roster order, their sessions in
 *  owned order, blank and archived sessions hidden — except blank sessions
 *  the shell pinned at send time (lazy create), which stay visible until
 *  their first turn clears the blank bit naturally. */
function compose(
  workspaces: CodedWorkspace[],
  sessions: Map<string, DirectorySession>,
  archived: Set<string>,
  pinned: Map<string, string | null>,
): DirectoryWorkspace[] {
  return workspaces.map((workspace) => {
    // Shell-sent sessions are anchored to their workspace BEFORE the baseline
    // learns them (session.added carries no ownership): append the pinned ids
    // bound to this workspace that the roster does not list yet.
    const listed = new Set(workspace.sessionIds)
    const pinnedHere = [...pinned.entries()]
      .filter(([id, wsId]) => wsId === workspace.workspaceId && !listed.has(id))
      .map(([id]) => sessions.get(id))
      .filter((s): s is DirectorySession => s !== undefined)
    const sessions_ = workspace.sessionIds
      .map((id) => sessions.get(id))
      .filter(
        (s): s is DirectorySession =>
          s !== undefined && (!s.blank || pinned.has(s.id)) && !archived.has(s.id),
        )
      .concat(pinnedHere.filter((s) => !archived.has(s.id)))
    return { id: workspace.workspaceId, title: workspace.title, path: workspace.path, sessions: sessions_ }
  })
}

export const useDirectoryStore = defineStore('directory', () => {
  const status = ref<BridgeStatus>('starting')
  const workspaces = ref<DirectoryWorkspace[]>([])

  // Mutable working state — plain containers, recomposed into `workspaces`.
  const workspacesRef: CodedWorkspace[] = []
  const sessionsRef = new Map<string, DirectorySession>()
  const archivedRef = new Set<string>()
  /** Shell-sent sessions kept visible (and workspace-anchored) while blank. */
  const pinnedRef = new Map<string, string | null>()
  let subscribed = false

  /** Recompose + publish from the mutable containers. */
  function publish(): void {
    workspaces.value = compose(workspacesRef, sessionsRef, archivedRef, pinnedRef)
  }

  /** Anchor one shell-sent session to its workspace (lazy create). */
  function pinSession(sessionId: string, workspaceId: string | null): void {
    pinnedRef.set(sessionId, workspaceId)
    publish()
  }

  /** Baseline pull: workspace roster + session list + archived set. */
  function refresh(): void {
    void Promise.all([bridge.listWorkspaces(), bridge.listSessions()])
      .then(([ws, sessions]) => {
        workspacesRef.splice(0, workspacesRef.length, ...ws.workspaces)
        archivedRef.clear()
        for (const id of ws.archivedSessionIds) archivedRef.add(id)
        sessionsRef.clear()
        for (const s of sessions) sessionsRef.set(s.id, toDirectorySession(s))
        publish()
      })
      .catch((error: unknown) => {
        console.log(`[directory] baseline failed: ${String(error)}`)
      })
  }

  /** Apply one semantic event to the containers, then publish. */
  function applyEvent(event: CodedSemanticEvent): void {
    switch (event.type) {
      case 'session.added': {
        // Web parity: this frame is an UPSERT, not add-if-absent. A cold
        // session's baseline row is header-only (the host list skips the
        // log), and the same frame lands again when the session attaches —
        // our models.list on open cold-resumes it — carrying the
        // log-derived agentPreset. Skipping known rows would freeze the
        // stale creation-header value forever.
        const existing = sessionsRef.get(event.sessionId)
        if (existing !== undefined) {
          sessionsRef.set(event.sessionId, {
            ...existing,
            blank: event.blank === true,
            ...(event.agentPreset !== undefined ? { agentPreset: event.agentPreset } : {}),
          })
          publish()
          return
        }
        sessionsRef.set(event.sessionId, {
          id: event.sessionId,
          title: '新会话',
          updatedAt: Date.now(),
          running: false,
          errored: false,
          blank: event.blank === true,
          ...(event.agentPreset !== undefined ? { agentPreset: event.agentPreset } : {}),
        })
        publish()
        return
      }
      case 'session.removed': {
        sessionsRef.delete(event.sessionId)
        publish()
        return
      }
      case 'session.phase': {
        const session = sessionsRef.get(event.sessionId)
        if (session !== undefined) {
          sessionsRef.set(event.sessionId, {
            ...session,
            running: event.phase === 'running',
            // A live turn proves the session is no longer blank; starting
            // a new turn clears the previous error marker.
            blank: event.phase === 'running' ? false : session.blank,
            errored: event.phase === 'running' ? false : session.errored,
          })
          publish()
        }
        return
      }
      case 'session.title': {
        const session = sessionsRef.get(event.sessionId)
        if (session !== undefined && event.title !== '') {
          sessionsRef.set(event.sessionId, { ...session, title: event.title })
          publish()
        }
        return
      }
      case 'backend.error': {
        if (event.sessionId === undefined) return
        const session = sessionsRef.get(event.sessionId)
        if (session !== undefined) {
          sessionsRef.set(event.sessionId, { ...session, running: false, errored: true })
          publish()
        }
        return
      }
      case 'session.workspaceChanged': {
        const index = workspacesRef.findIndex((w) => w.workspaceId === event.workspace.workspaceId)
        if (index >= 0) workspacesRef[index] = event.workspace
        else workspacesRef.push(event.workspace)
        publish()
        return
      }
      case 'session.workspaceOrderChanged': {
        const order = new Map(event.workspaceIds.map((id, i) => [id, i]))
        workspacesRef.sort(
          (a, b) => (order.get(a.workspaceId) ?? 0) - (order.get(b.workspaceId) ?? 0),
        )
        publish()
        return
      }
      case 'session.archivedChanged': {
        refresh()
        return
      }
      default:
        return
    }
  }

  // Baseline + events stream, once per bridge-connected epoch. The store is
  // an app-lifetime singleton, so this wires exactly once at store init —
  // the React version's mount-once effect semantics.
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let lastStatus: BridgeStatus = 'starting'

  const connect = (): void => {
    refresh()
    if (subscribed) return
    subscribed = true
    void bridge
      .openEvents(
        {
          onEvent: (event) => {
            applyEvent(event)
          },
          onEnd: () => {
            subscribed = false
            if (lastStatus === 'bridge-connected') {
              retryTimer = setTimeout(() => {
                retryTimer = null
                if (!subscribed && lastStatus === 'bridge-connected') {
                  connect()
                }
              }, 1000)
            }
          },
        },
        { types: EVENT_TYPES },
      )
      .catch((error: unknown) => {
        console.log(`[directory] events open failed: ${String(error)}`)
        subscribed = false
      })
  }

  const consider = (next: BridgeStatus): void => {
    lastStatus = next
    status.value = next
    if (next === 'bridge-connected') connect()
    if (next === 'bridge-disconnected') subscribed = false
  }

  // Pull the current status first: the bridge-connected broadcast usually
  // fires before the store is first used, so push-only misses it.
  void bridge.status().then((current) => consider(current)).catch(() => {})
  bridge.onStatus(consider)

  return { status, workspaces, refresh, pinSession }
})
