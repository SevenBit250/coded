<script setup lang="ts">
import { onUnmounted, ref } from 'vue'
import { Dropdown } from '@uibase'
import { bridge } from '../bridge/client'
import { BRIDGE_PROTOCOL_VERSION } from '@coded/bridge-protocol'
import type { ThemeChoice } from '../theme'
import type { SidebarViewState } from '../sidebar-view'
import type { BridgeStatus } from '../bridge/client'
import type { SettingsCategory } from './SettingsNav.vue'

const CATEGORY_TITLE: Record<SettingsCategory, string> = {
  appearance: '外观',
  sessions: '会话列表',
  backend: '适配器与内核',
  about: '关于',
}

const THEME_OPTIONS = [
  { id: 'system', label: '跟随系统' },
  { id: 'light', label: '浅色' },
  { id: 'dark', label: '深色' },
]

/** Human labels for the lifecycle broadcast. */
const STATUS_LABEL: Record<BridgeStatus, { text: string; tone: 'ok' | 'warn' | 'bad' }> = {
  starting: { text: '启动中', tone: 'warn' },
  'runtime-ready': { text: '内核就绪', tone: 'warn' },
  'bridge-connected': { text: '已连接', tone: 'ok' },
  'bridge-disconnected': { text: '已断开', tone: 'bad' },
  'runtime-exited': { text: '内核退出', tone: 'bad' },
  failed: { text: '失败', tone: 'bad' },
}

const props = defineProps<{
  category: SettingsCategory
  themeChoice: ThemeChoice
  view: SidebarViewState
}>()

const emit = defineEmits<{
  'update:themeChoice': [choice: ThemeChoice]
  patchView: [patch: Partial<SidebarViewState>]
}>()

// Template globals: window is not reachable from template expressions.
const version = window.coded.version
const platform = window.coded.platform

// ---- Backend pane state (self-contained; one instance) ----
const backend = ref<{ id: string; label: string } | null>(null)
const caps = ref<string[]>([])
const status = ref<BridgeStatus>('starting')
const restarting = ref(false)

void bridge.backend().then((b) => (backend.value = b)).catch(() => {})
void bridge.capabilities().then((c) => (caps.value = c)).catch(() => {})
void bridge.status().then((s) => (status.value = s)).catch(() => {})
const offStatus = bridge.onStatus((s) => (status.value = s))
onUnmounted(offStatus)

function restart(): void {
  if (restarting.value) return
  restarting.value = true
  void bridge
    .restartBackend()
    .catch(() => {})
    .finally(() => setTimeout(() => (restarting.value = false), 1500))
}
</script>

<template>
  <main class="settings-pane" aria-label="设置">
    <div class="set-column">
      <h1 class="set-title">{{ CATEGORY_TITLE[category] }}</h1>

      <template v-if="category === 'appearance'">
        <div class="set-card">
          <div class="set-card-main">
            <div class="set-card-title">主题</div>
            <div class="set-card-desc">
              选择应用的配色。跟随系统时，浅色/深色随操作系统的外观设置实时切换。
            </div>
          </div>
          <div class="set-card-control">
            <Dropdown
              :options="THEME_OPTIONS"
              :value="themeChoice"
              :searchable="false"
              fit-content
              @change="
                (id) => {
                  if (id === 'system' || id === 'light' || id === 'dark') emit('update:themeChoice', id)
                }
              "
            />
          </div>
        </div>
      </template>

      <template v-else-if="category === 'sessions'">
        <div class="set-card">
          <div class="set-card-main">
            <div class="set-card-title">分组方式</div>
            <div class="set-card-desc">侧栏会话列表按工作区分组，或折叠为单列。</div>
          </div>
          <div class="set-card-control">
            <Dropdown
              :options="[
                { id: 'workspace', label: '按工作区' },
                { id: 'flat', label: '单列表' },
              ]"
              :value="view.groupBy"
              :searchable="false"
              fit-content
              @change="(id) => emit('patchView', { groupBy: id === 'flat' ? 'flat' : 'workspace' })"
            />
          </div>
        </div>
        <div class="set-card">
          <div class="set-card-main">
            <div class="set-card-title">排序方式</div>
            <div class="set-card-desc">按最近更新排序，或保持列表的手动顺序。</div>
          </div>
          <div class="set-card-control">
            <Dropdown
              :options="[
                { id: 'updated', label: '最近更新' },
                { id: 'manual', label: '手动排序' },
              ]"
              :value="view.orderBy"
              :searchable="false"
              fit-content
              @change="(id) => emit('patchView', { orderBy: id === 'manual' ? 'manual' : 'updated' })"
            />
          </div>
        </div>
      </template>

      <template v-else-if="category === 'backend'">
        <div class="set-card">
          <div class="set-card-main">
            <div class="set-card-title">当前适配器</div>
            <div class="set-card-desc">
              {{
                backend === null
                  ? '尚未加载任何后端适配器。'
                  : `以插件形式加载的后端绑定：${backend.label}（id: ${backend.id}）。`
              }}
            </div>
          </div>
          <div class="set-card-control">
            <span :class="`set-badge ${STATUS_LABEL[status].tone}`">{{ STATUS_LABEL[status].text }}</span>
          </div>
        </div>
        <div class="set-card">
          <div class="set-card-main">
            <div class="set-card-title">协议能力</div>
            <div class="set-card-desc">
              {{
                caps.length === 0
                  ? '适配器尚未声明能力（握手前或空集）。'
                  : `适配器在握手中声明：${caps.join('、')}。`
              }}
            </div>
          </div>
        </div>
        <div class="set-card">
          <div class="set-card-main">
            <div class="set-card-title">适配器目录</div>
            <div class="set-card-desc">
              按顺序扫描：用户目录 adapters/ → CODED_ADAPTERS_DIR →
              开发检出 ../coded-adapter/packages/backend。放置含 coded.backend.json
              的插件目录即可被发现。
            </div>
          </div>
        </div>
        <div class="set-card">
          <div class="set-card-main">
            <div class="set-card-title">重启后端</div>
            <div class="set-card-desc">
              停止当前绑定并重新拉起（指数退避由壳管理）。桥断开期间聊天输入不可用，重连后自动恢复。
            </div>
          </div>
          <div class="set-card-control">
            <button type="button" class="set-btn" :disabled="restarting" @click="restart">
              {{ restarting ? '重启中…' : '重启' }}
            </button>
          </div>
        </div>
      </template>

      <template v-else>
        <div class="set-card">
          <div class="set-card-main">
            <div class="set-card-title">应用版本</div>
            <div class="set-card-desc">{{ version }}</div>
          </div>
        </div>
        <div class="set-card">
          <div class="set-card-main">
            <div class="set-card-title">运行平台</div>
            <div class="set-card-desc">{{ platform }}</div>
          </div>
        </div>
        <div class="set-card">
          <div class="set-card-main">
            <div class="set-card-title">CodedBridge 协议</div>
            <div class="set-card-desc">
              proto {{ String(BRIDGE_PROTOCOL_VERSION) }}（通道模型：hello / query / control / stream）。
            </div>
          </div>
        </div>
      </template>
    </div>
  </main>
</template>
