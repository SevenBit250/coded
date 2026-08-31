<script setup lang="ts">
import { computed, ref } from 'vue'
import StepIcon from './StepIcon.vue'
import type { ChatMessage } from './session-store'

/** One collapsible reasoning row. Default COLLAPSED in every state: while
 *  streaming the head shows "正在思考 · 〈live tail of the text〉", once done
 *  "思考 · 持续了 N 秒"; clicking expands the text behind the shared body
 *  rule. `tick` re-renders the live duration once a second while the turn
 *  runs. */
const props = defineProps<{ message: ChatMessage; tick?: number | null }>()

const open = ref(false)

// Template/computed narrowing: pin the reasoning variant up front.
const reasoning = computed(() => (props.message.kind === 'reasoning' ? props.message : undefined))
const streaming = computed(() => reasoning.value?.streaming === true)
const elapsed = computed(() => {
  void props.tick
  return streaming.value && reasoning.value?.startedAt !== undefined
    ? Math.max(0, Math.floor((Date.now() - (reasoning.value?.startedAt ?? 0)) / 1000))
    : undefined
})
const duration = computed(() =>
  reasoning.value?.durationMs !== undefined
    ? Math.max(1, Math.round(reasoning.value.durationMs / 1000))
    : undefined,
)
const meta = computed(() =>
  streaming.value
    ? elapsed.value !== undefined
      ? `持续了 ${elapsed.value} 秒`
      : undefined
    : duration.value !== undefined
      ? `持续了 ${duration.value} 秒`
      : undefined,
)
const snippet = computed(() => {
  const text = reasoning.value?.text ?? ''
  return text === '' ? undefined : `…${text.slice(-72)}`
})
</script>

<template>
  <div v-if="reasoning !== undefined" class="chat-row chat-row--assistant">
    <div :class="`reasoning-card${streaming ? ' reasoning-card--streaming' : ''}`">
      <button type="button" class="tool-head" :aria-expanded="open" @click="open = !open">
        <StepIcon kind="think" />
        <template v-if="streaming && !open">
          <span class="tool-label">正在思考</span>
          <span v-if="snippet !== undefined" class="think-snippet">{{ snippet }}</span>
        </template>
        <template v-else>
          <span class="tool-label">思考</span>
          <span v-if="meta !== undefined" class="tool-meta">{{ meta }}</span>
        </template>
        <svg
          :class="`fold-chev${open ? ' fold-chev--open' : ''}`"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8">
            <!-- lucide:chevron-right -->
            <path d="m9 18 6-6-6-6" />
          </g>
        </svg>
      </button>
      <div v-if="open" class="tool-body">
        <pre class="tool-pre reasoning-text">{{ reasoning.text }}</pre>
      </div>
    </div>
  </div>
</template>
