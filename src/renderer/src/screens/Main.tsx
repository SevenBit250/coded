import { useEffect } from 'react'
import type { ReactElement } from 'react'
import { WindowControls } from '../components/WindowControls'

/** Main screen props. */
export interface MainProps {
  /** Whether the enter transition has completed (adds the `entered` state). */
  shown: boolean
  /** Called after the enter transition so the parent can settle its phase. */
  onShown: () => void
}

/** Sidebar menu entry. */
interface MenuItem {
  icon: string
  label: string
  shortcut?: string
}

const MENU: readonly MenuItem[] = [
  { icon: '＋', label: '新建任务', shortcut: 'Ctrl+N' },
  { icon: '⌕', label: '搜索', shortcut: 'Ctrl+K' },
  { icon: '⚙', label: '自动化' },
  { icon: '▦', label: '插件市场' },
]

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

/** Quick-compose suggestion row. */
interface QuickAction {
  emoji: string
  text: string
}

const QUICK_ACTIONS: readonly QuickAction[] = [
  { emoji: '📅', text: '每周五总结这一周发生的事情' },
  {
    emoji: '🩺',
    text: '请分析以下终端报错日志，找出导致该错误的根本原因，并提供可以直接运行的修复代码示例',
  },
  { emoji: '🎨', text: '帮我创建一份科技感十足的PPT，主题是「AI Agent 进化之路」' },
]

/** Bottom suggestion card. */
interface SuggestionCard {
  title: string
  desc: string
  /** The last card is the open-ended "custom" entry. */
  custom?: boolean
}

const SUGGESTION_CARDS: readonly SuggestionCard[] = [
  { title: 'Git 站会摘要', desc: '每周五总结这一周发生的事情。' },
  { title: 'CI 失败与不稳定测试报告', desc: '汇总近期 CI 失败和不稳定测试，分析可能原因。' },
  { title: '自定义', desc: '跳过模板，直接告诉你想做什么。', custom: true },
]

/** Time-of-day greeting (the reference opens with a "care" tone at night). */
function greeting(): string {
  const hour = new Date().getHours()
  if (hour >= 23 || hour < 6) return '夜深啦，别忘了照顾好自己哦'
  if (hour < 12) return '早上好，今天想做点什么？'
  if (hour < 18) return '下午好，继续推进吧'
  return '晚上好，别忘了照顾好自己哦'
}

/**
 * Main workspace — ZCode-like shell (placeholder until the dsh React client
 * mounts here over the Plan B custom protocol): light sidebar with nav and
 * projects, a welcoming content column with watermark, composer card,
 * quick actions, and suggestion cards. Window chrome sits top-right.
 */
export function Main({ shown, onShown }: MainProps): ReactElement {
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
      {/* Slim draggable strip; window controls at the top-right. */}
      <header className="titlebar">
        <WindowControls pin />
      </header>

      <div className="body">
        <nav className="sidebar">
          <div className="side-top">
            <span className="logo-mark" aria-hidden="true">
              DSH
            </span>
            <span className="nav-arrows" aria-hidden="true">
              <svg viewBox="0 0 16 16">
                <path d="M10.5 3.5L6 8l4.5 4.5" />
              </svg>
              <svg viewBox="0 0 16 16">
                <path d="M5.5 3.5L10 8l-4.5 4.5" />
              </svg>
            </span>
          </div>

          <div className="menu">
            {MENU.map((item) => (
              <button key={item.label} className="menu-item">
                <span className="menu-ico">{item.icon}</span>
                <span>{item.label}</span>
                {item.shortcut !== undefined && (
                  <span className="shortcut">{item.shortcut}</span>
                )}
              </button>
            ))}
          </div>

          <div className="tabs">
            <span className="tab">分组</span>
            <span className="tab active">项目</span>
            <span className="tab-tools" aria-hidden="true">
              ⋮
            </span>
          </div>

          <div className="projects">
            {PROJECTS.map((project) => (
              <button key={project.name} className="project">
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
                <svg viewBox="0 0 16 16">
                  <circle cx="8" cy="8" r="2.4" />
                  <path d="M8 2.4v1.8M8 11.8v1.8M2.4 8h1.8M11.8 8h1.8" />
                </svg>
              </span>
            </div>
          </div>
        </nav>

        <main className="content">
          <div className="watermark" aria-hidden="true">
            DSH
          </div>

          <h1 className="greeting">{greeting()}</h1>

          <div className="composer">
            <div className="composer-head">
              <svg className="folder" viewBox="0 0 16 16">
                <path d="M2.5 4h4l1.3 1.5h5.7v6H2.5z" />
              </svg>
              <span className="selector">选择项目</span>
              <svg className="chev" viewBox="0 0 12 12">
                <path d="M3 4.5l3 3 3-3" />
              </svg>
            </div>
            <textarea
              className="composer-input"
              rows={3}
              placeholder="向 DSH 提问，使用 @ 添加上下文，使用 / 选择命令或能力"
              aria-label="向 DSH 提问"
            />
            <div className="composer-foot">
              <div className="composer-left">
                <button className="plus-btn" aria-label="添加内容">
                  ＋
                </button>
                <button className="access-chip">
                  <svg className="access-ico" viewBox="0 0 16 16">
                    <circle cx="8" cy="5.4" r="2.2" />
                    <path d="M4 12.6c.8-2 2.3-3 4-3s3.2 1 4 3" />
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

          <div className="quick">
            {QUICK_ACTIONS.map((action) => (
              <button key={action.text} className="quick-row">
                <span className="quick-emoji">{action.emoji}</span>
                <span>{action.text}</span>
              </button>
            ))}
          </div>

          <p className="notice">
            🧩 订阅用户新功能体验：创建「闲时任务」，我们将免费在算力富余时段为你完成指派任务。
          </p>

          <div className="cards">
            {SUGGESTION_CARDS.map((card) => (
              <button key={card.title} className={`card ${card.custom === true ? 'custom' : ''}`}>
                <h3>{card.title}</h3>
                <p>{card.desc}</p>
              </button>
            ))}
          </div>
        </main>
      </div>
    </section>
  )
}
