import { useEffect } from 'react'
import type { ReactElement } from 'react'

/** Main screen props. */
export interface MainProps {
  /** Whether the enter transition has completed (adds the `entered` state). */
  shown: boolean
  /** Called after the enter transition so the parent can settle its phase. */
  onShown: () => void
}

/** Sidebar rail entry. */
interface Rail {
  icon: string
  label: string
}

const RAILS: readonly Rail[] = [
  { icon: '⌂', label: '会话' },
  { icon: '◫', label: '文件' },
  { icon: '⚙', label: '设置' },
]

/**
 * Main workspace (placeholder). This is where the dsh React client (client-web
 * / ui-renderer) will later mount over the Plan B custom protocol. For now it
 * is a Codex-like shell: draggable header, custom window controls, sidebar,
 * and a glass content panel, with an enter transition.
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
      {/* Draggable header + custom window controls */}
      <header className="titlebar">
        <div className="titlebar-drag">
          <span className="brand">DeepSeek Harness</span>
          <span className="dot" />
          <span className="crumb">工作区</span>
        </div>
        <div className="controls no-drag">
          <button
            className="ctl"
            title="最小化"
            aria-label="最小化"
            onClick={() => window.dshDesktop.minimize()}
          >
            <svg viewBox="0 0 12 12">
              <line x1="2" y1="6" x2="10" y2="6" />
            </svg>
          </button>
          <button
            className="ctl"
            title="最大化"
            aria-label="最大化"
            onClick={() => window.dshDesktop.maximize()}
          >
            <svg viewBox="0 0 12 12">
              <rect x="2.5" y="2.5" width="7" height="7" rx="1" />
            </svg>
          </button>
          <button
            className="ctl danger"
            title="关闭"
            aria-label="关闭"
            onClick={() => window.dshDesktop.close()}
          >
            <svg viewBox="0 0 12 12">
              <path d="M3 3l6 6M9 3l-6 6" />
            </svg>
          </button>
        </div>
      </header>

      <div className="body">
        <nav className="sidebar">
          <div className="side-head">
            <span className="glyph small">DSH</span>
            <span className="side-title">工作区</span>
          </div>
          {RAILS.map((rail, index) => (
            <button
              key={rail.label}
              className={`rail ${index === 0 ? 'active' : ''}`}
            >
              <span className="rail-ico">{rail.icon}</span>
              {rail.label}
            </button>
          ))}
          <div className="side-gap" />
          <div className="side-foot">
            <span className="status-pill">
              <span className="pulse" />
              已就绪
            </span>
          </div>
        </nav>

        <main className="content">
          <div className="content-card glass">
            <div className="card-head">
              <h2>主界面</h2>
              <span className="badge">外壳验证</span>
            </div>
            <p className="card-line">
              Electron 壳已就绪：无边框窗口 + 半透明磨砂玻璃启动屏 + 启动后过渡进入主界面。
            </p>
            <p className="card-line dim">
              下一步把 dsh 的 React 客户端（client-web / ui-renderer）经自定义协议 / IPC 挂到此处，即完成方案 B 的桌面层。
            </p>
          </div>
        </main>
      </div>
    </section>
  )
}
