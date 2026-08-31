<script setup lang="ts">
import { computed, ref } from 'vue'
import TranscriptRow from '../TranscriptRow/TranscriptRow.vue'
import type { ChatMessage } from '../../bridge/session-store'
import '../styles/fold.css'
import './WorkCard.css'

/** WorkCard — one AI turn's fold (was TurnGroup): a quiet header ("工作中 N
 *  秒" while the turn runs, "已工作 N 秒 ˅" after) over the turn's step rows
 *  (reasoning/tool/skill folds + answer text). Open while running; collapsed
 *  once it ends (answer text rows stay visible), click toggles. One work card
 *  = one virtual item in the transcript list. */
const props = defineProps<{
  running: boolean
  elapsedSec?: number | null
  doneMs?: number | null
  /** Wall clock of the user message that started this turn — the restored-
   *  duration lower bound (matches the live clock's send→done semantics). */
  startedAt?: number | null
  items: ChatMessage[]
}>()

const expanded = ref(false)
const open = computed(() => props.running || expanded.value)

/** Restored duration: the wire stamps items with the host log's wall clock
 *  (epoch ms); a turn's span runs from its user message (or earliest stamp)
 *  to its last stamp (tool endTime = the paired result). Reasoning and its
 *  answer share one log event's clock, so the user-message anchor is what
 *  keeps single-step turns measurable. Needs two stamps either way. */
const restoredMs = computed<number | null>(() => {
  if (props.running) return null
  const stamps: number[] = []
  if (typeof props.startedAt === 'number') stamps.push(props.startedAt)
  for (const m of props.items) {
    if (typeof m.time === 'number') stamps.push(m.time)
    if (m.kind === 'tool' && typeof m.endTime === 'number') stamps.push(m.endTime)
  }
  if (stamps.length < 2) return null
  return Math.max(0, Math.max(...stamps) - Math.min(...stamps))
})

const done = computed<number | null>(() => props.doneMs ?? restoredMs.value)

const label = computed(() => {
  if (props.running) return `工作中 ${props.elapsedSec ?? 0} 秒`
  if (done.value != null) {
    const s = Math.max(1, Math.round(done.value / 1000))
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
