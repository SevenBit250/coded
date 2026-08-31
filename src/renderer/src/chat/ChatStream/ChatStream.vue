<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useVirtualizer } from '@tanstack/vue-virtual'
import './ChatStream.css'
import UserBubble from '../UserBubble/UserBubble.vue'
import WorkCard from '../WorkCard/WorkCard.vue'
import type { ChatMessage } from '../../bridge/session-store'

/**
 * ChatStream — the transcript view over semantic transcript items (§2.3),
 * window-rendered by @tanstack/vue-virtual (headless: we render the scroll
 * container, the total-size spacer, and absolutely-positioned segments).
 * Virtual items are SEGMENTS: a user bubble or a work card (one AI turn:
 * header + step folds + answer text). Answerable gates (approval/question)
 * do NOT live here — they replace the composer in Main's anchor, the
 * reference interaction.
 *
 * Chat-mode behaviors, native to the virtualizer:
 *  - anchorTo 'end' + followOnAppend 'auto' — stick to the bottom while the
 *    user is at the bottom (new segments), stop following the moment they
 *    scroll up;
 *  - gap — inter-segment spacing inside the virtualizer's size math;
 *  - measureElement — dynamic heights (markdown, fold expansion) with
 *    scroll-position correction on size change (the "推挤" fix);
 *  - getDistanceFromEnd — the "回到底部" pill threshold.
 * The conversation-column horizontal padding contract stays as CSS on the
 * container (the scrollbar hugs the panel edge).
 */
const props = withDefaults(
  defineProps<{
    messages: ChatMessage[]
    /** Seconds elapsed on the running turn (present only while one runs). */
    runningSec?: number | null
    /** Measured wall-clock span of the most recently finished turn. */
    lastTurnMs?: number | null
  }>(),
  { runningSec: null, lastTurnMs: null },
)

const scrollEl = ref<HTMLElement | null>(null)

// Segment into turn groups: everything after a user message belongs to that
// message's turn. The last group carries the live clock / finished duration.
interface WorkSegment {
  type: 'turn'
  key: string
  running: boolean
  elapsedSec: number | null
  doneMs: number | null
  /** Wall clock of the user message that started this turn (restored-
   *  duration anchor; same send→done semantics as the live clock). */
  startedAt: number | null
  items: ChatMessage[]
}
interface UserSegment {
  type: 'user'
  key: string
  message: ChatMessage
}
type ChatListItem = WorkSegment | UserSegment

const segments = computed<ChatListItem[]>(() => {
  const out: ChatListItem[] = []
  let group: ChatMessage[] = []
  let groupStart = 0
  let turnStart: number | null = null
  props.messages.forEach((message, index) => {
    if (message.kind === 'user') {
      if (group.length > 0) {
        out.push({
          type: 'turn',
          key: `turn-${groupStart}`,
          running: false,
          elapsedSec: null,
          doneMs: null,
          startedAt: turnStart,
          items: group,
        })
      }
      group = []
      out.push({ type: 'user', key: `user-${message.id}`, message })
      groupStart = index + 1
      turnStart = typeof message.time === 'number' ? message.time : null
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
      startedAt: turnStart,
      items: group,
    })
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
            :started-at="(segmentAt(virtualRow.index) as WorkSegment).startedAt"
            :items="(segmentAt(virtualRow.index) as WorkSegment).items"
          />
        </div>
      </div>
    </div>
    <button
      v-if="rowVirtualizer.getDistanceFromEnd() > 240"
      type="button"
      class="chat-jump"
      aria-label="滚动到底部"
      @click="rowVirtualizer.scrollToEnd({ behavior: 'smooth' })"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8">
          <path d="m6 9 6 6 6-6" />
        </g>
      </svg>
    </button>
  </div>
</template>
