<script setup lang="ts">
import { computed, ref } from 'vue'
import { Menu, MenuItem, Icon, Spinner } from '@uibase/vue'

/** Compact relative time for session rows (刚刚 / {n}分钟 / {n}小时 / {n}天). */
function relTime(minutesAgo: number): string {
  if (minutesAgo < 1) return '刚刚'
  if (minutesAgo < 60) return `${Math.round(minutesAgo)}分钟`
  const hours = minutesAgo / 60
  if (hours < 24) return `${Math.round(hours)}小时`
  const days = hours / 24
  return `${Math.round(days)}天`
}

/** One session row: fixed lead slot (spinner/dots), title, approval tag,
 *  recency, hover ⋯ menu. The row is a div[role=button] so the inline menu
 *  can nest real buttons. */
const props = defineProps<{
  session: {
    id: string
    title: string
    updatedMinutesAgo: number
    status: 'idle' | 'running' | 'interrupted'
    pending?: boolean
  }
  selected: boolean
}>()

const emit = defineEmits<{
  select: []
  action: [action: 'rename' | 'fork' | 'archive']
}>()

const menuOpen = ref(false)
const cls = computed(
  () => `session-row${props.selected ? ' selected' : ''}${menuOpen.value ? ' menu-open' : ''}`,
)

/** True when the event started inside the row's inline action zone. */
function fromActionZone(event: MouseEvent | KeyboardEvent): boolean {
  return ((event.target as HTMLElement).closest('.row-menu, .row-actions')) !== null
}

function onClick(event: MouseEvent): void {
  if (fromActionZone(event)) return
  emit('select')
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key !== 'Enter' && event.key !== ' ') return
  if (fromActionZone(event)) return
  event.preventDefault()
  emit('select')
}
</script>

<template>
  <div
    :class="cls"
    role="button"
    tabindex="0"
    :aria-pressed="selected"
    @click="onClick"
    @keydown="onKeyDown"
  >
    <span class="session-lead" aria-hidden="true">
      <Spinner v-if="session.status === 'running'" :size="12" className="session-spinner" />
      <span v-if="session.status === 'interrupted'" class="session-dot session-dot--stopped" />
    </span>
    <span class="session-title">{{ session.title }}</span>
    <span v-if="session.pending === true" class="session-flag">需要确认</span>
    <span class="session-time">{{ relTime(session.updatedMinutesAgo) }}</span>
    <Menu
      class="row-menu"
      portal
      card-class-name="row-menu-card"
      @open-change="(o) => (menuOpen = o)"
    >
      <template #trigger="{ open, toggle }">
        <button
          type="button"
          class="row-action"
          aria-label="会话操作"
          aria-haspopup="menu"
          :aria-expanded="open"
          @click="toggle"
        >
          <Icon viewBox="0 0 16 16" :stroke-width="1.7">
            <circle cx="3.4" cy="8" r="0.7" />
            <circle cx="8" cy="8" r="0.7" />
            <circle cx="12.6" cy="8" r="0.7" />
          </Icon>
        </button>
      </template>
      <MenuItem @click="emit('action', 'rename')">重命名</MenuItem>
      <MenuItem @click="emit('action', 'fork')">分叉会话</MenuItem>
      <MenuItem @click="emit('action', 'archive')">归档会话</MenuItem>
    </Menu>
  </div>
</template>
