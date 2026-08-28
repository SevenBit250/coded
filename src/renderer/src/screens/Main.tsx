import { useMemo, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, ReactElement } from 'react'
import {
  Icon,
  IconButton,
  Split,
  Tooltip,
  WindowControls,
  Dropdown,
  MetaButton,
  ScrollArea,
  Spinner,
  Menu,
  MenuItem,
  MenuDivider,
  MenuLabel,
  Dialog,
} from '@uibase'
import type { DropdownAction, DropdownOption } from '@uibase'
import type { ThemeName } from '../theme'
import { loadSidebarView, saveSidebarView } from '../sidebar-view'
import type { SidebarViewState } from '../sidebar-view'

/** Main screen props. */
export interface MainProps {
  /** Whether the shell has swapped to this screen. While false the workspace
   *  sits pre-mounted at opacity 0 under the startup glass; the flip happens
   *  in the same commit that unmounts Startup — one paint, no gap. */
  visible: boolean
  /** Active theme (the toggle shows where a click leads). Temporary wiring
   *  until a real settings surface exists. */
  theme: ThemeName
  /** Flip light <-> dark. */
  onToggleTheme: () => void
}

/** Sidebar menu icon names (line icons matching the reference). */
type MenuIconName = 'new-task' | 'search' | 'connector' | 'market'

/** Sidebar menu entry. */
interface MenuItem {
  icon: MenuIconName
  label: string
  shortcut?: string
}

const MENU: readonly MenuItem[] = [
  { icon: 'new-task', label: '新建任务', shortcut: 'Ctrl+N' },
  { icon: 'search', label: '搜索', shortcut: 'Ctrl+K' },
  { icon: 'connector', label: '连接器' },
  { icon: 'market', label: '插件市场' },
]

/** Sidebar geometry (px): default/min/max width, plus the backdrop strip
 *  between the sidebar and the content panel that the Split sash fills. */
const SIDEBAR_DEFAULT = 240
const SIDEBAR_MIN = 240
const SIDEBAR_MAX = 480
const SIDEBAR_GAP = 3

interface MenuIconProps {
  name: MenuIconName
}

/** Menu line icon by name (hand-drawn 16-grid set). */
function MenuIcon({ name }: MenuIconProps): ReactElement {
  switch (name) {
    case 'new-task':
      return (
        <Icon viewBox="0 0 16 16" strokeWidth={1.25}>
          <rect x="2.5" y="2.5" width="11" height="11" rx="2.5" />
          <path d="M8 5.4v5.2M5.4 8h5.2" />
        </Icon>
      )
    case 'search':
      return (
        <Icon viewBox="0 0 16 16" strokeWidth={1.25}>
          <circle cx="7" cy="7" r="4" />
          <path d="M10 10l3 3" />
        </Icon>
      )
    case 'connector':
      return (
        <Icon viewBox="0 0 16 16" strokeWidth={1.25}>
          {/* lucide:plug */}
          <path d="M12 4.5v4a3 3 0 0 1-6 0v-4" />
          <path d="M9 2v3M7 2v3M6 10v4" />
        </Icon>
      )
    case 'market':
      return (
        <Icon viewBox="0 0 16 16" strokeWidth={1.25}>
          <rect x="2.5" y="2.5" width="5" height="5" rx="1" />
          <rect x="8.5" y="2.5" width="5" height="5" rx="1" />
          <rect x="2.5" y="8.5" width="5" height="5" rx="1" />
          <rect x="8.5" y="8.5" width="5" height="5" rx="1" />
        </Icon>
      )
  }
}

/** Sidebar top row: sidebar expand/collapse toggle and back/forward arrows;
 *  the new-chat button only appears in the collapsed bar (reference).
 *  The title is intentionally absent in both states. */
function SidebarTopRow({
  onToggle,
  collapsed = false,
}: {
  onToggle: () => void
  collapsed?: boolean
}): ReactElement {
  return (
    <>
      <IconButton
        className="sidebar-toggle"
        label="切换侧边栏"
        shortcut="Mod+B"
        onClick={onToggle}
        icon={
          /* lucide:panel-left-close / lucide:panel-left-open */
          <Icon>
            <rect width="18" height="18" x="3" y="3" rx="2" />
            <path d={collapsed ? 'M9 3v18m5-12 3 3-3 3' : 'M9 3v18m7-6-3-3 3-3'} />
          </Icon>
        }
      />
      <span className="nav-arrows">
        {/* lucide:chevron-left / lucide:chevron-right; pale by default —
            no navigation history has happened yet */}
        <IconButton
          className="nav-arrow"
          label="后退"
          icon={
            <Icon>
              <path d="m15 18-6-6 6-6" />
            </Icon>
          }
        />
        <IconButton
          className="nav-arrow"
          label="前进"
          icon={
            <Icon>
              <path d="m9 18 6-6-6-6" />
            </Icon>
          }
        />
      </span>
      {collapsed && (
        <IconButton
          className="chat-new"
          label="新建对话"
          icon={
            /* lucide:message-circle-plus */
            <Icon>
              <path d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719M8 12h8m-4-4v8" />
            </Icon>
          }
        />
      )}
    </>
  )
}

/** Project list entry (placeholder data until the dsh host lands). */
/** Compact relative time for session rows (harness rows use the same
 *  compact buckets: 刚刚 / {n}分钟 / {n}小时 / {n}天). */
function relTime(minutesAgo: number): string {
  if (minutesAgo < 1) return '刚刚'
  if (minutesAgo < 60) return `${Math.round(minutesAgo)}分钟`
  const hours = minutesAgo / 60
  if (hours < 24) return `${Math.round(hours)}小时`
  const days = hours / 24
  return `${Math.round(days)}天`
}

/** Session lifecycle shown in the sidebar (harness projection semantics,
 *  ZCode-style markers): running spins, approval-blocked shows the tail tag,
 *  settled rows keep a quiet dot — green for a clean finish, red for an
 *  abnormal end (network drop, crash). Idle rows carry no marker. */
type SessionStatus = 'idle' | 'running' | 'needs-confirm' | 'completed' | 'interrupted'

interface SessionStub {
  /** Session id. */
  id: string
  /** Display title. */
  title: string
  /** Relative recency bucket (minutes) — drives the compact right-side time. */
  updatedMinutesAgo: number
  /** Lifecycle state driving the row's lead/tail markers. */
  status: SessionStatus
  /** Freshly created, still-empty session: no time, no menu, no card. */
  placeholder?: boolean
}

interface WorkspaceStub {
  /** Stable id handed through selection. */
  id: string
  /** Display title. */
  title: string
  /** Filesystem path (canonical). */
  path: string
  sessions: SessionStub[]
}

const WORKSPACES: readonly WorkspaceStub[] = [
  {
    id: 'dsh',
    title: 'dsh',
    path: 'C:\\Users\\25293\\Desktop\\aiworkspace\\dsh',
    sessions: [
      {
        id: 's1',
        title: '拉取并研究 deepseek-harness',
        updatedMinutesAgo: 5760,
        status: 'completed',
      },
      { id: 's2', title: '调研 Electron 嵌入方案', updatedMinutesAgo: 4320, status: 'interrupted' },
      { id: 's3', title: '跑通 web 端最小闭环', updatedMinutesAgo: 2880, status: 'idle' },
    ],
  },
  {
    id: 'dsh-desktop',
    title: 'dsh-desktop',
    path: 'C:\\Users\\25293\\Desktop\\aiworkspace\\dsh\\dsh-desktop',
    sessions: [
      { id: 's4', title: '侧栏工作区布局对齐', updatedMinutesAgo: 35, status: 'running' },
      { id: 's5', title: '底栏按钮体系统一', updatedMinutesAgo: 120, status: 'needs-confirm' },
      { id: 's6', title: 'Dropdown 十二向与快捷键', updatedMinutesAgo: 1440, status: 'completed' },
    ],
  },
  {
    id: 'docs',
    title: 'docs',
    path: 'C:\\Users\\25293\\Desktop\\aiworkspace\\dsh\\docs',
    sessions: [
      { id: 's7', title: 'Electron 嵌入方案评估', updatedMinutesAgo: 4320, status: 'idle' },
    ],
  },
  {
    id: 'unnamed',
    title: '未命名项目',
    path: 'C:\\Users\\25293\\Desktop\\aiworkspace\\unnamed',
    sessions: [],
  },
]

const PROJECT_ACTIONS: readonly DropdownAction[] = [
  { id: 'open-folder', label: '打开文件夹' },
  { id: 'remote-connect', label: '远程连接' },
]

/**
 * Model / reasoning-effort rosters: static stand-ins for now. The harness
 * side loads models via ModelDirectory (api call on open) and reads effort
 * from the session projection — wire these up once the transport lands.
 */
const MODELS: readonly DropdownOption[] = [
  { id: 'deepseek-chat', label: 'deepseek-chat' },
  { id: 'deepseek-reasoner', label: 'deepseek-reasoner' },
]

const EFFORTS: readonly DropdownOption[] = [
  {
    id: 'low',
    label: '低',
    // lucide:gauge
    icon: (
      <Icon>
        <path d="m12 14 4-4M3.34 19a10 10 0 1 1 17.32 0" />
      </Icon>
    ),
  },
  {
    id: 'medium',
    label: '中',
    icon: (
      <Icon>
        <path d="m12 14 4-4M3.34 19a10 10 0 1 1 17.32 0" />
      </Icon>
    ),
  },
  {
    id: 'high',
    label: '高',
    icon: (
      <Icon>
        <path d="m12 14 4-4M3.34 19a10 10 0 1 1 17.32 0" />
      </Icon>
    ),
  },
  {
    id: 'max',
    label: '最高',
    icon: (
      <Icon>
        <path d="m12 14 4-4M3.34 19a10 10 0 1 1 17.32 0" />
      </Icon>
    ),
  },
]

/**
 * Working modes, mirrored from the harness agent presets (ids + zh copy per
 * ui-agent-preset locales). Static stand-in for now — swap the roster and the
 * local state for `api.agentPresets.list` + Settings ns 'agent-presets'
 * patching once the transport lands.
 */
const MODES: readonly DropdownOption[] = [
  {
    id: 'standard',
    label: '标准模式',
    description: '功能完整的编码 Agent：文件编辑、Shell、检索、Skills、计划、目标、子代理与工作流。',
    // lucide:layers
    icon: (
      <Icon>
        <path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" />
        <path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65" />
        <path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65" />
      </Icon>
    ),
  },
  {
    id: 'code',
    label: 'PTC 模式',
    description: '具备标准模式的全部能力，并通过 Code Mode SDK 让模型用一个 TypeScript 程序组合多步操作。',
    // lucide:code
    icon: (
      <Icon>
        <path d="m16 18 6-6-6-6M8 6l-6 6 6 6" />
      </Icon>
    ),
  },
  {
    id: 'minimal',
    label: '极简模式',
    description: '仅提供持久 bash 与 str_replace_editor 的双工具编码 Agent。',
    // lucide:circle-minus
    icon: (
      <Icon>
        <circle cx="12" cy="12" r="10" />
        <path d="M8 12h8" />
      </Icon>
    ),
  },
  {
    id: 'cordis',
    label: '创造模式',
    description: '创建自定义 Agent preset：标准模式的全部能力，外加运行时检查、插件实验与创作指导。',
    // lucide:wand-2
    icon: (
      <Icon>
        <path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72Z" />
        <path d="m14 7 3 3" />
        <path d="M5 6v4M19 14v4M10 2v2M7 8H3M21 16h-4M11 3H9" />
      </Icon>
    ),
  },
]

/** Time-of-day greeting (the reference opens with a "care" tone). */
/**
 * Access presets — the harness sandbox trio, verbatim from
 * permission-presets' knobStateSchema (read-only | workspace-write |
 * danger-full-access). Plan mode is NOT one of them: it belongs to the
 * separate /plan domain and will get its own composer affordance later.
 */
const ACCESS_MODES: readonly DropdownOption[] = [
  {
    id: 'read-only',
    label: '变更前确认',
    description: '改文件前先问我。',
    // lucide:hand
    icon: (
      <Icon>
        <path d="M18 11V6a2 2 0 0 0-4 0v5" />
        <path d="M14 10V4a2 2 0 0 0-4 0v2" />
        <path d="M10 10.5V6a2 2 0 0 0-4 0v8" />
        <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
      </Icon>
    ),
  },
  {
    id: 'workspace-write',
    label: '自动编辑',
    description: '自动编辑工作区内文件。',
    // lucide:shield-check
    icon: (
      <Icon>
        <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
        <path d="m9 12 2 2 4-4" />
      </Icon>
    ),
  },
  {
    id: 'danger-full-access',
    label: '完全访问',
    description: '减少确认次数。',
    // lucide:lock-open
    icon: (
      <Icon>
        <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 9.9-1" />
      </Icon>
    ),
  },
]

/** Context actions behind the composer's ＋ button (image ref). */
const CONTEXT_ACTIONS: readonly DropdownAction[] = [
  {
    id: 'attach',
    label: '添加附件',
    // lucide:paperclip
    icon: (
      <Icon>
        <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
      </Icon>
    ),
  },
  {
    id: 'at-context',
    label: '使用 @ 添加上下文',
    // lucide:at-sign
    icon: (
      <Icon>
        <circle cx="12" cy="12" r="4" />
        <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8" />
      </Icon>
    ),
  },
  {
    id: 'slash-commands',
    label: '使用 / 选择命令或能力',
    // lucide:square-check
    icon: (
      <Icon>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="m9 12 2 2 4-5" />
      </Icon>
    ),
  },
]

function greeting(): string {
  const hour = new Date().getHours()
  if (hour >= 23 || hour < 6) return '夜深啦，别忘了照顾好自己哦'
  if (hour < 11) return '早上好，今天想做点什么？'
  if (hour < 13) return '中午好呀，要不要先休息一下'
  if (hour < 18) return '下午好，继续推进吧'
  return '晚上好，别忘了照顾好自己哦'
}

/** Recency order: smaller "minutes ago" first. */
function byRecency(a: SessionStub, b: SessionStub): number {
  return a.updatedMinutesAgo - b.updatedMinutesAgo
}

/** Actions offered in a session row's ⋯ menu. */
type SessionAction = 'rename' | 'fork' | 'archive'

/** Actions offered in a workspace row's ⋯ menu. */
type WorkspaceAction = 'rename' | 'delete'

/** True when the event started inside the row's inline action zone. */
function fromActionZone(event: ReactMouseEvent | ReactKeyboardEvent): boolean {
  return (event.target as HTMLElement).closest('.row-menu, .row-actions') !== null
}

/** One session row: fixed lead slot (spinner/dots), title, approval tag,
 *  recency, hover ⋯ menu. The row is a div[role=button] so the inline menu
 *  can nest real buttons. */
function SessionRow({
  session,
  selected,
  onSelect,
  onAction,
}: {
  session: SessionStub
  selected: boolean
  onSelect: () => void
  onAction: (action: SessionAction) => void
}): ReactElement {
  const [menuOpen, setMenuOpen] = useState(false)
  return (
    <div
      className={`session-row${selected ? ' selected' : ''}${menuOpen ? ' menu-open' : ''}${session.placeholder === true ? ' placeholder' : ''}`}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={(event) => {
        if (fromActionZone(event)) return
        onSelect()
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        if (fromActionZone(event)) return
        event.preventDefault()
        onSelect()
      }}
    >
      <span className="session-lead" aria-hidden="true">
        {session.status === 'running' && <Spinner size={12} className="session-spinner" />}
        {session.status === 'completed' && <span className="session-dot session-dot--done" />}
        {session.status === 'interrupted' && <span className="session-dot session-dot--stopped" />}
      </span>
      <span className="session-title">{session.title}</span>
      {session.status === 'needs-confirm' && <span className="session-flag">需要确认</span>}
      {session.placeholder === true ? (
        // Fresh blank session: nothing to show or act on yet.
        <span className="session-time" />
      ) : (
        <>
          <span className="session-time">{relTime(session.updatedMinutesAgo)}</span>
          <Menu
            className="row-menu"
            portal
            cardClassName="row-menu-card"
            onOpenChange={setMenuOpen}
            trigger={({ open, toggle }) => (
              <button
                type="button"
                className="row-action"
                aria-label="会话操作"
                aria-haspopup="menu"
                aria-expanded={open}
                onClick={toggle}
              >
                <Icon viewBox="0 0 16 16" strokeWidth={1.7}>
                  <circle cx="3.4" cy="8" r="0.7" />
                  <circle cx="8" cy="8" r="0.7" />
                  <circle cx="12.6" cy="8" r="0.7" />
                </Icon>
              </button>
            )}
          >
            <MenuItem onClick={() => onAction('rename')}>重命名</MenuItem>
            <MenuItem onClick={() => onAction('fork')}>分叉会话</MenuItem>
            <MenuItem onClick={() => onAction('archive')}>归档会话</MenuItem>
          </Menu>
        </>
      )}
    </div>
  )
}

/** One workspace group header row: folder-open/closed carries the collapse
 *  state; hover reveals the ⋯ menu (rename/delete) and the + new-session
 *  button. The row is a div[role=button] so the inline actions can nest
 *  real buttons. */
function WorkspaceRow({
  workspace,
  collapsed,
  onToggle,
  onNewSession,
  onAction,
}: {
  workspace: WorkspaceStub
  collapsed: boolean
  onToggle: () => void
  onNewSession: () => void
  onAction: (action: WorkspaceAction) => void
}): ReactElement {
  const [menuOpen, setMenuOpen] = useState(false)
  return (
    <div
      className={`project${menuOpen ? ' menu-open' : ''}`}
      role="button"
      tabIndex={0}
      aria-expanded={!collapsed}
      onClick={(event) => {
        if (fromActionZone(event)) return
        onToggle()
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        if (fromActionZone(event)) return
        event.preventDefault()
        onToggle()
      }}
    >
        <span className="project-name">
          <Icon className="folder" viewBox="0 0 24 24" strokeWidth={1.8}>
            {collapsed ? (
              /* lucide:folder */
              <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
            ) : (
              /* lucide:folder-open */
              <path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2" />
            )}
          </Icon>
          {workspace.title}
        </span>
        <span className="row-actions">
          <Menu
            className="row-menu"
            portal
            cardClassName="row-menu-card"
            onOpenChange={setMenuOpen}
            trigger={({ open, toggle }) => (
              <button
                type="button"
                className="row-action"
                aria-label="工作区操作"
                aria-haspopup="menu"
                aria-expanded={open}
                onClick={toggle}
              >
                <Icon viewBox="0 0 16 16" strokeWidth={1.7}>
                  <circle cx="3.4" cy="8" r="0.7" />
                  <circle cx="8" cy="8" r="0.7" />
                  <circle cx="12.6" cy="8" r="0.7" />
                </Icon>
              </button>
            )}
          >
            <MenuItem onClick={() => onAction('rename')}>重命名</MenuItem>
            <MenuItem danger onClick={() => onAction('delete')}>
              删除工作区
            </MenuItem>
          </Menu>
          <button
            type="button"
            className="row-action"
            aria-label="新建会话"
            onClick={onNewSession}
          >
            <Icon viewBox="0 0 16 16" strokeWidth={1.4}>
              <path d="M8 3.5v9M3.5 8h9" />
            </Icon>
          </button>
        </span>
      </div>
  )
}

/**
 * Main workspace — ZCode-like shell (placeholder until the dsh React client
 * mounts here over the Plan B custom protocol): collapsible sidebar with nav
 * and projects, resizable by dragging the sash on its right edge; a welcoming
 * content column (watermark, greeting, composer), and window chrome top-right.
 */
export function Main({ visible, theme, onToggleTheme }: MainProps): ReactElement {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT)
  const [resizing, setResizing] = useState(false)
  const [selectedProject, setSelectedProject] = useState<string | null>(null)
  // Workspace/session data — the seed until the dsh host lands; the row
  // actions (rename/delete/fork/archive/new) mutate this local copy.
  const [workspaces, setWorkspaces] = useState<WorkspaceStub[]>([...WORKSPACES])
  // Sidebar view state (grouping/ordering/collapse) persists as one blob.
  const [view, setView] = useState<SidebarViewState>(loadSidebarView)
  const patchView = (patch: Partial<SidebarViewState>): void => {
    setView((prev) => {
      const next = { ...prev, ...patch }
      saveSidebarView(next)
      return next
    })
  }
  const toggleWorkspace = (id: string): void => {
    patchView({
      collapsed: view.collapsed.includes(id)
        ? view.collapsed.filter((x) => x !== id)
        : [...view.collapsed, id],
    })
  }
  // The open session; selection lives only on the row (no sync target yet).
  const [selectedSession, setSelectedSession] = useState<string | null>(null)
  // Rename dialog: which row is being renamed, its draft and any error.
  const [renameTarget, setRenameTarget] = useState<
    { kind: 'workspace'; id: string } | { kind: 'session'; wsId: string; id: string } | null
  >(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [renameError, setRenameError] = useState<string | null>(null)
  // Delete-workspace confirm dialog.
  const [deleteTarget, setDeleteTarget] = useState<WorkspaceStub | null>(null)

  /** Open the rename dialog pre-filled for a workspace or session row. */
  const openRename = (target: NonNullable<typeof renameTarget>, initial: string): void => {
    setRenameTarget(target)
    setRenameDraft(initial)
    setRenameError(null)
  }

  const submitRename = (): void => {
    if (renameTarget === null) return
    const title = renameDraft.trim()
    if (title === '') return
    if (renameTarget.kind === 'workspace') {
      // Harness parity: duplicate workspace names are refused.
      if (workspaces.some((w) => w.title === title && w.id !== renameTarget.id)) {
        setRenameError(`已存在名为"${title}"的工作区。`)
        return
      }
      const id = renameTarget.id
      setWorkspaces((prev) => prev.map((w) => (w.id === id ? { ...w, title } : w)))
    } else {
      const { wsId, id } = renameTarget
      setWorkspaces((prev) =>
        prev.map((w) =>
          w.id !== wsId
            ? w
            : { ...w, sessions: w.sessions.map((s) => (s.id === id ? { ...s, title } : s)) },
        ),
      )
    }
    setRenameTarget(null)
  }

  const confirmDeleteWorkspace = (): void => {
    if (deleteTarget === null) return
    const doomed = deleteTarget
    setWorkspaces((prev) => prev.filter((w) => w.id !== doomed.id))
    if (doomed.sessions.some((s) => s.id === selectedSession)) setSelectedSession(null)
    if (selectedProject === doomed.id) setSelectedProject(null)
    setDeleteTarget(null)
  }

  /** Fork: insert an idle copy right after the source (placeholder for the
   *  transport-level session.fork). */
  const forkSession = (wsId: string, source: SessionStub): void => {
    setWorkspaces((prev) =>
      prev.map((w) => {
        if (w.id !== wsId) return w
        const idx = w.sessions.indexOf(source)
        if (idx < 0) return w
        const copy: SessionStub = {
          id: `fork-${Date.now()}`,
          title: `${source.title}（分叉）`,
          updatedMinutesAgo: 0,
          status: 'idle',
        }
        const sessions = [...w.sessions]
        sessions.splice(idx + 1, 0, copy)
        return { ...w, sessions }
      }),
    )
  }

  /** Archive: non-destructive in the harness, so it just hides the row. */
  const archiveSession = (wsId: string, sessionId: string): void => {
    setWorkspaces((prev) =>
      prev.map((w) =>
        w.id !== wsId ? w : { ...w, sessions: w.sessions.filter((s) => s.id !== sessionId) },
      ),
    )
    if (selectedSession === sessionId) setSelectedSession(null)
  }

  /** New session: an empty placeholder row at the group's tail. */
  const addSession = (wsId: string): void => {
    setWorkspaces((prev) =>
      prev.map((w) =>
        w.id !== wsId
          ? w
          : {
              ...w,
              sessions: [
                ...w.sessions,
                {
                  id: `new-${Date.now()}`,
                  title: '新会话',
                  updatedMinutesAgo: 0,
                  status: 'idle',
                  placeholder: true,
                },
              ],
            },
      ),
    )
  }

  /** Route a session row-menu action (shared by grouped and flat views). */
  const dispatchSessionAction = (
    action: SessionAction,
    wsId: string,
    session: SessionStub,
  ): void => {
    if (action === 'rename') {
      openRename({ kind: 'session', wsId, id: session.id }, session.title)
    } else if (action === 'fork') {
      forkSession(wsId, session)
    } else {
      archiveSession(wsId, session.id)
    }
  }

  // View derivation: 'updated' orders sessions by recency (workspace groups
  // follow their most recent session); 'manual' keeps declared order.
  const orderedSessions = (sessions: SessionStub[]): SessionStub[] =>
    view.orderBy === 'updated' ? [...sessions].sort(byRecency) : sessions
  const orderedWorkspaces =
    view.groupBy === 'workspace' && view.orderBy === 'updated'
      ? [...workspaces].sort(
          (a, b) =>
            Math.min(...a.sessions.map((s) => s.updatedMinutesAgo), Infinity) -
            Math.min(...b.sessions.map((s) => s.updatedMinutesAgo), Infinity),
        )
      : workspaces
  const flatEntries = workspaces.flatMap((w) => w.sessions.map((s) => ({ ws: w, session: s })))
  const flatSessions =
    view.groupBy === 'flat'
      ? view.orderBy === 'updated'
        ? [...flatEntries].sort((a, b) => byRecency(a.session, b.session))
        : flatEntries
      : null
  // Composer's workspace picker follows the live list; memoized so its
  // references stay stable across renders (Dropdown placement re-runs on
  // unstable literals).
  const projectOptions = useMemo<DropdownOption[]>(
    () => workspaces.map((w) => ({ id: w.id, label: w.title })),
    [workspaces],
  )
  const [workMode, setWorkMode] = useState<string | null>('standard')
  // Harness parity: the agent preset is pinned when the session starts, so
  // the first send flips this and locks the mode selector for the rest of
  // the conversation.
  const [conversationStarted, setConversationStarted] = useState(false)
  // Access preset: defaults to harness' default pairing (sandbox
  // workspace-write + approval ask).
  const [accessMode, setAccessMode] = useState<string | null>('workspace-write')
  // Model / effort rosters are static stand-ins (see MODELS / EFFORTS above).
  const [model, setModel] = useState<string | null>('deepseek-chat')
  const [effort, setEffort] = useState<string | null>('max')

  return (
    <section
      className={`screen main${visible ? '' : ' main-premount'}${resizing ? ' resizing' : ''}`}
      aria-label="主界面"
    >
      {/* The anchor strip is transparent and owns the window drag region
          (full top width). Left group: sidebar toggle/arrows/chat.
          Right group: window controls only (on Windows those are the
          system caption buttons). No app title in either state. */}
      <div className="anchor-bar">
        <div className="anchor-left">
          <SidebarTopRow
            onToggle={() => setSidebarOpen(!sidebarOpen)}
            collapsed={!sidebarOpen}
          />
        </div>
        <div className="anchor-right">
          {/* Windows draws its own caption buttons via titleBarOverlay;
              other platforms get the uibase chrome with IPC wired here. */}
          {window.dshDesktop.platform !== 'win32' && (
            <WindowControls
              onMinimize={() => window.dshDesktop.minimize()}
              onMaximize={() => window.dshDesktop.maximize()}
              onClose={() => window.dshDesktop.close()}
            />
          )}
        </div>
      </div>
      <div className={`main-body${sidebarOpen ? '' : ' collapsed'}`}>
        <nav className="sidebar" style={{ width: sidebarWidth }}>
          <div className="menu">
            {MENU.map((item) => (
              <button key={item.label} className="menu-item">
                <span className="menu-ico">
                  <MenuIcon name={item.icon} />
                </span>
                <span>{item.label}</span>
                {item.shortcut !== undefined && (
                  <span className="shortcut">{item.shortcut}</span>
                )}
              </button>
            ))}
          </div>

          <div className="section-label">
            <span>工作区</span>
            <span className="section-actions">
              {/* View options: grouping + ordering menu (harness web's
                  view-options slot), selection pinned with checks. */}
              <Menu
                className="view-menu"
                trigger={({ open, toggle }) => (
                  <IconButton
                    className="section-action"
                    label="视图选项"
                    tip="视图选项"
                    aria-haspopup="menu"
                    aria-expanded={open}
                    onClick={toggle}
                    icon={
                      <Icon viewBox="0 0 16 16" strokeWidth={1.3}>
                        <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h7" />
                      </Icon>
                    }
                  />
                )}
              >
                <MenuLabel>分组方式</MenuLabel>
                <MenuItem
                  selected={view.groupBy === 'workspace'}
                  onClick={() => patchView({ groupBy: 'workspace' })}
                >
                  按工作区
                </MenuItem>
                <MenuItem
                  selected={view.groupBy === 'flat'}
                  onClick={() => patchView({ groupBy: 'flat' })}
                >
                  单列表
                </MenuItem>
                <MenuDivider />
                <MenuLabel>排序方式</MenuLabel>
                <MenuItem
                  selected={view.orderBy === 'manual'}
                  onClick={() => patchView({ orderBy: 'manual' })}
                >
                  手动排序
                </MenuItem>
                <MenuItem
                  selected={view.orderBy === 'updated'}
                  onClick={() => patchView({ orderBy: 'updated' })}
                >
                  最近更新
                </MenuItem>
              </Menu>
              {/* Add workspace: folder + plus, matching the web header. */}
              <IconButton
                className="section-action"
                label="添加工作区"
                tip="添加工作区"
                icon={
                  <Icon viewBox="0 0 16 16" strokeWidth={1.3}>
                    <path d="M4.5 13.5h7l1-8.5h-3.3L7.6 3.5H3.5v6.5" />
                    <path d="M10.5 11.5v4M8.5 13.5h4" />
                  </Icon>
                }
              />
            </span>
          </div>

          <ScrollArea className="projects" label="工作区与会话" outside={6}>
            {view.groupBy === 'flat' ? (
              /* Flat list: every session in one recency-ordered column. */
              <div className="session-list">
                {flatSessions?.map(({ ws, session }) => (
                  <SessionRow
                    key={session.id}
                    session={session}
                    selected={selectedSession === session.id}
                    onSelect={() => setSelectedSession(session.id)}
                    onAction={(action) => dispatchSessionAction(action, ws.id, session)}
                  />
                ))}
              </div>
            ) : (
              orderedWorkspaces.map((workspace) => {
                const isCollapsed = view.collapsed.includes(workspace.id)
                return (
                  <div
                    key={workspace.id}
                    className={`workspace-group${isCollapsed ? ' collapsed' : ''}`}
                  >
                    <WorkspaceRow
                      workspace={workspace}
                      collapsed={isCollapsed}
                      onToggle={() => toggleWorkspace(workspace.id)}
                      onNewSession={() => addSession(workspace.id)}
                      onAction={(action) => {
                        if (action === 'rename') {
                          openRename({ kind: 'workspace', id: workspace.id }, workspace.title)
                        } else {
                          setDeleteTarget(workspace)
                        }
                      }}
                    />
                    {/* Grid-rows collapse: 1fr -> 0fr animates the group shut
                        without measuring heights. */}
                    <div className="workspace-sessions-wrap">
                      <div className="workspace-sessions">
                        {orderedSessions(workspace.sessions).map((s) => (
                          <SessionRow
                            key={s.id}
                            session={s}
                            selected={selectedSession === s.id}
                            onSelect={() => setSelectedSession(s.id)}
                            onAction={(action) =>
                              dispatchSessionAction(action, workspace.id, s)
                            }
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </ScrollArea>

          <div className="side-gap" />

          <div className="side-footer">
            {/* Harness parity: the only footer affordance is the Settings
                trigger row (gear + label); there is no user row or task
                toggle here. */}
            <button className="settings-row" aria-label="设置">
              <Icon className="settings-ico">
                <path d="M12.2 2h-.44a2 2 0 0 0 2 2v.44a2 2 0 0 0 2 2h.44a2 2 0 0 1 2 2v.44a2 2 0 0 0 2 2v.44a2 2 0 0 1 2 2h.44a2 2 0 0 0 2 2v.44a2 2 0 0 0-2 2h-.44a2 2 0 0 1-2 2v-.44a2 2 0 0 0-2 2h-.44a2 2 0 0 1-2 2v-.44a2 2 0 0 0-2 2h-.44a2 2 0 0 1-2-2v-.44a2 2 0 0 0-2-2h-.44a2 2 0 0 1-2-2v-.44a2 2 0 0 0-2-2h-.44a2 2 0 0 1-2-2v-.44a2 2 0 0 0-2-2z" />
                <circle cx="18" cy="18" r="3" />
              </Icon>
              <span>设置</span>
            </button>
          </div>
        </nav>

        {/* The sash fills the backdrop strip between the sidebar and the
            content panel; hidden when collapsed (the panel then covers the
            sidebar edge to edge). While it is dragged, `resizing` strips
            the panel's collapse transition so it tracks the pointer. */}
        {sidebarOpen && (
          <Split
            className="sidebar-split"
            style={{ left: sidebarWidth }}
            label="调整侧栏宽度"
            value={sidebarWidth}
            min={SIDEBAR_MIN}
            max={SIDEBAR_MAX}
            onChange={setSidebarWidth}
            onDragStart={() => setResizing(true)}
            onDragEnd={() => setResizing(false)}
          />
        )}

        <div
          className="content-col"
          style={{ left: sidebarOpen ? sidebarWidth + SIDEBAR_GAP : 0 }}
        >
          <main className="content">
          <div className="watermark" aria-hidden="true">
            C
          </div>

          {/* Centered in the conversation area: the composer anchors the
              center; the greeting rides a fixed 26px above the card. */}
          <div className="composer-anchor">
            <h1 className="greeting">{greeting()}</h1>

          <div className="composer">
            <div className="composer-head">
              <Dropdown
                options={projectOptions}
                value={selectedProject}
                onChange={setSelectedProject}
                actions={PROJECT_ACTIONS}
                onAction={(id) => {
                  // TODO(dsh wiring): open-folder -> pickWorkspace; remote -> connect flow.
                  void id
                }}
                noneLabel="不在项目中工作"
              />
              <Dropdown
                headSlot="selected"
                options={MODES}
                value={workMode}
                onChange={setWorkMode}
                placeholder="选择模式"
                searchable={false}
                disabled={conversationStarted}
              />
            </div>
            <div className="composer-body">
            <textarea
              className="composer-input"
              rows={3}
              placeholder="向 Coded 提问，使用 @ 添加上下文，使用 / 选择命令或能力"
              aria-label="向 Coded 提问"
            />
            <div className="composer-foot">
              <div className="composer-left">
                {/* ＋ context menu: attach / @-mention / slash commands. */}
                <Dropdown
                  actions={CONTEXT_ACTIONS}
                  onAction={(id) => {
                    // TODO(dsh wiring): attach -> file picker; at-context ->
                    // insert '@' into the composer; slash-commands -> palette.
                    void id
                  }}
                  searchable={false}
                  placement="top-left"
                  fitContent
                  renderTrigger={({ open, toggle }) => (
                    <Tooltip label="添加上下文" placement="top-left">
                      <button
                        type="button"
                        className="plus-btn"
                        aria-label="添加上下文"
                        aria-haspopup="menu"
                        aria-expanded={open}
                        onClick={toggle}
                      >
                        {/* lucide:plus */}
                        <Icon>
                          <path d="M5 12h14m-7-7v14" />
                        </Icon>
                      </button>
                    </Tooltip>
                  )}
                />
                {/* Access presets: harness sandbox trio. Switching maps to
                    the `/permission {id}` command + a risk confirm for
                    danger-full-access once the transport lands. */}
                <Dropdown
                  headSlot="selected"
                  options={ACCESS_MODES}
                  value={accessMode}
                  onChange={setAccessMode}
                  searchable={false}
                  placement="top-left"
                  className="dd-access"
                  fitContent
                  cycleShortcut="Mod+Shift+M"
                  renderTrigger={({ open, toggle, selected, shortcut }) => (
                    <Tooltip label="切换访问权限" shortcut={shortcut} placement="top-left">
                      <button
                        type="button"
                        className="access-chip"
                        aria-haspopup="listbox"
                        aria-expanded={open}
                        onClick={toggle}
                      >
                      {/* Face rolls up on every selection change — the
                          generic Dropdown behavior, keyed by the value. */}
                      <span className="ui-dd-face" key={selected?.id ?? 'none'}>
                        {selected?.icon !== undefined ? (
                          <span className="ui-dd-optico">{selected.icon}</span>
                        ) : null}
                        <span className="ui-dd-label">
                          {selected?.label ?? '访问模式'}
                        </span>
                      </span>
                      <Icon className="chip-chev">
                        <path d="m6 9l6 6l6-6" />
                      </Icon>
                      </button>
                    </Tooltip>
                  )}
                />
              </div>
              <div className="composer-right">
                <Dropdown
                  headSlot="selected"
                  options={MODELS}
                  value={model}
                  onChange={setModel}
                  searchable={false}
                  placement="top-right"
                  fitContent
                  cycleShortcut="Mod+M"
                  renderTrigger={({ open, toggle, selected, shortcut }) => (
                    <Tooltip label="选择模型" shortcut={shortcut} placement="top-left">
                      <button
                        type="button"
                        className="model-chip"
                        aria-haspopup="listbox"
                        aria-expanded={open}
                        onClick={toggle}
                      >
                        <span className="ui-dd-face" key={selected?.id ?? 'none'}>
                          <span className="ui-dd-label">{selected?.label ?? '选择模型'}</span>
                        </span>
                        <Icon className="chip-chev">
                          <path d="m6 9l6 6l6-6" />
                        </Icon>
                      </button>
                    </Tooltip>
                  )}
                />
                <Dropdown
                  headSlot="selected"
                  options={EFFORTS}
                  value={effort}
                  onChange={setEffort}
                  searchable={false}
                  placement="top-right"
                  fitContent
                  cycleShortcut="Mod+T"
                  renderTrigger={({ open, toggle, selected, shortcut }) => (
                    <Tooltip label="思考等级" shortcut={shortcut} placement="top-left">
                      <button
                        type="button"
                        className="model-chip"
                        aria-haspopup="listbox"
                        aria-expanded={open}
                        onClick={toggle}
                      >
                        {selected?.icon !== undefined ? (
                          <span className="ui-dd-optico">{selected.icon}</span>
                        ) : null}
                        <span className="ui-dd-face" key={selected?.id ?? 'none'}>
                          <span className="ui-dd-label">{selected?.label ?? '思考等级'}</span>
                        </span>
                        <Icon className="chip-chev">
                          <path d="m6 9l6 6l6-6" />
                        </Icon>
                      </button>
                    </Tooltip>
                  )}
                />
                <MetaButton
                  label="发送"
                  tip="发送"
                  tipPlacement="top-left"
                  className="send-btn"
                  onClick={() => {
                    // A real send means a conversation has started; the
                    // harness pins the agent preset at session creation, so
                    // the mode selector locks from this moment (placeholder
                    // for the transport-level session event).
                    setConversationStarted(true)
                  }}
                >
                  {/* lucide:arrow-up */}
                  <Icon>
                    <path d="m5 12l7-7 7 7m-7 7V5" />
                  </Icon>
                </MetaButton>
              </div>
            </div>
            </div>
          </div>
          </div>
        </main>
        </div>
      </div>

      {/* Row-action dialogs: rename (workspace/session, duplicate-checked)
          and the delete-workspace confirm. */}
      <Dialog
        open={renameTarget !== null}
        onClose={() => setRenameTarget(null)}
        label={renameTarget?.kind === 'workspace' ? '重命名工作区' : '重命名会话'}
      >
        <div className="dlg">
          <h2 className="dlg-title">
            {renameTarget?.kind === 'workspace' ? '重命名工作区' : '重命名会话'}
          </h2>
          <input
            className="dlg-input"
            value={renameDraft}
            autoFocus
            aria-label={renameTarget?.kind === 'workspace' ? '工作区名称' : '会话名称'}
            onChange={(event) => {
              setRenameDraft(event.target.value)
              setRenameError(null)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) submitRename()
            }}
          />
          {renameError !== null && <p className="dlg-error">{renameError}</p>}
          <div className="dlg-actions">
            <button type="button" className="dlg-btn" onClick={() => setRenameTarget(null)}>
              取消
            </button>
            <button type="button" className="dlg-btn dlg-btn--primary" onClick={submitRename}>
              重命名
            </button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        label="删除工作区"
      >
        <div className="dlg">
          <h2 className="dlg-title">删除工作区</h2>
          <p className="dlg-text">
            将把“{deleteTarget?.title ?? ''}”从工作区列表中移除。文件夹与会话记录会保留。
          </p>
          <div className="dlg-actions">
            <button type="button" className="dlg-btn" onClick={() => setDeleteTarget(null)}>
              取消
            </button>
            <button
              type="button"
              className="dlg-btn dlg-btn--danger"
              onClick={confirmDeleteWorkspace}
            >
              删除工作区
            </button>
          </div>
        </div>
      </Dialog>
    </section>
  )
}
