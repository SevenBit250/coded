<script lang="ts">
/** The settings categories, in nav order. */
export type SettingsCategory = 'appearance' | 'sessions' | 'backend' | 'about'

export const NAV: { group: string; items: { id: SettingsCategory; label: string }[] }[] = [
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
</script>

<script setup lang="ts">
import { Icon } from '@uibase/vue'

defineProps<{
  category: SettingsCategory
}>()

const emit = defineEmits<{
  select: [category: SettingsCategory]
  back: []
}>()
</script>

<template>
  <div>
    <button type="button" class="set-back" @click="emit('back')">
      <Icon viewBox="0 0 24 24" :stroke-width="1.8">
        <path d="m15 18-6-6 6-6" />
      </Icon>
      <span>返回工作区</span>
    </button>
    <div class="set-nav">
      <div v-for="group in NAV" :key="group.group" class="set-group">
        <div class="set-group-label">{{ group.group }}</div>
        <button
          v-for="item in group.items"
          :key="item.id"
          type="button"
          :class="`set-item${category === item.id ? ' active' : ''}`"
          @click="emit('select', item.id)"
        >
          <Icon v-if="item.id === 'appearance'">
            <!-- lucide:sun-moon -->
            <path d="M12 8a2.83 2.83 0 0 0 4 4 4 4 0 1 1-4-4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4" />
          </Icon>
          <Icon v-else-if="item.id === 'sessions'">
            <path d="M8 6h13M8 12h13M8 18h13" />
            <circle cx="4" cy="6" r="0.9" />
            <circle cx="4" cy="12" r="0.9" />
            <circle cx="4" cy="18" r="0.9" />
          </Icon>
          <Icon v-else-if="item.id === 'backend'">
            <!-- lucide:cpu -->
            <rect x="5" y="5" width="14" height="14" rx="2" />
            <rect x="9.5" y="9.5" width="5" height="5" rx="1" />
            <path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" />
          </Icon>
          <Icon v-else>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 16v-4M12 8h.01" />
          </Icon>
          <span>{{ item.label }}</span>
        </button>
      </div>
    </div>
  </div>
</template>
