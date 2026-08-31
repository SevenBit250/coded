<script setup lang="ts">
import { computed, ref } from 'vue'
import { Menu, MenuItem, Icon } from '@uibase'

/** One workspace group header row: folder-open/closed carries the collapse
 *  state; hover reveals the ⋯ menu (rename/delete) and the + new-session
 *  button. The row is a div[role=button] so the inline actions can nest
 *  real buttons. */
const props = defineProps<{
  workspace: { id: string; title: string }
  collapsed: boolean
}>()

const emit = defineEmits<{
  toggle: []
  newSession: []
  action: [action: 'rename' | 'delete']
}>()

const menuOpen = ref(false)
const cls = computed(() => `project${menuOpen.value ? ' menu-open' : ''}`)

function fromActionZone(event: MouseEvent | KeyboardEvent): boolean {
  return ((event.target as HTMLElement).closest('.row-menu, .row-actions')) !== null
}

function onClick(event: MouseEvent): void {
  if (fromActionZone(event)) return
  emit('toggle')
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key !== 'Enter' && event.key !== ' ') return
  if (fromActionZone(event)) return
  event.preventDefault()
  emit('toggle')
}
</script>

<template>
  <div :class="cls" role="button" tabindex="0" :aria-expanded="!collapsed" @click="onClick" @keydown="onKeyDown">
    <span class="project-name">
      <Icon className="folder" viewBox="0 0 24 24" :stroke-width="1.8">
        <path
          v-if="collapsed"
          d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"
        />
        <path
          v-else
          d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"
        />
      </Icon>
      {{ workspace.title }}
    </span>
    <span class="row-actions">
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
            aria-label="工作区操作"
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
        <MenuItem danger @click="emit('action', 'delete')">删除工作区</MenuItem>
      </Menu>
      <button type="button" class="row-action" aria-label="新建会话" @click="emit('newSession')">
        <Icon viewBox="0 0 16 16" :stroke-width="1.4">
          <path d="M8 3.5v9M3.5 8h9" />
        </Icon>
      </button>
    </span>
  </div>
</template>
