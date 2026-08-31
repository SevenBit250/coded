<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import './ChatStream.css'
import TranscriptRow from '../TranscriptRow/TranscriptRow.vue'
import WorkCard from '../WorkCard/WorkCard.vue'
import ApprovalCard from '../ApprovalCard/ApprovalCard.vue'
import QuestionCard from '../QuestionCard/QuestionCard.vue'
import type { PendingApproval, PendingQuestion, ChatMessage } from '../../bridge/session-store'

/**
 * ChatStream — the transcript view over semantic transcript items (§2.3):
 * user content right (light bubble), assistant markdown left as plain text
 * flow (reference style — no card). Everything after a user message forms
 * that message's TURN GROUP: step rows (reasoning + tool calls) fold under
 * a single group header — "工作中 N 秒" while the turn runs, then
 * "已工作 N 秒" with a collapse chevron (collapsed by default, the answer
 * text stays visible). Auto-scrolls to the newest entry; the reference's
 * "回到底部" pill appears when the viewport is 240px+ above the tail.
 * Answerable gates (approvals/questions) render at the tail via props.
 */
const props = withDefaults(
  defineProps<{
    messages: ChatMessage[]
    /** Bumped when the trailing children change identity (e.g. gate count). */
    trailTick?: number
    /** Seconds elapsed on the running turn (present only while one runs). */
    runningSec?: number | null
    /** Measured wall-clock span of the most recently finished turn. */
    lastTurnMs?: number | null
    pendingApprovals: PendingApproval[]
    pendingQuestions: PendingQuestion[]
    activeSessionId: string | null
  }>(),
  { trailTick: 0, runningSec: null, lastTurnMs: null },
)

const emit = defineEmits<{
  approve: [pending: PendingApproval, outcome: 'allowed-once' | 'rejected']
  submitQuestion: [pending: PendingQuestion, answers: { id: string; selected: string[]; custom?: string }[]]
  cancelQuestion: [pending: PendingQuestion]
}>()

const streamEl = ref<HTMLDivElement | null>(null)
const endEl = ref<HTMLElement | null>(null)
const jumpVisible = ref(false)

watch(
  () => [props.messages, props.trailTick] as const,
  () => {
    endEl.value?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  },
)

function onScroll(): void {
  const el = streamEl.value
  if (el === null) return
  const fromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
  jumpVisible.value = fromBottom > 240
}

function jumpToBottom(): void {
  streamEl.value?.scrollTo({ top: streamEl.value.scrollHeight, behavior: 'smooth' })
}

onMounted(() => {
  endEl.value?.scrollIntoView({ block: 'end' })
})

// Segment into turn groups: everything after a user message belongs to that
// message's turn. The last group carries the live clock / finished duration.
interface Segment {
  key: string
  running: boolean
  elapsedSec: number | null
  doneMs: number | null
  items: ChatMessage[]
}
const segments = computed<Segment[]>(() => {
  const out: Segment[] = []
  let group: ChatMessage[] = []
  let groupStart = 0
  props.messages.forEach((message, index) => {
    if (message.kind === 'user') {
      if (group.length > 0) {
        out.push({ key: `turn-${groupStart}`, running: false, elapsedSec: null, doneMs: null, items: group })
      }
      group = []
      out.push({ key: `user-${message.id}`, running: false, elapsedSec: null, doneMs: null, items: [message] })
      groupStart = index + 1
      return
    }
    if (group.length === 0) groupStart = index
    group.push(message)
  })
  if (group.length > 0) {
    const running = props.runningSec != null
    out.push({
      key: `turn-${groupStart}`,
      running,
      elapsedSec: running ? (props.runningSec ?? null) : null,
      doneMs: running ? null : props.lastTurnMs,
      items: group,
    })
  }
  return out
})
</script>

<template>
  <div class="chat-stream-wrap">
    <div ref="streamEl" class="chat-stream" aria-label="会话消息" @scroll="onScroll">
      <template v-for="segment in segments" :key="segment.key">
        <TranscriptRow
          v-if="segment.items.length === 1 && segment.items[0]?.kind === 'user'"
          :message="segment.items[0]"
        />
        <WorkCard
          v-else
          :running="segment.running"
          :elapsed-sec="segment.elapsedSec"
          :done-ms="segment.doneMs"
          :items="segment.items"
        />
      </template>

      <ApprovalCard
        v-for="pending in pendingApprovals.filter((p) => p.sessionId === activeSessionId)"
        :key="pending.approvalId"
        :pending="pending"
        @answer="(outcome) => emit('approve', pending, outcome)"
      />
      <QuestionCard
        v-for="pending in pendingQuestions.filter((p) => p.sessionId === activeSessionId)"
        :key="pending.gateId"
        :pending="pending"
        @submit="(answers) => emit('submitQuestion', pending, answers)"
        @cancel="emit('cancelQuestion', pending)"
      />
      <div ref="endEl" />
    </div>
    <button
      v-if="jumpVisible"
      type="button"
      class="chat-jump"
      aria-label="滚动到底部"
      @click="jumpToBottom"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8">
          <path d="m6 9 6 6 6-6" />
        </g>
      </svg>
    </button>
  </div>
</template>
