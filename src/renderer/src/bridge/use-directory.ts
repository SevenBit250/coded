/**
 * useDirectory — the sidebar's real roster over the CodedBridge: workspace
 * + session baselines from unary calls, kept live by the semantic events
 * stream (§2.3): session added/removed/phase/title, agent errors, workspace
 * changes, and the archived set.
 *
 * Composition rules follow the harness web surface: blank sessions (no turn
 * yet) and archived sessions are hidden from lists; the semantic
 * `session.title` event keeps titles live without a baseline re-pull.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { bridge } from './client'
import type { CodedSemanticEvent, CodedSession, CodedTranscriptItem, CodedWorkspace, BridgeStatus } from './client'

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

export interface CodedDirectory {
  status: BridgeStatus
  workspaces: DirectoryWorkspace[]
  /** Re-pull both baselines (after mutations the host does not echo). */
  refresh: () => void
  /**
   * Keep a just-sent session visible through the blank→running gap AND anchor
   * it to its workspace before the baseline absorbs it: the session.added
   * frame carries no workspace ownership, so without the pin the
   * ghost-cleanup pass would drop the fresh selection.
   */
  pinSession: (sessionId: string, workspaceId: string | null) => void
}

/** Semantic event kinds this hook consumes (adapter-side filter list). */
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

export function useDirectory(): CodedDirectory {
  const [status, setStatus] = useState<BridgeStatus>('starting')
  const [workspaces, setWorkspaces] = useState<DirectoryWorkspace[]>([])
  const workspacesRef = useRef<CodedWorkspace[]>([])
  const sessionsRef = useRef(new Map<string, DirectorySession>())
  const archivedRef = useRef(new Set<string>())
  /** Shell-sent sessions kept visible (and workspace-anchored) while blank. */
  const pinnedRef = useRef(new Map<string, string | null>())
  const subscribedRef = useRef(false)

  /** Recompose + publish from the refs. */
  const publish = useCallback((): void => {
    setWorkspaces(compose(workspacesRef.current, sessionsRef.current, archivedRef.current, pinnedRef.current))
  }, [])

  /** Anchor one shell-sent session to its workspace (lazy create). */
  const pinSession = useCallback(
    (sessionId: string, workspaceId: string | null): void => {
      pinnedRef.current.set(sessionId, workspaceId)
      publish()
    },
    [publish],
  )

  /** Baseline pull: workspace roster + session list + archived set. */
  const refresh = useCallback((): void => {
    void Promise.all([bridge.listWorkspaces(), bridge.listSessions()])
      .then(([ws, sessions]) => {
        workspacesRef.current = ws.workspaces
        archivedRef.current = new Set(ws.archivedSessionIds)
        sessionsRef.current = new Map(sessions.map((s) => [s.id, toDirectorySession(s)]))
        publish()
      })
      .catch((error: unknown) => {
        console.log(`[directory] baseline failed: ${String(error)}`)
      })
  }, [publish])

  /** Apply one semantic event to the refs, then publish. */
  const applyEvent = useCallback(
    (event: CodedSemanticEvent): void => {
      switch (event.type) {
        case 'session.added': {
          // Web parity: this frame is an UPSERT, not add-if-absent. A cold
          // session's baseline row is header-only (the host list skips the
          // log), and the same frame lands again when the session attaches —
          // our models.list on open cold-resumes it — carrying the
          // log-derived agentPreset. Skipping known rows would freeze the
          // stale creation-header value forever.
          const existing = sessionsRef.current.get(event.sessionId)
          if (existing !== undefined) {
            sessionsRef.current.set(event.sessionId, {
              ...existing,
              blank: event.blank === true,
              ...(event.agentPreset !== undefined ? { agentPreset: event.agentPreset } : {}),
            })
            publish()
            return
          }
          sessionsRef.current.set(event.sessionId, {
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
          sessionsRef.current.delete(event.sessionId)
          publish()
          return
        }
        case 'session.phase': {
          const session = sessionsRef.current.get(event.sessionId)
          if (session !== undefined) {
            sessionsRef.current.set(event.sessionId, {
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
          const session = sessionsRef.current.get(event.sessionId)
          if (session !== undefined && event.title !== '') {
            sessionsRef.current.set(event.sessionId, { ...session, title: event.title })
            publish()
          }
          return
        }
        case 'backend.error': {
          if (event.sessionId === undefined) return
          const session = sessionsRef.current.get(event.sessionId)
          if (session !== undefined) {
            sessionsRef.current.set(event.sessionId, { ...session, running: false, errored: true })
            publish()
          }
          return
        }
        case 'session.workspaceChanged': {
          const index = workspacesRef.current.findIndex(
            (w) => w.workspaceId === event.workspace.workspaceId,
          )
          if (index >= 0) workspacesRef.current[index] = event.workspace
          else workspacesRef.current.push(event.workspace)
          publish()
          return
        }
        case 'session.workspaceOrderChanged': {
          const order = new Map(event.workspaceIds.map((id, i) => [id, i]))
          workspacesRef.current = [...workspacesRef.current].sort(
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
    },
    [publish, refresh],
  )

  useEffect(() => {
    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let lastStatus: BridgeStatus = 'starting'
    /** Baseline + events stream, once per bridge-connected epoch. */
    const connect = (): void => {
      refresh()
      if (subscribedRef.current) return
      subscribedRef.current = true
      void bridge
        .openEvents(
          {
            onEvent: (event) => {
              if (!cancelled) applyEvent(event)
            },
            onEnd: (reason) => {
              subscribedRef.current = false
              if (!cancelled && lastStatus === 'bridge-connected') {
                retryTimer = setTimeout(() => {
                  retryTimer = null
                  if (!cancelled && !subscribedRef.current && lastStatus === 'bridge-connected') {
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
          subscribedRef.current = false
        })
    }

    const consider = (next: BridgeStatus): void => {
      if (cancelled) return
      lastStatus = next
      setStatus(next)
      if (next === 'bridge-connected') connect()
      if (next === 'bridge-disconnected') subscribedRef.current = false
    }

    void bridge.status().then((current) => consider(current)).catch(() => {})
    const off = bridge.onStatus(consider)
    return () => {
      cancelled = true
      if (retryTimer !== null) clearTimeout(retryTimer)
      off()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { status, workspaces, refresh, pinSession }
}

/** Keep the transcript item type re-exported for directory consumers. */
export type { CodedTranscriptItem }
