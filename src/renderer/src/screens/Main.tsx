import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import { WindowControls } from '../components/WindowControls'
import { AppMenu } from '../components/AppMenu'

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

/** One small line-icon glyph (12–15px, currentColor stroke). */
function Glyph({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}): ReactElement {
  return (
    <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
      {children}
    </svg>
  )
}

/** One lucide line icon (Iconify, 24×24 viewBox, currentColor stroke). */
function Lucide({ children }: { children: React.ReactNode }): ReactElement {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      >
        {children}
      </g>
    </svg>
  )
}

interface MenuIconProps {
  name: MenuIconName
}

/** Menu line icon by name. */
function MenuIcon({ name }: MenuIconProps): ReactElement {
  switch (name) {
    case 'new-task':
      return (
        <Glyph>
          <rect x="2.5" y="2.5" width="11" height="11" rx="2.5" />
          <path d="M8 5.4v5.2M5.4 8h5.2" />
        </Glyph>
      )
    case 'search':
      return (
        <Glyph>
          <circle cx="7" cy="7" r="4" />
          <path d="M10 10l3 3" />
        </Glyph>
      )
    case 'automation':
      return (
        <Glyph>
          <circle cx="8" cy="8" r="2.4" />
          <path d="M8 1.8v2M8 12.2v2M1.8 8h2M12.2 8h2M3.6 3.6l1.5 1.5M10.9 10.9l1.5 1.5M12.4 3.6l-1.5 1.5M5.1 10.9l-1.5 1.5" />
        </Glyph>
      )
    case 'market':
      return (
        <Glyph>
          <rect x="2.5" y="2.5" width="5" height="5" rx="1" />
          <rect x="8.5" y="2.5" width="5" height="5" rx="1" />
          <rect x="2.5" y="8.5" width="5" height="5" rx="1" />
          <rect x="8.5" y="8.5" width="5" height="5" rx="1" />
        </Glyph>
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
      <button
        className="sidebar-toggle"
        title={collapsed ? '展开侧边栏' : '收起侧边栏'}
        aria-label={collapsed ? '展开侧边栏' : '收起侧边栏'}
        onClick={onToggle}
      >
        {/* lucide:panel-left-close / lucide:panel-left-open */}
        <Lucide>
          <rect width="18" height="18" x="3" y="3" rx="2" />
          <path d={collapsed ? 'M9 3v18m5-12 3 3-3 3' : 'M9 3v18m7-6-3-3 3-3'} />
        </Lucide>
      </button>
      <span className="nav-arrows">
        {/* lucide:chevron-left / lucide:chevron-right; placeholder controls,
            no navigation history yet */}
        <button className="nav-arrow" title="后退" aria-label="后退">
          <Lucide>
            <path d="m15 18-6-6 6-6" />
          </Lucide>
        </button>
        <button className="nav-arrow" title="前进" aria-label="前进">
          <Lucide>
            <path d="m9 18 6-6-6-6" />
          </Lucide>
        </button>
      </span>
      {collapsed && (
        <button className="chat-new" title="新建对话" aria-label="新建对话">
          {/* lucide:message-circle-plus */}
          <Lucide>
            <path d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719M8 12h8m-4-4v8" />
          </Lucide>
        </button>
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
 * and projects, a welcoming content column (watermark, greeting, composer),
 * and window chrome top-right.
 */
export function Main({ shown, onShown }: MainProps): ReactElement {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [selectedProject, setSelectedProject] = useState<string | null>(null)

  useEffect(() => {
    if (shown) return
    const t = setTimeout(onShown, 300)
    return () => clearTimeout(t)
  }, [shown, onShown])

  return (
    <section
      className={`screen main ${shown ? 'entered' : 'entering'}`}
      aria-label="主界面"
    >
      {/* The anchor strip is transparent and owns the window drag region
          (full top width). Left group: logo/arrows/chat (no-drag holes).
          Right group: the app command menu + window controls, same chrome
          row as the caption buttons — hover and clicks work like the
          system minimize/close buttons. No app title in either state. */}
      <div className="anchor-bar">
        <div className="anchor-left">
          <SidebarTopRow
            onToggle={() => setSidebarOpen(!sidebarOpen)}
            collapsed={!sidebarOpen}
          />
        </div>
        <div className="anchor-right">
          <AppMenu />
          <WindowControls />
        </div>
      </div>
      <div className={`main-body ${sidebarOpen ? '' : 'collapsed'}`}>
        <nav className="sidebar">
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
              <Glyph className="tab-ico">
                <path d="M6 3.5v9M3.5 6h5" opacity="0.9" />
              </Glyph>
              分组
            </span>
            <span className="tab active">
              <Glyph className="tab-ico">
                <path d="M2.5 4.2h4l1.3 1.5h5.7v6.1H2.5z" />
              </Glyph>
              项目
            </span>
            <span className="tab-tools" aria-label="筛选与排序">
              <Glyph className="tool-ico">
                <path d="M4 11L11 4M11 4H6M11 4v5" />
              </Glyph>
              <Glyph className="tool-ico">
                <path d="M3.5 5h9M5.5 8h5M7 11h2" />
              </Glyph>
              <Glyph className="tool-ico">
                <path d="M3.5 4.5h9M5 4.5L6 13h4l1-8.5M6.5 7v4M9.5 7v4" />
              </Glyph>
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
                <Glyph className="user-ico">
                  <path d="M4.5 3h7v10l-3.5-2.2L4.5 13z" />
                </Glyph>
                <Glyph className="user-ico">
                  <circle cx="8" cy="8" r="2.4" />
                  <path d="M8 2.4v1.8M8 11.8v1.8M2.4 8h1.8M11.8 8h1.8" />
                </Glyph>
              </span>
            </div>
          </div>
        </nav>

        <div className="content-col">
          <main className="content">
          <div className="watermark" aria-hidden="true">
            C
          </div>

          <h1 className="greeting">{greeting()}</h1>

          <div className="composer">
            <div className="composer-head">
              <svg className="folder" viewBox="0 0 16 16">
                <path d="M2.5 4h4l1.3 1.5h5.7v6H2.5z" />
              </svg>
              <span className="selector">{selectedProject ?? '选择项目'}</span>
              <svg className="chev" viewBox="0 0 12 12">
                <path d="M3 4.5l3 3 3-3" />
              </svg>
            </div>
            <textarea
              className="composer-input"
              rows={3}
              placeholder="向 Coded 提问，使用 @ 添加上下文，使用 / 选择命令或能力"
              aria-label="向 Coded 提问"
            />
            <div className="composer-foot">
              <div className="composer-left">
                <button className="plus-btn" aria-label="添加内容">
                  ＋
                </button>
                <button className="access-chip">
                  <svg className="access-ico" viewBox="0 0 16 16">
                    <circle cx="8" cy="8" r="5.6" opacity="0.6" />
                    <circle cx="8" cy="8" r="2.2" />
                  </svg>
                  完全访问
                  <svg className="chev" viewBox="0 0 12 12">
                    <path d="M3 4.5l3 3 3-3" />
                  </svg>
                </button>
              </div>
              <div className="composer-right">
                <button className="model-chip">
                  deepseek-chat
                  <svg className="chev" viewBox="0 0 12 12">
                    <path d="M3 4.5l3 3 3-3" />
                  </svg>
                </button>
                <button className="model-chip">
                  <svg className="gauge-ico" viewBox="0 0 16 16">
                    <circle cx="8" cy="8" r="5.6" opacity="0.5" />
                    <path d="M8 8l3.4-2" />
                  </svg>
                  最高
                  <svg className="chev" viewBox="0 0 12 12">
                    <path d="M3 4.5l3 3 3-3" />
                  </svg>
                </button>
                <button className="send-btn" aria-label="发送">
                  <svg viewBox="0 0 14 14">
                    <path d="M7 11V3M3.5 6L7 2.5 10.5 6" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </main>
        </div>
      </div>
    </section>
  )
}
