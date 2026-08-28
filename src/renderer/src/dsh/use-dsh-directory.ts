/**
 * useDshDirectory — the sidebar's real roster over the CodedBridge:
 * workspace + session baselines from unary calls, kept live by the host
 * stream (session-added/removed/status, workspace-changed/removed/order,
 * archived set, agent errors).
 *
 * Composition rules follow the harness web surface: blank sessions (no turn
 * yet) and archived sessions are hidden from lists; titles ride the
 * session.list projection baseline (live title updates arrive on the mux
 * stream, which this hook deliberately does not subscribe — titles refresh
 * on the next baseline pull).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { dsh } from './client'
import type { DshStatus, HostFrame, SessionSummary, WorkspaceView } from './client'

export interface DirectorySession {
  id: string
  title: string
  updatedAt: number
  running: boolean
  /** Last agent errored (maps to the interrupted marker). */
  errored: boolean
  blank: boolean
}

export interface DirectoryWorkspace {
  id: string
  title: string
  path: string
  sessions: DirectorySession[]
}

export interface DshDirectory {
  status: DshStatus
  workspaces: DirectoryWorkspace[]
  /** Re-pull both baselines (after mutations the host does not echo). */
  refresh: () => void
}

/** The host frame kinds this hook consumes (adapter-side filter list). */
const HOST_TYPES = [
  'host/session-added',
  'host/session-removed',
  'host/session-status',
  'host/agent-error',
  'host/workspace-changed',
  'host/workspace-removed',
  'host/workspace-order-changed',
  'host/archived-sessions-changed',
]

/** Sidebar title: the 'title' projection, else the blank-session label. */
function titleOf(summary: SessionSummary): string {
  const title = summary.projections?.values['title']
  return typeof title === 'string' && title !== '' ? title : '新会话'
}

function toDirectorySession(summary: SessionSummary): DirectorySession {
  return {
    id: summary.sessionId,
    title: titleOf(summary),
    updatedAt: summary.updatedAt,
    running: summary.running,
    errored: false,
    blank: summary.blank,
  }
}

/** Compose the sidebar rows: workspaces in roster order, their sessions in
 *  owned order, blank and archived sessions hidden. */
function compose(
  workspaces: WorkspaceView[],
  sessions: Map<string, DirectorySession>,
  archived: Set<string>,
): DirectoryWorkspace[] {
  return workspaces.map((workspace) => ({
    id: workspace.workspaceId,
    title: workspace.title,
    path: workspace.path,
    sessions: workspace.sessionIds
      .map((id) => sessions.get(id))
      .filter((s): s is DirectorySession => s !== undefined && !s.blank && !archived.has(s.id)),
  }))
}

export function useDshDirectory(): DshDirectory {
  const [status, setStatus] = useState<DshStatus>('starting')
  const [workspaces, setWorkspaces] = useState<DirectoryWorkspace[]>([])
  const workspacesRef = useRef<WorkspaceView[]>([])
  const sessionsRef = useRef(new Map<string, DirectorySession>())
  const archivedRef = useRef(new Set<string>())
  const subscribedRef = useRef(false)

  /** Recompose + publish from the refs. */
  const publish = useCallback((): void => {
    setWorkspaces(compose(workspacesRef.current, sessionsRef.current, archivedRef.current))
  }, [])

  /** Baseline pull: workspace roster + session list + archived set. */
  const refresh = useCallback((): void => {
    void Promise.all([dsh.listWorkspaces(), dsh.listSessions()])
      .then(([ws, sessions]) => {
        workspacesRef.current = ws.items
        archivedRef.current = new Set(ws.archivedSessionIds)
        sessionsRef.current = new Map(sessions.map((s) => [s.sessionId, toDirectorySession(s)]))
        publish()
      })
      .catch((error: unknown) => {
        console.log(`[dsh-directory] baseline failed: ${String(error)}`)
      })
  }, [publish])

  /** Apply one host-stream frame to the refs, then publish. */
  const applyHostFrame = useCallback(
    (frame: HostFrame): void => {
      switch (frame.type) {
        case 'host/session-added': {
          sessionsRef.current.set(frame.sessionId, {
            id: frame.sessionId,
            title: '新会话',
            updatedAt: Date.now(),
            running: !frame.blank,
            errored: false,
            blank: frame.blank,
          })
          publish()
          return
        }
        case 'host/session-removed': {
          sessionsRef.current.delete(frame.sessionId)
          publish()
          return
        }
        case 'host/session-status': {
          const session = sessionsRef.current.get(frame.sessionId)
          if (session !== undefined) {
            sessionsRef.current.set(frame.sessionId, {
              ...session,
              running: frame.running,
              // A live turn proves the session is no longer blank; starting
              // a new turn clears the previous error marker.
              blank: frame.running ? false : session.blank,
              errored: frame.running ? false : session.errored,
            })
            publish()
          }
          return
        }
        case 'host/agent-error': {
          const session = sessionsRef.current.get(frame.sessionId)
          if (session !== undefined) {
            sessionsRef.current.set(frame.sessionId, { ...session, running: false, errored: true })
            publish()
          }
          return
        }
        case 'host/workspace-changed': {
          const index = workspacesRef.current.findIndex(
            (w) => w.workspaceId === frame.workspace.workspaceId,
          )
          if (index >= 0) workspacesRef.current[index] = frame.workspace
          else workspacesRef.current.push(frame.workspace)
          publish()
          return
        }
        case 'host/workspace-removed': {
          workspacesRef.current = workspacesRef.current.filter(
            (w) => w.workspaceId !== frame.workspaceId,
          )
          publish()
          return
        }
        case 'host/workspace-order-changed': {
          const order = new Map(frame.workspaceIds.map((id, i) => [id, i]))
          workspacesRef.current = [...workspacesRef.current].sort(
            (a, b) => (order.get(a.workspaceId) ?? 0) - (order.get(b.workspaceId) ?? 0),
          )
          publish()
          return
        }
        case 'host/archived-sessions-changed': {
          archivedRef.current = new Set(frame.archivedSessionIds)
          publish()
          return
        }
        default:
          return
      }
    },
    [publish],
  )

  useEffect(() => {
    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let lastStatus: DshStatus = 'starting'
    /** Baseline + host stream, once per bridge-connected epoch. */
    const connect = (): void => {
      refresh()
      if (subscribedRef.current) return
      subscribedRef.current = true
      void dsh
        .openHost(
          {
            onFrame: (frame) => {
              if (!cancelled) applyHostFrame(frame)
            },
            onEnd: (reason) => {
              console.log(`[dsh-directory] host stream ended: ${reason ?? 'closed'}`)
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
          { types: HOST_TYPES },
        )
        .catch((error: unknown) => {
          console.log(`[dsh-directory] host stream open failed: ${String(error)}`)
          subscribedRef.current = false
        })
    }

    const consider = (next: DshStatus): void => {
      if (cancelled) return
      lastStatus = next
      setStatus(next)
      if (next === 'bridge-connected') connect()
      if (next === 'bridge-disconnected') subscribedRef.current = false
    }

    void dsh.status().then((current) => consider(current)).catch(() => {})
    const off = dsh.onStatus(consider)
    return () => {
      cancelled = true
      if (retryTimer !== null) clearTimeout(retryTimer)
      off()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { status, workspaces, refresh }
}
