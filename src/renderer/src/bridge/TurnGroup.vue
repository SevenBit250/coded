<script setup lang="ts">
import { computed, ref } from 'vue'
import TranscriptRow from './TranscriptRow.vue'
import type { ChatMessage } from './session-store'

/** One turn's fold: a quiet header ("工作中 N 秒" / "已工作 N 秒 ˅") over the
 *  turn's step rows. Open while the turn runs; collapsed once it ends (the
 *  answer text rows stay visible), click toggles. */
const props = defineProps<{
  running: boolean
  elapsedSec?: number | null
  doneMs?: number | null
  items: ChatMessage[]
}>()

const expanded = ref(false)
const open = computed(() => props.running || expanded.value)

const label = computed(() => {
  if (props.running) return `工作中 ${props.elapsedSec ?? 0} 秒`
  if (props.doneMs != null) {
    const s = Math.max(1, Math.round(props.doneMs / 1000))
    return s < 60 ? `已工作 ${s} 秒` : `已工作 ${Math.floor(s / 60)} 分 ${s % 60} 秒`
  }
  return '已工作'
})

const visible = computed(() =>
  open.value
    ? props.items
    : props.items.filter((m) => m.kind !== 'tool' && m.kind !== 'reasoning'),
)

function onHeadClick(): void {
  if (!props.running) expanded.value = !expanded.value
}
</script>

<template>
  <div class="turn-group">
    <button
      type="button"
      :class="`turn-head${running ? ' turn-head--running' : ''}`"
      :aria-expanded="open"
      @click="onHeadClick"
    >
      <span :class="`turn-head-label${running ? ' turn-head-label--running' : ''}`">{{ label }}</span>
      <svg v-if="!running" :class="`fold-chev${open ? ' fold-chev--open' : ''}`" viewBox="0 0 24 24" aria-hidden="true">
        <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8">
          <!-- lucide:chevron-right -->
          <path d="m9 18 6-6-6-6" />
        </g>
      </svg>
    </button>
    <div class="turn-steps">
      <TranscriptRow
        v-for="m in visible"
        :key="m.id"
        :message="m"
        :tick="running ? (elapsedSec ?? 0) : null"
      />
    </div>
  </div>
</template>
