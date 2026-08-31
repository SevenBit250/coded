<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useVirtualizer } from '@tanstack/vue-virtual'
import './ChatStream.css'
import UserBubble from '../UserBubble/UserBubble.vue'
import WorkCard from '../WorkCard/WorkCard.vue'
import ApprovalCard from '../ApprovalCard/ApprovalCard.vue'
import QuestionCard from '../QuestionCard/QuestionCard.vue'
import type { PendingApproval, PendingQuestion, ChatMessage } from '../../bridge/session-store'

/**
 * ChatStream — the transcript view over semantic transcript items (§2.3),
 * window-rendered by @tanstack/vue-virtual (headless: we render the scroll
 * container, the total-size spacer, and absolutely-positioned segments).
 * Virtual items are SEGMENTS: a user bubble, a work card (one AI turn:
 * header + step folds + answer text), or a tail gate card.
 *
 * Chat-mode behaviors, native to the virtualizer:
 *  - anchorTo 'end' + followOnAppend 'auto' — stick to the bottom while the
 *    user is at the bottom (new segments), stop following the moment they
 *    scroll up;
 *  - gap / paddingStart / paddingEnd — spacing and --composer-h clearance
 *    reserved INSIDE the virtualizer's size math;
 *  - measureElement — dynamic heights (markdown, fold expansion) with
 *    scroll-position correction on size change (the "推挤" fix);
 *  - getDistanceFromEnd — the "回到底部" pill threshold.
 * The conversation-column horizontal padding contract stays as CSS on the
 * container (the scrollbar hugs the panel edge).
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

const scrollEl = ref<HTMLElement | null>(null)

// Segment into turn groups: everything after a user message belongs to that
// message's turn. The last group carries the live clock / finished duration.
interface WorkSegment {
  type: 'turn'
  key: string
  running: boolean
  elapsedSec: number | null
  doneMs: number | null
  items: ChatMessage[]
}
interface UserSegment {
  type: 'user'
  key: string
  message: ChatMessage
}
interface ApprovalSegment {
  type: 'approval'
  key: string
  pending: PendingApproval
}
interface QuestionSegment {
  type: 'question'
  key: string
  pending: PendingQuestion
}
type ChatListItem = WorkSegment | UserSegment | ApprovalSegment | QuestionSegment

const segments = computed<ChatListItem[]>(() => {
  const out: ChatListItem[] = []
  let group: ChatMessage[] = []
  let groupStart = 0
  props.messages.forEach((message, index) => {
    if (message.kind === 'user') {
      if (group.length > 0) {
        out.push({ type: 'turn', key: `turn-${groupStart}`, running: false, elapsedSec: null, doneMs: null, items: group })
      }
      group = []
      out.push({ type: 'user', key: `user-${message.id}`, message })
      groupStart = index + 1
      return
    }
    if (group.length === 0) groupStart = index
    group.push(message)
  })
  if (group.length > 0) {
    const running = props.runningSec != null
    out.push({
      type: 'turn',
      key: `turn-${groupStart}`,
      running,
      elapsedSec: running ? (props.runningSec ?? null) : null,
      doneMs: running ? null : props.lastTurnMs,
      items: group,
    })
  }
  // Gates ride at the tail as their own items.
  for (const pending of props.pendingApprovals.filter((p) => p.sessionId === props.activeSessionId)) {
    out.push({ type: 'approval', key: `gate-${pending.approvalId}`, pending })
  }
  for (const pending of props.pendingQuestions.filter((p) => p.sessionId === props.activeSessionId)) {
    out.push({ type: 'question', key: `gate-${pending.gateId}`, pending })
  }
  return out
})

/** Rough size hints keep initial offsets sane; real heights take over via
 *  measureElement. */
function estimateSize(index: number): number {
  const segment = segments.value[index]
  if (segment === undefined) return 120
  if (segment.type === 'user') return 60
  if (segment.type !== 'turn') return 180
  return Math.min(1200, 120 + segment.items.length * 90)
}

// Template-ref adapter for the virtualizer's dynamic measurement.
const measureElement = (node: unknown): void => {
  if (node instanceof HTMLDivElement) rowVirtualizer.value?.measureElement(node)
}

function segmentAt(index: number): ChatListItem | undefined {
  return segments.value[index]
}

const rowVirtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>(
  computed(() => ({
    count: segments.value.length,
    getScrollElement: () => scrollEl.value as HTMLDivElement,
    estimateSize,
    getItemKey: (index: number) => segments.value[index]?.key ?? String(index),
    overscan: 10,
    gap: 14,
    anchorTo: 'end' as const,
    followOnAppend: 'auto' as const,
    scrollEndThreshold: 240,
  })),
)

// Follow the tail while streaming: the running block GROWS in place (not an
// append), which followOnAppend does not cover — re-pin when the user is at
// the end.
const tailTextLength = computed(() => {
  const last = props.messages[props.messages.length - 1]
  if (last === undefined) return 0
  if (last.kind === 'assistant' || last.kind === 'reasoning') return last.text.length
  return 0
})
watch(tailTextLength, () => {
  const virtualizer = rowVirtualizer.value
  if (virtualizer === undefined) return
  if (virtualizer.getDistanceFromEnd() < 80) virtualizer.scrollToEnd()
})
</script>

<template>
  <div class="chat-stream-wrap">
    <div ref="scrollEl" class="chat-stream" aria-label="会话消息">
      <div
        :style="{
          height: `${rowVirtualizer.getTotalSize()}px`,
          position: 'relative',
          width: '100%',
        }"
      >
        <div
          v-for="virtualRow in rowVirtualizer.getVirtualItems()"
          :key="segments[virtualRow.index]?.key ?? String(virtualRow.key)"
          :ref="measureElement"
          :data-index="virtualRow.index"
          class="chat-item"
          :style="{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            transform: `translateY(${virtualRow.start}px)`,
          }"
        >
          <UserBubble v-if="segmentAt(virtualRow.index)?.type === 'user'" :message="(segmentAt(virtualRow.index) as UserSegment).message" />
          <WorkCard
            v-else-if="segmentAt(virtualRow.index)?.type === 'turn'"
            :running="(segmentAt(virtualRow.index) as WorkSegment).running"
            :elapsed-sec="(segmentAt(virtualRow.index) as WorkSegment).elapsedSec"
            :done-ms="(segmentAt(virtualRow.index) as WorkSegment).doneMs"
            :items="(segmentAt(virtualRow.index) as WorkSegment).items"
          />
          <ApprovalCard
            v-else-if="segmentAt(virtualRow.index)?.type === 'approval'"
            :pending="(segmentAt(virtualRow.index) as ApprovalSegment).pending"
            @answer="(outcome) => emit('approve', (segmentAt(virtualRow.index) as ApprovalSegment).pending, outcome)"
          />
          <QuestionCard
            v-else
            :pending="(segmentAt(virtualRow.index) as QuestionSegment).pending"
            @submit="(answers) => emit('submitQuestion', (segmentAt(virtualRow.index) as QuestionSegment).pending, answers)"
            @cancel="emit('cancelQuestion', (segmentAt(virtualRow.index) as QuestionSegment).pending)"
          />
        </div>
      </div>
    </div>
    <button
      v-if="rowVirtualizer.getDistanceFromEnd() > 240"
      type="button"
      class="chat-jump"
      aria-label="滚动到底部"
      @click="rowVirtualizer.scrollToEnd()"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8">
          <path d="m6 9 6 6 6-6" />
        </g>
      </svg>
    </button>
  </div>
</template>
