/**
 * Settings surface: the sidebar becomes the category switcher and the
 * content column becomes stacked setting cards (reference: the ZCode
 * settings layout — back link, grouped nav, big category title, one card
 * per setting). Presentational: every value and verb arrives as props from
 * Main, which owns the view state and the stores behind them.
 *
 * Only settings with a live backing are listed — nothing decorative:
 * appearance (theme choice), session-list defaults (the sidebar view store),
 * backend diagnostics + restart, and version facts.
 */
import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import { Dropdown, Icon } from '@uibase'
import type { DropdownOption } from '@uibase'
import { bridge } from '../bridge/client'
import { BRIDGE_PROTOCOL_VERSION } from '@coded/bridge-protocol'
import type { ThemeChoice } from '../theme'
import type { SidebarViewState } from '../sidebar-view'
import type { BridgeStatus } from '../bridge/client'

/** The settings categories, in nav order. */
export type SettingsCategory = 'appearance' | 'sessions' | 'backend' | 'about'

const NAV: { group: string; items: { id: SettingsCategory; label: string }[] }[] = [
  {
    group: '基础',
    items: [
      { id: 'appearance', label: '外观' },
      { id: 'sessions', label: '会话列表' },
    ],
  },
  {
    group: '后端',
    items: [
      { id: 'backend', label: '适配器与内核' },
      { id: 'about', label: '关于' },
    ],
  },
]

const CATEGORY_TITLE: Record<SettingsCategory, string> = {
  appearance: '外观',
  sessions: '会话列表',
  backend: '适配器与内核',
  about: '关于',
}

/** Settings nav (renders inside the sidebar). */
export function SettingsNav({
  category,
  onSelect,
  onBack,
}: {
  category: SettingsCategory
  onSelect: (category: SettingsCategory) => void
  onBack: () => void
}): ReactElement {
  return (
    <>
      <button type="button" className="set-back" onClick={onBack}>
        <Icon viewBox="0 0 24 24" strokeWidth={1.8}>
          <path d="m15 18-6-6 6-6" />
        </Icon>
        <span>返回工作区</span>
      </button>
      <div className="set-nav">
        {NAV.map((group) => (
          <div key={group.group} className="set-group">
            <div className="set-group-label">{group.group}</div>
            {group.items.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`set-item${category === item.id ? ' active' : ''}`}
                onClick={() => onSelect(item.id)}
              >
                <SettingsIcon name={item.id} />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </>
  )
}

/** Category glyph (hand-drawn 24-grid line icons). */
function SettingsIcon({ name }: { name: SettingsCategory }): ReactElement {
  switch (name) {
    case 'appearance':
      // lucide:sun-moon
      return (
        <Icon>
          <path d="M12 8a2.83 2.83 0 0 0 4 4 4 4 0 1 1-4-4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4" />
        </Icon>
      )
    case 'sessions':
      return (
        <Icon>
          <path d="M8 6h13M8 12h13M8 18h13" />
          <circle cx="4" cy="6" r="0.9" />
          <circle cx="4" cy="12" r="0.9" />
          <circle cx="4" cy="18" r="0.9" />
        </Icon>
      )
    case 'backend':
      // lucide:cpu
      return (
        <Icon>
          <rect x="5" y="5" width="14" height="14" rx="2" />
          <rect x="9.5" y="9.5" width="5" height="5" rx="1" />
          <path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" />
        </Icon>
      )
    case 'about':
      return (
        <Icon>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 16v-4M12 8h.01" />
        </Icon>
      )
  }
}

/** Settings content (renders in the content column). */
export function SettingsPane({
  category,
  themeChoice,
  onThemeChoice,
  view,
  patchView,
}: {
  category: SettingsCategory
  themeChoice: ThemeChoice
  onThemeChoice: (choice: ThemeChoice) => void
  view: SidebarViewState
  patchView: (patch: Partial<SidebarViewState>) => void
}): ReactElement {
  return (
    <main className="settings-pane" aria-label="设置">
      <div className="set-column">
        <h1 className="set-title">{CATEGORY_TITLE[category]}</h1>
        {category === 'appearance' && <AppearancePane themeChoice={themeChoice} onThemeChoice={onThemeChoice} />}
        {category === 'sessions' && <SessionsPane view={view} patchView={patchView} />}
        {category === 'backend' && <BackendPane />}
        {category === 'about' && <AboutPane />}
      </div>
    </main>
  )
}

/** One setting card: title + description on the left, control on the right. */
function Card({
  title,
  description,
  control,
  wide,
}: {
  title: string
  description: string
  control?: ReactElement
  wide?: boolean
}): ReactElement {
  return (
    <div className={`set-card${wide === true ? ' wide' : ''}`}>
      <div className="set-card-main">
        <div className="set-card-title">{title}</div>
        <div className="set-card-desc">{description}</div>
      </div>
      {control !== undefined && <div className="set-card-control">{control}</div>}
    </div>
  )
}

const THEME_OPTIONS: DropdownOption[] = [
  { id: 'system', label: '跟随系统' },
  { id: 'light', label: '浅色' },
  { id: 'dark', label: '深色' },
]

function AppearancePane({
  themeChoice,
  onThemeChoice,
}: {
  themeChoice: ThemeChoice
  onThemeChoice: (choice: ThemeChoice) => void
}): ReactElement {
  return (
    <>
      <Card
        title="主题"
        description="选择应用的配色。跟随系统时，浅色/深色随操作系统的外观设置实时切换。"
        control={
          <Dropdown
            options={THEME_OPTIONS}
            value={themeChoice}
            onChange={(id) => {
              if (id === 'system' || id === 'light' || id === 'dark') onThemeChoice(id)
            }}
            searchable={false}
            fitContent
          />
        }
      />
    </>
  )
}

function SessionsPane({
  view,
  patchView,
}: {
  view: SidebarViewState
  patchView: (patch: Partial<SidebarViewState>) => void
}): ReactElement {
  return (
    <>
      <Card
        title="分组方式"
        description="侧栏会话列表按工作区分组，或折叠为单列。"
        control={
          <Dropdown
            options={[
              { id: 'workspace', label: '按工作区' },
              { id: 'flat', label: '单列表' },
            ]}
            value={view.groupBy}
            onChange={(id) => patchView({ groupBy: id === 'flat' ? 'flat' : 'workspace' })}
            searchable={false}
            fitContent
          />
        }
      />
      <Card
        title="排序方式"
        description="按最近更新排序，或保持列表的手动顺序。"
        control={
          <Dropdown
            options={[
              { id: 'updated', label: '最近更新' },
              { id: 'manual', label: '手动排序' },
            ]}
            value={view.orderBy}
            onChange={(id) => patchView({ orderBy: id === 'manual' ? 'manual' : 'updated' })}
            searchable={false}
            fitContent
          />
        }
      />
    </>
  )
}

/** Human labels for the lifecycle broadcast. */
const STATUS_LABEL: Record<BridgeStatus, { text: string; tone: 'ok' | 'warn' | 'bad' }> = {
  starting: { text: '启动中', tone: 'warn' },
  'runtime-ready': { text: '内核就绪', tone: 'warn' },
  'bridge-connected': { text: '已连接', tone: 'ok' },
  'bridge-disconnected': { text: '已断开', tone: 'bad' },
  'runtime-exited': { text: '内核退出', tone: 'bad' },
  failed: { text: '失败', tone: 'bad' },
}

function BackendPane(): ReactElement {
  const [backend, setBackend] = useState<{ id: string; label: string } | null>(null)
  const [caps, setCaps] = useState<string[]>([])
  const [status, setStatus] = useState<BridgeStatus>('starting')
  const [restarting, setRestarting] = useState(false)

  useEffect(() => {
    void bridge.backend().then(setBackend).catch(() => {})
    void bridge.capabilities().then(setCaps).catch(() => {})
    void bridge.status().then(setStatus).catch(() => {})
    return bridge.onStatus(setStatus)
  }, [])

  const restart = (): void => {
    if (restarting) return
    setRestarting(true)
    void bridge
      .restartBackend()
      .catch(() => {})
      .finally(() => setTimeout(() => setRestarting(false), 1500))
  }

  const badge = STATUS_LABEL[status]
  return (
    <>
      <Card
        title="当前适配器"
        description={
          backend === null
            ? '尚未加载任何后端适配器。'
            : `以插件形式加载的后端绑定：${backend.label}（id: ${backend.id}）。`
        }
        control={<span className={`set-badge ${badge.tone}`}>{badge.text}</span>}
      />
      <Card
        title="协议能力"
        description={
          caps.length === 0
            ? '适配器尚未声明能力（握手前或空集）。'
            : `适配器在握手中声明：${caps.join('、')}。`
        }
      />
      <Card
        title="适配器目录"
        description="按顺序扫描：用户目录 adapters/ → CODED_ADAPTERS_DIR → 开发检出 ../coded-adapter/packages/backend。放置含 coded.backend.json 的插件目录即可被发现。"
      />
      <Card
        title="重启后端"
        description="停止当前绑定并重新拉起（指数退避由壳管理）。桥断开期间聊天输入不可用，重连后自动恢复。"
        control={
          <button type="button" className="set-btn" onClick={restart} disabled={restarting}>
            {restarting ? '重启中…' : '重启'}
          </button>
        }
      />
    </>
  )
}

function AboutPane(): ReactElement {
  return (
    <>
      <Card title="应用版本" description={window.coded.version} />
      <Card title="运行平台" description={window.coded.platform} />
      <Card
        title="CodedBridge 协议"
        description={`proto ${String(BRIDGE_PROTOCOL_VERSION)}（通道模型：hello / query / control / stream）。`}
      />
    </>
  )
}
