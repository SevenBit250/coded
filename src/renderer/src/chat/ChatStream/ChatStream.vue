<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { VList } from 'virtua/vue'
import type { VListHandle } from 'virtua/vue'
import './ChatStream.css'
import UserBubble from '../UserBubble/UserBubble.vue'
import WorkCard from '../WorkCard/WorkCard.vue'
import ApprovalCard from '../ApprovalCard/ApprovalCard.vue'
import QuestionCard from '../QuestionCard/QuestionCard.vue'
import type { PendingApproval, PendingQuestion, ChatMessage } from '../../bridge/session-store'

/**
 * ChatStream — the transcript view over semantic transcript items (§2.3),
 * window-rendered by virtua's VList. Virtual items are SEGMENTS: a user
 * bubble, a work card (one AI turn: header + step folds + answer text), or
 * a tail gate card. Behaviors preserved against the non-virtual scroller:
 * the conversation-column padding contract lives on the VList container,
 * bottom padding clears the floating composer (--composer-h), stick-to-
 * bottom follows the tail only while the user is at the bottom (no program
 * scrolling after they scroll up), and the "回到底部" pill appears 240px+
 * from the bottom.
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

const listRef = ref<VListHandle>()
const jumpVisible = ref(false)
/** Stick-to-bottom gate: once the user scrolls up, stop following. */
const atBottom = ref(true)

function onScroll(): void {
  const handle = listRef.value
  if (handle === undefined) return
  const fromBottom = handle.scrollSize - handle.scrollOffset - handle.viewportSize
  jumpVisible.value = fromBottom > 240
  atBottom.value = fromBottom < 80
}

function jumpToBottom(): void {
  const handle = listRef.value
  if (handle === undefined) return
  handle.scrollTo(handle.scrollSize)
}

/** Snap to the bottom without animation — the streaming跟随 primitive. */
function stickToBottom(): void {
  if (!atBottom.value) return
  const handle = listRef.value
  if (handle === undefined) return
  handle.scrollTo(handle.scrollSize)
}

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

// Follow the tail while the user is at the bottom: on new segments and on
// the running block's text growth (deltas are rAF-coalesced in the store,
// so this fires once per frame at most).
watch(
  () => segments.value.length,
  () => {
    void nextTick(stickToBottom)
  },
)
const tailTextLength = computed(() => {
  const last = props.messages[props.messages.length - 1]
  if (last === undefined) return 0
  if (last.kind === 'assistant' || last.kind === 'reasoning') return last.text.length
  return 0
})
watch(tailTextLength, () => {
  void nextTick(stickToBottom)
})
watch(
  () => props.trailTick,
  () => {
    void nextTick(stickToBottom)
  },
)
</script>

<template>
  <div class="chat-stream-wrap">
    <VList
      ref="listRef"
      class="chat-stream"
      :data="segments"
      :buffer-size="600"
      aria-label="会话消息"
      @scroll="onScroll"
    >
      <template #default="{ item }">
        <div class="chat-item">
          <UserBubble v-if="item.type === 'user'" :message="item.message" />
          <WorkCard
            v-else-if="item.type === 'turn'"
            :running="item.running"
            :elapsed-sec="item.elapsedSec"
            :done-ms="item.doneMs"
            :items="item.items"
          />
          <ApprovalCard
            v-else-if="item.type === 'approval'"
            :pending="item.pending"
            @answer="(outcome) => emit('approve', item.pending, outcome)"
          />
          <QuestionCard
            v-else
            :pending="item.pending"
            @submit="(answers) => emit('submitQuestion', item.pending, answers)"
            @cancel="emit('cancelQuestion', item.pending)"
          />
        </div>
      </template>
    </VList>
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
