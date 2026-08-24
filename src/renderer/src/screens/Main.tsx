import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import { Icon, IconButton, Split, Tooltip, WindowControls } from '@uibase'

/** Main screen props. */
export interface MainProps {
  /** Whether the enter transition has completed (adds the `entered` state). */
  shown: boolean
  /** Called after the enter transition so the parent can settle its phase. */
  onShown: () => void
}

/** Sidebar menu icon names (line icons matching the reference). */
type MenuIconName = 'new-task' | 'search' | 'automation' | 'market'

/** Sidebar menu entry. */
interface MenuItem {
  icon: MenuIconName
  label: string
  shortcut?: string
}

const MENU: readonly MenuItem[] = [
  { icon: 'new-task', label: '新建任务', shortcut: 'Ctrl+N' },
  { icon: 'search', label: '搜索', shortcut: 'Ctrl+K' },
  { icon: 'automation', label: '自动化' },
  { icon: 'market', label: '插件市场' },
]

/** Sidebar geometry (px): default/min/max width, plus the backdrop strip
 *  between the sidebar and the content panel that the Split sash fills.
 *  The minimum is the designed width — below it the tabs row wraps. */
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
    case 'automation':
      return (
        <Icon viewBox="0 0 16 16" strokeWidth={1.25}>
          <circle cx="8" cy="8" r="2.4" />
          <path d="M8 1.8v2M8 12.2v2M1.8 8h2M12.2 8h2M3.6 3.6l1.5 1.5M10.9 10.9l1.5 1.5M12.4 3.6l-1.5 1.5M5.1 10.9l-1.5 1.5" />
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
        label={collapsed ? '展开侧边栏' : '收起侧边栏'}
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
interface ProjectEntry {
  name: string
  note?: string
  age?: string
}

const PROJECTS: readonly ProjectEntry[] = [
  { name: 'dsh', note: '拉取并研究 deepseek-harness', age: '4天' },
  { name: 'dsh-desktop', note: 'Electron 桌面壳', age: '今天' },
  { name: 'docs', note: 'Electron 嵌入方案评估', age: '3天' },
  { name: '未命名项目' },
]

/** Time-of-day greeting (the reference opens with a "care" tone). */
function greeting(): string {
  const hour = new Date().getHours()
  if (hour >= 23 || hour < 6) return '夜深啦，别忘了照顾好自己哦'
  if (hour < 11) return '早上好，今天想做点什么？'
  if (hour < 13) return '中午好呀，要不要先休息一下'
  if (hour < 18) return '下午好，继续推进吧'
  return '晚上好，别忘了照顾好自己哦'
}

/**
 * Main workspace — ZCode-like shell (placeholder until the dsh React client
 * mounts here over the Plan B custom protocol): collapsible sidebar with nav
 * and projects, resizable by dragging the sash on its right edge; a welcoming
 * content column (watermark, greeting, composer), and window chrome top-right.
 */
export function Main({ shown, onShown }: MainProps): ReactElement {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT)
  const [resizing, setResizing] = useState(false)
  const [selectedProject, setSelectedProject] = useState<string | null>(null)

  useEffect(() => {
    if (shown) return
    const t = setTimeout(onShown, 300)
    return () => clearTimeout(t)
  }, [shown, onShown])

  return (
    <section
      className={`screen main ${shown ? 'entered' : 'entering'}${resizing ? ' resizing' : ''}`}
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

          <div className="tabs">
            <span className="tab">
              <Icon className="tab-ico" viewBox="0 0 16 16" strokeWidth={1.3}>
                <path d="M6 3.5v9M3.5 6h5" opacity="0.9" />
              </Icon>
              分组
            </span>
            <span className="tab active">
              <Icon className="tab-ico" viewBox="0 0 16 16" strokeWidth={1.3}>
                <path d="M2.5 4.2h4l1.3 1.5h5.7v6.1H2.5z" />
              </Icon>
              项目
            </span>
            <span className="tab-tools" aria-label="筛选与排序">
              <Icon className="tool-ico" viewBox="0 0 16 16" strokeWidth={1.3}>
                <path d="M4 11L11 4M11 4H6M11 4v5" />
              </Icon>
              <Icon className="tool-ico" viewBox="0 0 16 16" strokeWidth={1.3}>
                <path d="M3.5 5h9M5.5 8h5M7 11h2" />
              </Icon>
              <Icon className="tool-ico" viewBox="0 0 16 16" strokeWidth={1.3}>
                <path d="M3.5 4.5h9M5 4.5L6 13h4l1-8.5M6.5 7v4M9.5 7v4" />
              </Icon>
            </span>
          </div>

          <div className="section-label">项目</div>

          <div className="projects">
            {PROJECTS.map((project) => (
              <button
                key={project.name}
                className={`project ${selectedProject === project.name ? 'selected' : ''}`}
                onClick={() => setSelectedProject(project.name)}
              >
                <span className="project-name">
                  <svg className="folder" viewBox="0 0 16 16">
                    <path d="M2.5 4h4l1.3 1.5h5.7v6H2.5z" />
                  </svg>
                  {project.name}
                </span>
                {project.note !== undefined && (
                  <span className="project-meta">
                    {project.note}
                    {project.age !== undefined ? ` · ${project.age}` : ''}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="side-gap" />

          <div className="side-footer">
            <div className="tasks-toggle">
              <span>任务</span>
              <span className="chev" aria-hidden="true">
                ⌃
              </span>
            </div>
            <div className="user-row">
              <span className="avatar" aria-hidden="true">
                A
              </span>
              <span className="user-name">awei</span>
              <span className="pro-badge">Pro</span>
              <span className="user-icons" aria-hidden="true">
                <Icon className="user-ico" viewBox="0 0 16 16" strokeWidth={1.3}>
                  <path d="M4.5 3h7v10l-3.5-2.2L4.5 13z" />
                </Icon>
                <Icon className="user-ico" viewBox="0 0 16 16" strokeWidth={1.3}>
                  <circle cx="8" cy="8" r="2.4" />
                  <path d="M8 2.4v1.8M8 11.8v1.8M2.4 8h1.8M11.8 8h1.8" />
                </Icon>
              </span>
            </div>
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
              {/* lucide:folder */}
              <Icon className="head-ico">
                <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
              </Icon>
              <span className="selector">{selectedProject ?? '选择项目'}</span>
              {/* lucide:chevron-down */}
              <Icon className="chip-chev">
                <path d="m6 9l6 6 6-6" />
              </Icon>
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
                <button className="plus-btn" aria-label="添加内容">
                  {/* lucide:plus */}
                  <Icon>
                    <path d="M5 12h14m-7-7v14" />
                  </Icon>
                </button>
                <button className="access-chip">
                  {/* lucide:shield */}
                  <Icon className="access-ico">
                    <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
                  </Icon>
                  完全访问
                  <Icon className="chip-chev">
                    <path d="m6 9l6 6l6-6" />
                  </Icon>
                </button>
              </div>
              <div className="composer-right">
                <Tooltip label="选择模型" shortcut="Ctrl+M" placement="top-left">
                  <button className="model-chip">
                    {/* provider mark placeholder: plain circle */}
                    <Icon className="model-mark">
                      <circle cx="12" cy="12" r="9" />
                    </Icon>
                    deepseek-chat
                    <Icon className="chip-chev">
                      <path d="m6 9l6 6l6-6" />
                    </Icon>
                  </button>
                </Tooltip>
                <button className="model-chip">
                  {/* lucide:gauge */}
                  <Icon className="gauge-ico">
                    <path d="m12 14l4-4M3.34 19a10 10 0 1 1 17.32 0" />
                  </Icon>
                  最高
                  <Icon className="chip-chev">
                    <path d="m6 9l6 6l6-6" />
                  </Icon>
                </button>
                <button className="send-btn" aria-label="发送">
                  {/* lucide:arrow-up */}
                  <Icon>
                    <path d="m5 12l7-7 7 7m-7 7V5" />
                  </Icon>
                </button>
              </div>
            </div>
            </div>
          </div>
          </div>
        </main>
        </div>
      </div>
    </section>
  )
}
