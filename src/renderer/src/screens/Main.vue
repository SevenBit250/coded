<script setup lang="ts">
import { computed, h, nextTick, onMounted, onUnmounted, ref, watch, watchEffect } from 'vue'
import {
  Dialog,
  Dropdown,
  Icon,
  IconButton,
  Menu,
  MenuDivider,
  MenuItem,
  MenuLabel,
  MetaButton,
  ScrollArea,
  Split,
  Tooltip,
  WindowControls,
  useShortcut,
} from '@uibase'
import type { DropdownAction, DropdownOption } from '@uibase'
import { useDirectoryStore } from '../bridge/directory-store'
import { useSessionStore } from '../bridge/session-store'
import ChatStream from '../chat/ChatStream/ChatStream.vue'
import QuestionCard from '../chat/QuestionCard/QuestionCard.vue'
import ApprovalCard from '../chat/ApprovalCard/ApprovalCard.vue'
import SettingsNav from './SettingsNav.vue'
import type { SettingsCategory } from './SettingsNav.vue'
import SettingsPane from './SettingsPane.vue'
import SessionRow from './SessionRow.vue'
import WorkspaceRow from './WorkspaceRow.vue'
import { bridge } from '../bridge/client'
import { loadSidebarView, saveSidebarView } from '../sidebar-view'
import type { SidebarViewState } from '../sidebar-view'
import { loadLastWorkspace, saveLastWorkspace } from '../last-workspace'
import type { LastWorkspace } from '../last-workspace'
import type { ThemeChoice } from '../theme'
import type { CodedAccessMode, CodedAgentPreset, CodedModelsSnapshot } from '@coded/bridge-protocol'

/** Main screen props. */
const props = defineProps<{
  /** Whether the shell has swapped to this screen. While false the workspace
   *  sits pre-mounted at opacity 0 under the startup glass; the flip happens
   *  in the same commit that unmounts Startup — one paint, no gap. */
  visible: boolean
  /** The user's theme choice ('system' tracks the OS; App owns the state). */
  themeChoice: ThemeChoice
}>()

const emit = defineEmits<{
  'update:themeChoice': [choice: ThemeChoice]
}>()

const platform = window.coded.platform
function winMinimize(): void {
  window.coded.minimize()
}
function winMaximize(): void {
  window.coded.maximize()
}
function winClose(): void {
  window.coded.close()
}

/** Sidebar menu icon names (line icons matching the reference). */
type MenuIconName = 'new-task' | 'search' | 'connector' | 'market'

interface MenuItemDef {
  icon: MenuIconName
  label: string
  shortcut?: string
}

const MENU: readonly MenuItemDef[] = [
  { icon: 'new-task', label: '新建任务', shortcut: 'Ctrl+N' },
  { icon: 'search', label: '搜索', shortcut: 'Ctrl+K' },
  { icon: 'connector', label: '连接器' },
  { icon: 'market', label: '插件市场' },
]

/** Sidebar geometry (px). */
const SIDEBAR_DEFAULT = 240
const SIDEBAR_MIN = 240
const SIDEBAR_MAX = 480
const SIDEBAR_GAP = 3

/** Sidebar top row: sidebar expand/collapse toggle and back/forward arrows;
 *  the new-chat button only appears in the collapsed bar (reference). */
const sidebarCollapsed = computed(() => !sidebarOpen.value)

interface SessionStub {
  id: string
  title: string
  updatedMinutesAgo: number
  status: 'idle' | 'running' | 'interrupted'
  pending?: boolean
  agentPreset?: string
}

interface WorkspaceStub {
  id: string
  title: string
  path: string
  sessions: SessionStub[]
}

const PROJECT_ACTIONS: readonly DropdownAction[] = [
  { id: 'open-folder', label: '打开文件夹' },
  { id: 'remote-connect', label: '远程连接' },
]

/**
 * Reasoning-effort display names for known adapter effort ids; unknown ids
 * fall back to the adapter-supplied name.
 */
const EFFORT_LABELS: Record<string, string> = { low: '低', medium: '中', high: '高', max: '最高' }

type VNodeFactory = () => ReturnType<typeof h>

/** Icon thunk helper: fresh Lucide VNodes per render (vnodes are not
 *  reused across renders — a factory keeps every mount clean). */
function lucide(children: VNodeFactory[], strokeWidth = 2): VNodeFactory {
  return () => h(Icon, { strokeWidth }, { default: () => children.map((c) => c()) })
}
function path(d: string): VNodeFactory {
  return () => h('path', { d })
}
function circle(cx: string, cy: string, r: string): VNodeFactory {
  return () => h('circle', { cx, cy, r })
}
function rect(x: string, y: string, width: string, height: string, rx?: string): VNodeFactory {
  return () => h('rect', { x, y, width, height, ...(rx !== undefined ? { rx } : {}) })
}

/**
 * Access-mode display copy for the known permission preset ids. The id list
 * itself comes from the backend — unknown ids fall back to its name.
 */
const ACCESS_MODE_DISPLAY: Record<string, { label: string; description: string; icon: VNodeFactory }> = {
  'read-only': {
    label: '变更前确认',
    description: '改文件前先问我。',
    // lucide:hand
    icon: lucide([
      path('M18 11V6a2 2 0 0 0-4 0v5'),
      path('M14 10V4a2 2 0 0 0-4 0v2'),
      path('M10 10.5V6a2 2 0 0 0-4 0v8'),
      path('M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15'),
    ]),
  },
  'workspace-write': {
    label: '自动编辑',
    description: '自动编辑工作区内文件。',
    // lucide:shield-check
    icon: lucide([
      path('M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z'),
      path('m9 12 2 2 4-4'),
    ]),
  },
  'danger-full-access': {
    label: '完全访问',
    description: '减少确认次数。',
    // lucide:lock-open (rect + arc path — official shape set)
    icon: lucide([
      rect('3', '11', '18', '11', '2'),
      path('M7 11V7a5 5 0 0 1 9.9-1'),
    ]),
  },
}

/** Context actions behind the composer's ＋ button (image ref). */
const CONTEXT_ACTIONS: readonly DropdownAction[] = [
  {
    id: 'attach',
    label: '添加附件',
    // lucide:paperclip
    icon: lucide([
      path('m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48'),
    ]),
  },
  {
    id: 'at-context',
    label: '使用 @ 添加上下文',
    // lucide:at-sign
    icon: lucide([
      circle('12', '12', '4'),
      path('M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8'),
    ]),
  },
  {
    id: 'slash-commands',
    label: '使用 / 选择命令或能力',
    // lucide:square-check
    icon: lucide([
      rect('3', '3', '18', '18', '2'),
      path('m9 12 2 2 4-5'),
    ]),
  },
]

/** Placeholder action sink until backend wiring lands. */
function voidId(id: string): void {
  void id
}

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

type SessionAction = 'rename' | 'fork' | 'archive'
type WorkspaceAction = 'rename' | 'delete'

// The sidebar/content pairing has two surfaces: the workspace (chat) and
// the settings panel.
const surface = ref<'chat' | 'settings'>('chat')
const settingsCategory = ref<SettingsCategory>('appearance')
const sidebarOpen = ref(true)
const sidebarWidth = ref(SIDEBAR_DEFAULT)
const resizing = ref(false)
const selectedProject = ref<string | null>(null)
// Sidebar view state (grouping/ordering/collapse) persists as one blob.
const view = ref<SidebarViewState>(loadSidebarView())
function patchView(patch: Partial<SidebarViewState>): void {
  view.value = { ...view.value, ...patch }
  saveSidebarView(view.value)
}
function toggleWorkspace(id: string): void {
  patchView({
    collapsed: view.value.collapsed.includes(id)
      ? view.value.collapsed.filter((x) => x !== id)
      : [...view.value.collapsed, id],
  })
}
// The open session (a real harness session id; null = fresh draft).
const selectedSession = ref<string | null>(null)
// Composer choices staged before a session exists, applied when one is
// created.
const pendingRef = ref<{
  modeId?: string
  provider?: string
  model?: string
  reasoningEffort?: string
  presetId?: string
} | null>(null)
/** The agent preset shown in the composer selector. */
const modeValue = ref<string | null>(null)
/** Composer input focus target (the + affordance lands the user here). */
const composerRef = ref<HTMLTextAreaElement | null>(null)
/** In-session the composer floats over the transcript; its measured height
 *  is published as --composer-h so the scroller reserves room for it. */
const composerAnchorRef = ref<HTMLDivElement | null>(null)
// Rename dialog: which row is being renamed, its draft and any error.
const renameTarget = ref<
  { kind: 'workspace'; id: string } | { kind: 'session'; wsId: string; id: string } | null
>(null)
const renameDraft = ref('')
const renameError = ref<string | null>(null)
// Delete-workspace confirm dialog.
const deleteTarget = ref<WorkspaceStub | null>(null)

// Real roster over the CodedBridge; the active chat session follows the
// sidebar selection.
const directory = useDirectoryStore()
const session = useSessionStore()

/** The first send of a fresh draft created this session — select it. */
function handleSessionCreated(id: string): void {
  directory.pinSession(id, selectedProject.value)
  selectedSession.value = id
  applyPending(id)
}

// Draft context (workspace root for lazy creates) follows the picker.
watchEffect(() => {
  session.configure({ workspaceId: selectedProject.value, onSessionCreated: handleSessionCreated })
})

// The active chat session follows the sidebar selection (history rebuild
// lives in the store).
watch(selectedSession, (id) => session.select(id))

/** Sessions with an answerable frame waiting (approval/question). */
const pendingBySession = computed(() => {
  const set = new Set<string>()
  for (const p of session.pendingApprovals) set.add(p.sessionId)
  for (const q of session.pendingQuestions) set.add(q.sessionId)
  return set
})

/** Question gates of the ACTIVE session — they replace the composer. */
const activeQuestions = computed(() =>
  session.pendingQuestions.filter((p) => p.sessionId === selectedSession.value),
)

/** Approval gates of the ACTIVE session — same interaction slot: the
    permission card replaces the composer (reference behavior). */
const activeApprovals = computed(() =>
  session.pendingApprovals.filter((p) => p.sessionId === selectedSession.value),
)

/** Cumulative working time of the selected session, from the host's
    sessionStats projection (llmMs + toolMs; survives restarts). */
const cumulativeLabel = computed<string | null>(() => {
  const sid = selectedSession.value
  const s = sid === null ? undefined : session.statsBySession[sid]
  if (s === undefined || s.turns === 0) return null
  const totalSec = Math.round((s.llmMs + s.toolMs) / 1000)
  if (totalSec <= 0) return null
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const sec = totalSec % 60
  if (h > 0) return `${h} 小时 ${m} 分`
  if (m > 0) return `${m} 分 ${sec} 秒`
  return `${sec} 秒`
})

/** Directory → sidebar row shape (recency bucket computed per recompute). */
const workspaces = computed<WorkspaceStub[]>(() =>
  directory.workspaces.map((w) => ({
    id: w.id,
    title: w.title,
    path: w.path,
    sessions: w.sessions.map((s) => ({
      id: s.id,
      title: s.title,
      updatedMinutesAgo: Math.max(0, (Date.now() - s.updatedAt) / 60000),
      status: s.running ? ('running' as const) : s.errored ? ('interrupted' as const) : ('idle' as const),
      pending: pendingBySession.value.has(s.id),
      ...(s.agentPreset !== undefined ? { agentPreset: s.agentPreset } : {}),
    })),
  })),
)

/** Whether the ACTIVE session's agent is mid-turn (drives the stop button). */
const activeRunning = computed(() =>
  directory.workspaces.some((w) => w.sessions.some((s) => s.id === selectedSession.value && s.running)),
)

// Publish the composer's measured height as a CSS var on the content
// column: the in-session composer floats over the transcript, and the
// scroller's bottom padding + jump button offset track it as it grows.
let composerRO: ResizeObserver | null = null
onMounted(() => {
  const anchor = composerAnchorRef.value
  if (anchor === null) return
  const publish = (): void => {
    anchor.parentElement?.style.setProperty('--composer-h', `${anchor.offsetHeight}px`)
  }
  publish()
  composerRO = new ResizeObserver(publish)
  composerRO.observe(anchor)
})
onUnmounted(() => composerRO?.disconnect())

// Turn clock: wall-clock seconds since the running flag went up; ticks
// once a second while the turn runs. When it ends, the span is captured
// for the turn group's "已工作 N 秒" fold header.
const turnStartedAt = ref<number | null>(null)
const lastTurnMs = ref<number | null>(null)
const nowTick = ref(Date.now())
let turnTimer: number | null = null

watch(activeRunning, (running) => {
  if (running) {
    turnStartedAt.value = turnStartedAt.value ?? Date.now()
    if (turnTimer === null) {
      turnTimer = window.setInterval(() => (nowTick.value = Date.now()), 1000)
    }
    return
  }
  if (turnStartedAt.value !== null) lastTurnMs.value = Date.now() - turnStartedAt.value
  turnStartedAt.value = null
  if (turnTimer !== null) {
    clearInterval(turnTimer)
    turnTimer = null
  }
})
watch(selectedSession, () => (lastTurnMs.value = null))
const turnSeconds = computed(() =>
  turnStartedAt.value === null ? 0 : Math.max(0, Math.floor((nowTick.value - turnStartedAt.value) / 1000)),
)

// Anchor-bar chips (in-session): the session's workspace.
const selectedInfo = computed(() => {
  for (const w of directory.workspaces) {
    const s = w.sessions.find((x) => x.id === selectedSession.value)
    if (s !== undefined) return { title: s.title, workspace: w.title }
  }
  return null
})

// The selected session must stay on the roster: archiving it (or removing
// its whole workspace) drops it from the sidebar, and the selection has to
// follow — otherwise the chat area keeps rendering a ghost transcript.
watch([workspaces, selectedSession], () => {
  if (selectedSession.value === null) return
  const present = directory.workspaces.some((w) =>
    w.sessions.some((s) => s.id === selectedSession.value),
  )
  if (!present) {
    selectedSession.value = null
    modeValue.value = pendingRef.value?.presetId ?? null
  }
})

// The baseline row's preset is header-derived, so a session that switched
// preset while blank echoes a stale value until corrected. The session's
// own history read carries the log-resolved truth.
watch(
  () => session.agentPreset,
  () => {
    if (selectedSession.value === null) return
    if (session.agentPreset !== undefined) modeValue.value = session.agentPreset
  },
)

// Default the composer project to the last-exit workspace once the roster
// lands (id match, else path anchor, else first).
const projectDefaulted = ref(false)
let lastWorkspace: LastWorkspace | null = loadLastWorkspace()
watch([projectDefaulted, workspaces], () => {
  if (projectDefaulted.value || directory.workspaces.length === 0) return
  projectDefaulted.value = true
  const stored = lastWorkspace
  if (stored === null) {
    selectedProject.value = directory.workspaces[0]?.id ?? null
    return
  }
  if (stored.id === null) {
    selectedProject.value = null
    return
  }
  const byId = directory.workspaces.find((w) => w.id === stored.id)
  if (byId !== undefined) {
    selectedProject.value = byId.id
    return
  }
  // Roster ids may not survive a backend restart — the path is the anchor.
  const byPath =
    stored.path !== null ? directory.workspaces.find((w) => w.path === stored.path) : undefined
  selectedProject.value = byPath?.id ?? directory.workspaces[0]?.id ?? null
})
// Persist every post-default choice (the explicit null included).
watch([projectDefaulted, selectedProject, workspaces], () => {
  if (!projectDefaulted.value) return
  const path = workspaces.value.find((w) => w.id === selectedProject.value)?.path ?? null
  saveLastWorkspace({ id: selectedProject.value, path })
})

/** Open the rename dialog pre-filled for a workspace or session row. */
function openRename(
  target: NonNullable<typeof renameTarget.value>,
  initial: string,
): void {
  renameTarget.value = target
  renameDraft.value = initial
  renameError.value = null
}

function submitRename(): void {
  const target = renameTarget.value
  if (target === null) return
  const title = renameDraft.value.trim()
  if (title === '') return
  if (target.kind === 'workspace') {
    // Harness parity: duplicate workspace names are refused.
    if (workspaces.value.some((w) => w.title === title && w.id !== target.id)) {
      renameError.value = `已存在名为"${title}"的工作区。`
      return
    }
    void bridge.renameWorkspace(target.id, title).then(directory.refresh)
  } else {
    void bridge.renameSession(target.id, title).then(directory.refresh)
  }
  renameTarget.value = null
}

function confirmDeleteWorkspace(): void {
  const doomed = deleteTarget.value
  if (doomed === null) return
  void bridge.deleteWorkspace(doomed.id).then(directory.refresh)
  if (doomed.sessions.some((s) => s.id === selectedSession.value)) {
    selectedSession.value = null
    modeValue.value = pendingRef.value?.presetId ?? null
  }
  if (selectedProject.value === doomed.id) selectedProject.value = null
  deleteTarget.value = null
}

/** Select a session and echo its pinned preset into the mode selector. */
function openSession(id: string, preset: string | null | undefined): void {
  selectedSession.value = id
  modeValue.value = preset ?? null
}

/** Fork: the host answers with the new session's id; select it. */
function forkSession(source: SessionStub): void {
  void bridge.forkSession(source.id).then((forkedId) => {
    directory.refresh()
    if (forkedId !== null) openSession(forkedId, source.agentPreset ?? null)
  })
}

/** Archive: non-destructive; the host frame hides the row. */
function archiveSession(sessionId: string): void {
  void bridge.archiveSession(sessionId).then(directory.refresh)
  if (selectedSession.value === sessionId) {
    selectedSession.value = null
    modeValue.value = pendingRef.value?.presetId ?? null
  }
}

/** Leave any active session and land in a fresh composer draft — the shared
 *  landing of every "new" affordance. Nothing is created until send. */
function startDraft(): void {
  selectedSession.value = null
  modeValue.value = pendingRef.value?.presetId ?? null
  composerRef.value?.focus()
}
useShortcut('Mod+N', startDraft)

/** New session in a workspace: switch to a draft rooted there. */
function addSession(wsId: string): void {
  selectedProject.value = wsId
  startDraft()
}

/** Route a session row-menu action (shared by grouped and flat views). */
function dispatchSessionAction(
  action: SessionAction,
  wsId: string,
  sessionRow: SessionStub,
): void {
  void wsId // workspace context is implicit in the session id
  if (action === 'rename') {
    openRename({ kind: 'session', wsId, id: sessionRow.id }, sessionRow.title)
  } else if (action === 'fork') {
    forkSession(sessionRow)
  } else {
    archiveSession(sessionRow.id)
  }
}

// View derivation: 'updated' orders sessions by recency (workspace groups
// follow their most recent session); 'manual' keeps declared order.
function orderedSessions(sessions: SessionStub[]): SessionStub[] {
  return view.value.orderBy === 'updated' ? [...sessions].sort(byRecency) : sessions
}
const orderedWorkspaces = computed<WorkspaceStub[]>(() =>
  view.value.groupBy === 'workspace' && view.value.orderBy === 'updated'
    ? [...workspaces.value].sort(
        (a, b) =>
          Math.min(...a.sessions.map((s) => s.updatedMinutesAgo), Infinity) -
          Math.min(...b.sessions.map((s) => s.updatedMinutesAgo), Infinity),
      )
    : workspaces.value,
)
const flatSessions = computed<{ ws: WorkspaceStub; session: SessionStub }[] | null>(() => {
  if (view.value.groupBy !== 'flat') return null
  const entries = workspaces.value.flatMap((w) => w.sessions.map((s) => ({ ws: w, session: s })))
  return view.value.orderBy === 'updated'
    ? entries.sort((a, b) => byRecency(a.session, b.session))
    : entries
})

// Composer's workspace picker follows the live list.
const projectOptions = computed<DropdownOption[]>(() =>
  workspaces.value.map((w) => ({ id: w.id, label: w.title })),
)
// Harness parity: the agent preset is pinned when the session starts, so
// the mode selector locks once the conversation has any message.
const conversationStarted = computed(() => session.messages.length > 0)

// Preset roster behind a capability gate.
const caps = ref<string[]>([])
const presets = ref<CodedAgentPreset[] | null>(null)
let presetsFetched = false

function fetchPresets(): void {
  if (presetsFetched) return
  presetsFetched = true
  void (async () => {
    try {
      caps.value = await bridge.capabilities()
      if (!caps.value.includes('presets')) return
      presets.value = await bridge.listPresets()
    } catch (error: unknown) {
      presetsFetched = false
      console.log(`[composer] presets load failed: ${String(error)}`)
    }
  })()
}

void bridge.status().then((s) => {
  if (s === 'bridge-connected') fetchPresets()
})
const offPresetsStatus = bridge.onStatus((s) => {
  if (s === 'bridge-connected') fetchPresets()
})
onUnmounted(offPresetsStatus)

const presetsSupported = computed(
  () => caps.value.includes('presets') && presets.value !== null && presets.value.length > 0,
)
// Anchor-bar chip: the session's pinned preset, displayed by roster name.
const sessionMode = computed(() => {
  if (modeValue.value === null) return undefined
  return presets.value?.find((p) => p.id === modeValue.value)?.name ?? modeValue.value
})
// Draft preselect: the deployment default preset is what a new session will
// actually run, so the selector shows it instead of an empty placeholder.
watch([presets, selectedSession, modeValue], () => {
  if (selectedSession.value !== null) return
  if (modeValue.value !== null) return
  const fallback = presets.value?.find((p) => p.isDefault === true) ?? presets.value?.[0]
  if (fallback !== undefined) modeValue.value = fallback.id
})

// CodedBridge session: transcript + composer draft.
const draft = ref('')
function submitDraft(): void {
  const text = draft.value
  if (text.trim() === '' || session.busy) return
  draft.value = ''
  session.send(text)
}

// Access mode / model / effort — choices made before a session exists are
// kept as pending and applied the moment a session is created.
const accessMode = ref<string | null>('workspace-write')
const accessConfirm = ref<string | null>(null)
const models = ref<CodedModelsSnapshot | null>(null)

// Session-scoped snapshot for an active session; the deployment picture for
// the home draft. Pulled when the bridge (re)connects.
let modelsStale = false
function loadModels(): void {
  void bridge
    .listModels(selectedSession.value ?? undefined)
    .then((snapshot) => {
      if (!modelsStale) models.value = snapshot
    })
    .catch((error: unknown) => {
      console.log(`[composer] models load failed: ${String(error)}`)
    })
}
void bridge.status().then((s) => {
  if (s === 'bridge-connected' && !modelsStale) loadModels()
})
const offModelsStatus = bridge.onStatus((s) => {
  if (s === 'bridge-connected' && !modelsStale) loadModels()
})
onUnmounted(() => {
  modelsStale = true
  offModelsStatus()
})
watch(selectedSession, () => loadModels())

// Permission preset roster: a deployment fact, fetched once the bridge is up.
const accessModes = ref<CodedAccessMode[]>([])
let modesFetched = false
function fetchModes(): void {
  if (modesFetched) return
  modesFetched = true
  void bridge
    .permissionModes()
    .then((p) => {
      accessModes.value = p.modes
    })
    .catch((error: unknown) => {
      modesFetched = false
      console.log(`[composer] permission modes load failed: ${String(error)}`)
    })
}
void bridge.status().then((s) => {
  if (s === 'bridge-connected') fetchModes()
})
const offModesStatus = bridge.onStatus((s) => {
  if (s === 'bridge-connected') fetchModes()
})
onUnmounted(offModesStatus)

/** Apply pre-session choices to a freshly created session (fire-and-forget
 *  invokes, dispatched before the first prompt through the ordered pipe). */
function applyPending(sessionId: string): void {
  const pending = pendingRef.value
  if (pending === null) return
  pendingRef.value = null
  if (pending.presetId !== undefined) {
    void bridge
      .selectPreset(sessionId, pending.presetId)
      // Re-baseline so the roster row carries the applied preset.
      .then(() => directory.refresh())
      .catch((error: unknown) => {
        console.log(`[composer] pending preset select failed: ${String(error)}`)
      })
  }
  if (pending.modeId !== undefined) {
    void bridge.setPermissionMode(sessionId, pending.modeId).catch((error: unknown) => {
      console.log(`[composer] pending permission set failed: ${String(error)}`)
    })
  }
  if (pending.provider !== undefined && pending.model !== undefined) {
    void bridge
      .selectModel(sessionId, pending.provider, pending.model, pending.reasoningEffort)
      .catch((error: unknown) => {
        console.log(`[composer] pending model select failed: ${String(error)}`)
      })
  }
}

function modelKey(provider: string, model: string): string {
  return `${provider}::${model}`
}
function parseModelKey(key: string): { provider: string; model: string } {
  const [provider, model] = key.split('::')
  return { provider: provider ?? '', model: model ?? '' }
}
const selectedRoute = computed(() =>
  models.value?.routes.find(
    (r) => r.provider === models.value?.current.provider && r.model === models.value?.current.model,
  ),
)

function applyModelSelection(selection: {
  provider: string
  model: string
  reasoningEffort?: string
}): void {
  if (selectedSession.value === null) {
    // Pre-session choice: remember it (applied when the session is created)
    // and reflect it locally — the chip must follow the pick. Model keys
    // replace wholesale so switching models pre-session cannot keep the
    // previous model's effort unless carried explicitly.
    pendingRef.value = {
      modeId: pendingRef.value?.modeId,
      provider: selection.provider,
      model: selection.model,
      reasoningEffort: selection.reasoningEffort,
    }
    if (models.value !== null) {
      models.value = {
        ...models.value,
        current: {
          provider: selection.provider,
          model: selection.model,
          ...(selection.reasoningEffort !== undefined
            ? { reasoningEffort: selection.reasoningEffort }
            : {}),
        },
      }
    }
    return
  }
  void bridge
    .selectModel(selectedSession.value, selection.provider, selection.model, selection.reasoningEffort)
    .then(() => bridge.listModels(selectedSession.value ?? undefined))
    .then((snapshot) => (models.value = snapshot))
    .catch((error: unknown) => {
      console.log(`[composer] model select failed: ${String(error)}`)
    })
}

function onModelChange(key: string | null): void {
  if (key === null) return
  const { provider, model } = parseModelKey(key)
  // The effort rides across model switches: the current effort carries to
  // the target route whenever that route offers the same id.
  const current = models.value?.current.reasoningEffort
  const route = models.value?.routes.find((r) => r.provider === provider && r.model === model)
  const carried =
    current !== undefined &&
    current !== '' &&
    route?.efforts !== undefined &&
    route.efforts.some((e) => e.id === current)
      ? current
      : undefined
  applyModelSelection({
    provider,
    model,
    ...(carried !== undefined ? { reasoningEffort: carried } : {}),
  })
}

function onEffortChange(effortId: string | null): void {
  if (models.value === null || effortId === null) return
  applyModelSelection({
    provider: models.value.current.provider,
    model: models.value.current.model,
    ...(effortId === '' ? {} : { reasoningEffort: effortId }),
  })
}

function submitAccessMode(modeId: string): void {
  accessMode.value = modeId
  accessConfirm.value = null
  if (selectedSession.value === null) {
    // Pre-session choice: remember it; applied when the session is created.
    pendingRef.value = { ...pendingRef.value, modeId }
    return
  }
  void bridge.setPermissionMode(selectedSession.value, modeId).catch((error: unknown) => {
    console.log(`[composer] permission set failed: ${String(error)}`)
  })
}

/** Composer preset pick: staging on the draft, a live blank-session switch
 *  once a session is open. A started session's refusal reverts the pick. */
function onPresetPick(presetId: string | null): void {
  if (presetId === null) return
  const previous = modeValue.value
  modeValue.value = presetId
  if (selectedSession.value === null) {
    pendingRef.value = { ...pendingRef.value, presetId }
    return
  }
  void bridge
    .selectPreset(selectedSession.value, presetId)
    .then(() => directory.refresh())
    .catch((error: unknown) => {
      console.log(`[composer] preset select refused: ${String(error)}`)
      modeValue.value = previous
    })
}

/** Preset roster → dropdown options. */
const modeOptions = computed<DropdownOption[]>(() =>
  (presets.value ?? []).map((p) => ({
    id: p.id,
    label: p.name,
    ...(p.description !== undefined ? { description: p.description } : {}),
  })),
)

/** Semantic roster → dropdown options. */
const modelOptions = computed<DropdownOption[]>(() => {
  if (models.value === null) return []
  const options: DropdownOption[] = models.value.routes.map((r) => ({
    id: modelKey(r.provider, r.model),
    label: r.modelName,
    ...(r.description !== undefined ? { description: r.description } : {}),
  }))
  // Advisory catalog: the current route may be absent — keep it visible.
  const currentKey = modelKey(models.value.current.provider, models.value.current.model)
  if (models.value.current.model !== '' && !options.some((o) => o.id === currentKey)) {
    options.push({ id: currentKey, label: models.value.current.model })
  }
  return options
})
const currentModelKey = computed(() =>
  models.value !== null ? modelKey(models.value.current.provider, models.value.current.model) : null,
)

const effortOptions = computed<DropdownOption[]>(() => {
  const efforts = selectedRoute.value?.efforts
  if (efforts === undefined) return []
  const options: DropdownOption[] = efforts.map((e) => ({
    id: e.id,
    label: EFFORT_LABELS[e.id] ?? e.name,
    ...(e.description !== undefined ? { description: e.description } : {}),
  }))
  // The unset option preserves the adapter/provider default effort.
  options.unshift({ id: '', label: '默认' })
  return options
})
const currentEffort = computed(() => models.value?.current.reasoningEffort ?? '')

const accessModeOptions = computed<DropdownOption[]>(() =>
  accessModes.value.map((m) => ({
    id: m.id,
    label: ACCESS_MODE_DISPLAY[m.id]?.label ?? m.name,
    description: ACCESS_MODE_DISPLAY[m.id]?.description ?? m.description,
    icon: ACCESS_MODE_DISPLAY[m.id]?.icon,
  })),
)

function onAccessModeChange(modeId: string | null): void {
  if (modeId === null) return
  // Risk gate: full access needs an explicit confirm.
  if (modeId === 'danger-full-access' && modeId !== accessMode.value) {
    accessConfirm.value = modeId
    return
  }
  submitAccessMode(modeId)
}

// The in-session composer is inside the DOM only when surface==='chat';
// re-publish the height var when it mounts.
watch(surface, () => {
  void nextTick(() => {
    const anchor = composerAnchorRef.value
    if (anchor !== null) {
      anchor.parentElement?.style.setProperty('--composer-h', `${anchor.offsetHeight}px`)
    }
  })
})
</script>

<template>
  <section
    :class="`screen main${visible ? '' : ' main-premount'}${resizing ? ' resizing' : ''}`"
    aria-label="主界面"
  >
    <!-- The anchor strip is transparent and owns the window drag region
        (full top width). Left group: sidebar toggle/arrows/chat.
        Right group: window controls only (on Windows those are the
        system caption buttons). No app title in either state. -->
    <div class="anchor-bar">
      <div class="anchor-left">
        <IconButton
          className="sidebar-toggle"
          label="切换侧边栏"
          shortcut="Mod+B"
          @click="sidebarOpen = !sidebarOpen"
        >
          <Icon>
            <rect width="18" height="18" x="3" y="3" rx="2" />
            <path :d="sidebarCollapsed ? 'M9 3v18m5-12 3 3-3 3' : 'M9 3v18m7-6-3-3 3-3'" />
          </Icon>
        </IconButton>
        <span class="nav-arrows">
          <IconButton className="nav-arrow" label="后退">
            <Icon><path d="m15 18-6-6 6-6" /></Icon>
          </IconButton>
          <IconButton className="nav-arrow" label="前进">
            <Icon><path d="m9 18 6-6-6-6" /></Icon>
          </IconButton>
        </span>
        <IconButton v-if="sidebarCollapsed" className="chat-new" label="新建对话" @click="startDraft">
          <Icon>
            <path d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719M8 12h8m-4-4v8" />
          </Icon>
        </IconButton>
      </div>
      <div class="anchor-right">
        <!-- Windows draws its own caption buttons via titleBarOverlay;
            other platforms get the uibase chrome with IPC wired here. -->
        <WindowControls
          v-if="platform !== 'win32'"
          @minimize="winMinimize"
          @maximize="winMaximize"
          @close="winClose"
        />
      </div>
    </div>
    <div :class="`main-body${sidebarOpen ? '' : ' collapsed'}`">
      <nav class="sidebar" :style="{ width: `${sidebarWidth}px` }">
        <SettingsNav
          v-if="surface === 'settings'"
          :category="settingsCategory"
          @select="(c) => (settingsCategory = c)"
          @back="surface = 'chat'"
        />
        <template v-else>
          <div class="menu">
            <button
              v-for="item in MENU"
              :key="item.label"
              class="menu-item"
              @click="item.icon === 'new-task' ? startDraft() : undefined"
            >
              <span class="menu-ico">
                <Icon viewBox="0 0 16 16" :stroke-width="1.25">
                  <g v-if="item.icon === 'new-task'">
                    <rect x="2.5" y="2.5" width="11" height="11" rx="2.5" />
                    <path d="M8 5.4v5.2M5.4 8h5.2" />
                  </g>
                  <g v-else-if="item.icon === 'search'">
                    <circle cx="7" cy="7" r="4" />
                    <path d="M10 10l3 3" />
                  </g>
                  <g v-else-if="item.icon === 'connector'">
                    <path d="M12 4.5v4a3 3 0 0 1-6 0v-4" />
                    <path d="M9 2v3M7 2v3M6 10v4" />
                  </g>
                  <g v-else>
                    <rect x="2.5" y="2.5" width="5" height="5" rx="1" />
                    <rect x="8.5" y="2.5" width="5" height="5" rx="1" />
                    <rect x="2.5" y="8.5" width="5" height="5" rx="1" />
                    <rect x="8.5" y="8.5" width="5" height="5" rx="1" />
                  </g>
                </Icon>
              </span>
              <span>{{ item.label }}</span>
              <span v-if="item.shortcut !== undefined" class="shortcut">{{ item.shortcut }}</span>
            </button>
          </div>

          <div class="section-label">
            <span>工作区</span>
            <span class="section-actions">
              <!-- View options: grouping + ordering menu, selection pinned
                  with checks. -->
              <Menu class="view-menu">
                <template #trigger="{ open, toggle }">
                  <IconButton
                    className="section-action"
                    label="视图选项"
                    tip="视图选项"
                    aria-haspopup="menu"
                    :aria-expanded="open"
                    @click="toggle"
                  >
                    <Icon viewBox="0 0 16 16" :stroke-width="1.3">
                      <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h7" />
                    </Icon>
                  </IconButton>
                </template>
                <MenuLabel>分组方式</MenuLabel>
                <MenuItem
                  :selected="view.groupBy === 'workspace'"
                  @click="patchView({ groupBy: 'workspace' })"
                >
                  按工作区
                </MenuItem>
                <MenuItem :selected="view.groupBy === 'flat'" @click="patchView({ groupBy: 'flat' })">
                  单列表
                </MenuItem>
                <MenuDivider />
                <MenuLabel>排序方式</MenuLabel>
                <MenuItem
                  :selected="view.orderBy === 'manual'"
                  @click="patchView({ orderBy: 'manual' })"
                >
                  手动排序
                </MenuItem>
                <MenuItem
                  :selected="view.orderBy === 'updated'"
                  @click="patchView({ orderBy: 'updated' })"
                >
                  最近更新
                </MenuItem>
              </Menu>
              <!-- Add workspace: folder + plus, matching the web header. -->
              <IconButton className="section-action" label="添加工作区" tip="添加工作区">
                <Icon viewBox="0 0 16 16" :stroke-width="1.3">
                  <path d="M4.5 13.5h7l1-8.5h-3.3L7.6 3.5H3.5v6.5" />
                  <path d="M10.5 11.5v4M8.5 13.5h4" />
                </Icon>
              </IconButton>
            </span>
          </div>

          <ScrollArea className="projects" label="工作区与会话" :outside="6">
            <div v-if="view.groupBy === 'flat'" class="session-list">
              <!-- Flat list: every session in one recency-ordered column. -->
              <SessionRow
                v-for="entry in flatSessions"
                :key="entry.session.id"
                :session="entry.session"
                :selected="selectedSession === entry.session.id"
                @select="openSession(entry.session.id, entry.session.agentPreset)"
                @action="(action) => dispatchSessionAction(action, entry.ws.id, entry.session)"
              />
            </div>
            <template v-else>
              <div
                v-for="workspace in orderedWorkspaces"
                :key="workspace.id"
                :class="`workspace-group${view.collapsed.includes(workspace.id) ? ' collapsed' : ''}`"
              >
                <WorkspaceRow
                  :workspace="workspace"
                  :collapsed="view.collapsed.includes(workspace.id)"
                  @toggle="toggleWorkspace(workspace.id)"
                  @new-session="addSession(workspace.id)"
                  @action="
                    (action) => {
                      if (action === 'rename') {
                        openRename({ kind: 'workspace', id: workspace.id }, workspace.title)
                      } else {
                        deleteTarget = workspace
                      }
                    }
                  "
                />
                <!-- Grid-rows collapse: 1fr -> 0fr animates the group shut
                    without measuring heights. -->
                <div class="workspace-sessions-wrap">
                  <div class="workspace-sessions">
                    <SessionRow
                      v-for="s in orderedSessions(workspace.sessions)"
                      :key="s.id"
                      :session="s"
                      :selected="selectedSession === s.id"
                      @select="openSession(s.id, s.agentPreset)"
                      @action="(action) => dispatchSessionAction(action, workspace.id, s)"
                    />
                  </div>
                </div>
              </div>
            </template>
          </ScrollArea>

          <div class="side-gap" />

          <div class="side-footer">
            <!-- The only footer affordance is the Settings trigger row; it
                swaps the sidebar/content into the settings surface. -->
            <button
              class="settings-row"
              aria-label="设置"
              @click="
                surface = 'settings';
                settingsCategory = 'appearance';
              "
            >
              <Icon className="settings-ico">
                <path d="M12.2 2h-.44a2 2 0 0 0 2 2v.44a2 2 0 0 0 2 2h.44a2 2 0 0 1 2 2v.44a2 2 0 0 0 2 2v.44a2 2 0 0 1 2 2h.44a2 2 0 0 0 2 2v.44a2 2 0 0 0-2 2h-.44a2 2 0 0 1-2 2v-.44a2 2 0 0 0-2 2h-.44a2 2 0 0 1-2 2v-.44a2 2 0 0 0-2 2h-.44a2 2 0 0 1-2-2v-.44a2 2 0 0 0-2-2h-.44a2 2 0 0 1-2-2v-.44a2 2 0 0 0-2-2h-.44a2 2 0 0 1-2-2v-.44a2 2 0 0 0-2-2z" />
                <circle cx="18" cy="18" r="3" />
              </Icon>
              <span>设置</span>
            </button>
          </div>
        </template>
      </nav>

      <!-- The sash fills the backdrop strip between the sidebar and the
          content panel; hidden when collapsed. While it is dragged,
          `resizing` strips the panel's collapse transition. -->
      <Split
        v-if="sidebarOpen"
        className="sidebar-split"
        :style="{ left: `${sidebarWidth}px` }"
        label="调整侧栏宽度"
        :value="sidebarWidth"
        :min="SIDEBAR_MIN"
        :max="SIDEBAR_MAX"
        @change="(size) => (sidebarWidth = size)"
        @drag-start="resizing = true"
        @drag-end="resizing = false"
      />

      <div
        class="content-col"
        :style="{ left: sidebarOpen ? `${sidebarWidth + SIDEBAR_GAP}px` : '0px' }"
      >
        <SettingsPane
          v-if="surface === 'settings'"
          :category="settingsCategory"
          :theme-choice="themeChoice"
          :view="view"
          @update:theme-choice="(c) => emit('update:themeChoice', c)"
          @patch-view="patchView"
        />
        <main v-else :class="`content${session.messages.length > 0 ? ' in-session' : ''}`">
          <div v-if="selectedSession !== null" class="session-titlebar">
            <span class="titlebar-title">{{ selectedInfo?.title ?? '新会话' }}</span>
            <span v-if="selectedInfo?.workspace !== undefined" class="title-chip">
              <Icon viewBox="0 0 24 24" :stroke-width="1.8">
                <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
              </Icon>
              {{ selectedInfo.workspace }}
            </span>
            <span v-if="sessionMode !== undefined" class="title-chip">
              <Icon>
                <path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" />
                <path d="M22 10.1V21a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-10.9" />
              </Icon>
              {{ sessionMode }}
            </span>
            <span v-if="cumulativeLabel !== null" class="title-chip" title="本会话累计工作时长">
              <Icon viewBox="0 0 24 24" :stroke-width="1.8">
                <!-- lucide:clock -->
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </Icon>
              累计工作 {{ cumulativeLabel }}
            </span>
          </div>
          <div v-if="session.messages.length === 0" class="watermark" aria-hidden="true">C</div>
          <ChatStream
            v-if="session.messages.length > 0"
            :messages="session.messages"
            :running-sec="turnStartedAt !== null ? turnSeconds : null"
            :last-turn-ms="lastTurnMs"
          />

          <!-- Centered in the conversation area: the composer anchors the
              center; the greeting rides a fixed 26px above the card.
              In-session it floats pinned to the panel bottom. -->
          <div ref="composerAnchorRef" class="composer-anchor">
            <h1 v-if="session.messages.length === 0" class="greeting">{{ greeting() }}</h1>

            <!-- Interaction gates replace the composer while pending
                (reference interaction: the answer IS the input). Questions
                stack first; approval (permission) cards ride below them. -->
            <div v-if="activeQuestions.length > 0 || activeApprovals.length > 0" class="pending-gates">
              <QuestionCard
                v-for="pending in activeQuestions"
                :key="pending.gateId"
                :pending="pending"
                @submit="(answers) => session.answerQuestion(pending, answers)"
                @cancel="session.cancelQuestion(pending)"
              />
              <ApprovalCard
                v-for="pending in activeApprovals"
                :key="pending.gateId"
                :pending="pending"
                @answer="(outcome) => session.answerApproval(pending, outcome)"
              />
            </div>
            <div v-else class="composer">
              <!-- Head row (workspace + mode) is a home-draft affordance only:
                  in-session the info lives in the titlebar chips. -->
              <div v-if="selectedSession === null" class="composer-head">
                <Dropdown
                  :options="projectOptions"
                  :value="selectedProject"
                  :actions="PROJECT_ACTIONS"
                  @change="(id) => (selectedProject = id)"
                  @action="(id) => voidId(id)"
                />
                <Dropdown
                  v-if="presetsSupported"
                  head-slot="selected"
                  :options="modeOptions"
                  :value="modeValue"
                  :disabled="conversationStarted"
                  @change="onPresetPick"
                />
              </div>
              <div class="composer-body">
                <div v-if="session.queue.length > 0" class="queue-strip" role="list" aria-label="排队中的消息">
                  <div
                    v-for="item in session.queue"
                    :key="item.itemId"
                    class="queue-item"
                    role="listitem"
                  >
                    <span class="queue-badge">
                      {{ item.placement === 'steering' ? '插话' : '排队' }}
                    </span>
                    <span class="queue-text">{{ item.text }}</span>
                    <button
                      type="button"
                      class="queue-remove"
                      aria-label="移除排队消息"
                      @click="session.dequeue(item.itemId)"
                    >
                      <Icon viewBox="0 0 16 16" :stroke-width="1.6">
                        <path d="M4 4l8 8M12 4l-8 8" />
                      </Icon>
                    </button>
                  </div>
                </div>
                <textarea
                  ref="composerRef"
                  v-model="draft"
                  class="composer-input"
                  rows="3"
                  placeholder="向 Coded 提问，使用 @ 添加上下文，使用 / 选择命令或能力"
                  aria-label="向 Coded 提问"
                  @keydown="
                    (event) => {
                      if (event.key === 'Enter' && !event.isComposing && !event.shiftKey) {
                        event.preventDefault()
                        submitDraft()
                      }
                    }
                  "
                />
                <div class="composer-foot">
                  <div class="composer-left">
                    <!-- ＋ context menu: attach / @-mention / slash commands. -->
                    <Dropdown
                      :actions="CONTEXT_ACTIONS"
                      :searchable="false"
                      placement="top-left"
                      fit-content
                      @action="(id) => voidId(id)"
                    >
                      <template #trigger="{ open, toggle }">
                        <Tooltip label="添加上下文" placement="top-left">
                          <button
                            type="button"
                            class="plus-btn"
                            aria-label="添加上下文"
                            aria-haspopup="menu"
                            :aria-expanded="open"
                            @click="toggle"
                          >
                            <!-- lucide:plus -->
                            <Icon>
                              <path d="M5 12h14m-7-7v14" />
                            </Icon>
                          </button>
                        </Tooltip>
                      </template>
                    </Dropdown>
                    <!-- Access modes: the backend's permission roster; full
                        access is risk-gated with a confirm dialog. -->
                    <Dropdown
                      head-slot="selected"
                      :options="accessModeOptions"
                      :value="accessMode"
                      :searchable="false"
                      placement="top-left"
                      class="dd-access"
                      fit-content
                      cycle-shortcut="Mod+Shift+M"
                      @change="onAccessModeChange"
                    >
                      <template #trigger="{ open, toggle, selected, shortcut }">
                        <Tooltip label="切换访问权限" :shortcut="shortcut" placement="top-left">
                          <button
                            type="button"
                            class="access-chip"
                            aria-haspopup="listbox"
                            :aria-expanded="open"
                            @click="toggle"
                          >
                            <span :key="selected?.id ?? 'none'" class="ui-dd-face">
                              <span v-if="selected?.icon !== undefined" class="ui-dd-optico">
                                <component :is="selected.icon()" />
                              </span>
                              <span class="ui-dd-label">{{ selected?.label ?? '访问模式' }}</span>
                            </span>
                            <Icon className="chip-chev">
                              <path d="m6 9l6 6l6-6" />
                            </Icon>
                          </button>
                        </Tooltip>
                      </template>
                    </Dropdown>
                  </div>
                  <div class="composer-right">
                    <!-- Model roster: `coded.models.list` for the active session. -->
                    <Dropdown
                      head-slot="selected"
                      :options="modelOptions"
                      :value="currentModelKey"
                      :searchable="false"
                      placement="top-right"
                      fit-content
                      cycle-shortcut="Mod+M"
                      @change="onModelChange"
                    >
                      <template #trigger="{ open, toggle, selected, shortcut }">
                        <Tooltip label="选择模型" :shortcut="shortcut" placement="top-left">
                          <button
                            type="button"
                            class="model-chip"
                            aria-haspopup="listbox"
                            :aria-expanded="open"
                            @click="toggle"
                          >
                            <span :key="selected?.id ?? 'none'" class="ui-dd-face">
                              <span class="ui-dd-label">{{ selected?.label ?? '选择模型' }}</span>
                            </span>
                            <Icon className="chip-chev">
                              <path d="m6 9l6 6l6-6" />
                            </Icon>
                          </button>
                        </Tooltip>
                      </template>
                    </Dropdown>
                    <!-- Reasoning efforts: only for thinking-capable routes. -->
                    <Dropdown
                      v-if="selectedRoute?.efforts !== undefined"
                      head-slot="selected"
                      :options="effortOptions"
                      :value="currentEffort"
                      :searchable="false"
                      placement="top-right"
                      fit-content
                      cycle-shortcut="Mod+T"
                      @change="onEffortChange"
                    >
                      <template #trigger="{ open, toggle, selected, shortcut }">
                        <Tooltip label="思考等级" :shortcut="shortcut" placement="top-left">
                          <button
                            type="button"
                            class="model-chip"
                            aria-haspopup="listbox"
                            :aria-expanded="open"
                            @click="toggle"
                          >
                            <span :key="selected?.id ?? 'none'" class="ui-dd-face">
                              <span class="ui-dd-label">{{ selected?.label ?? '思考等级' }}</span>
                            </span>
                            <Icon className="chip-chev">
                              <path d="m6 9l6 6l6-6" />
                            </Icon>
                          </button>
                        </Tooltip>
                      </template>
                    </Dropdown>
                    <!-- Running turn: the send button becomes stop (interrupt). -->
                    <Tooltip v-if="activeRunning" label="停止" placement="top-left">
                      <button
                        type="button"
                        class="send-btn send-btn--stop"
                        aria-label="停止当前回合"
                        @click="session.interrupt"
                      >
                        <!-- lucide:square (stop) -->
                        <Icon>
                          <rect x="6" y="6" width="12" height="12" rx="1.5" />
                        </Icon>
                      </button>
                    </Tooltip>
                    <MetaButton
                      v-else
                      label="发送"
                      tip="发送"
                      tip-placement="top-left"
                      className="send-btn"
                      @click="submitDraft"
                    >
                      <!-- lucide:arrow-up -->
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

    <!-- Risk gate: switching to full access needs an explicit confirm. -->
    <Dialog :open="accessConfirm !== null" label="切换访问权限" @close="accessConfirm = null">
      <div class="dlg">
        <h2 class="dlg-title">切换到完全访问？</h2>
        <p class="dlg-text">
          将减少工具调用的确认提示，模型可以不经确认直接执行有风险的操作。
        </p>
        <div class="dlg-actions">
          <button type="button" class="dlg-btn" @click="accessConfirm = null">取消</button>
          <button
            type="button"
            class="dlg-btn dlg-btn--danger"
            @click="accessConfirm !== null && submitAccessMode(accessConfirm)"
          >
            确认切换
          </button>
        </div>
      </div>
    </Dialog>

    <!-- Row-action dialogs: rename (workspace/session, duplicate-checked)
        and the delete-workspace confirm. -->
    <Dialog
      :open="renameTarget !== null"
      :label="renameTarget?.kind === 'workspace' ? '重命名工作区' : '重命名会话'"
      @close="renameTarget = null"
    >
      <div class="dlg">
        <h2 class="dlg-title">
          {{ renameTarget?.kind === 'workspace' ? '重命名工作区' : '重命名会话' }}
        </h2>
        <input
          v-model="renameDraft"
          class="dlg-input"
          autofocus
          :aria-label="renameTarget?.kind === 'workspace' ? '工作区名称' : '会话名称'"
          @input="renameError = null"
          @keydown="
            (event) => {
              if (event.key === 'Enter' && !event.isComposing) submitRename()
            }
          "
        />
        <p v-if="renameError !== null" class="dlg-error">{{ renameError }}</p>
        <div class="dlg-actions">
          <button type="button" class="dlg-btn" @click="renameTarget = null">取消</button>
          <button type="button" class="dlg-btn dlg-btn--primary" @click="submitRename">重命名</button>
        </div>
      </div>
    </Dialog>

    <Dialog :open="deleteTarget !== null" label="删除工作区" @close="deleteTarget = null">
      <div class="dlg">
        <h2 class="dlg-title">删除工作区</h2>
        <p class="dlg-text">
          将把“{{ deleteTarget?.title ?? '' }}”从工作区列表中移除。文件夹与会话记录会保留。
        </p>
        <div class="dlg-actions">
          <button type="button" class="dlg-btn" @click="deleteTarget = null">取消</button>
          <button type="button" class="dlg-btn dlg-btn--danger" @click="confirmDeleteWorkspace">
            删除工作区
          </button>
        </div>
      </div>
    </Dialog>
  </section>
</template>
