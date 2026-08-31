<script setup lang="ts">
import { computed, ref } from 'vue'
import StepIcon from './StepIcon.vue'
import { toolCategory } from './step-icons'
import type { ChatMessage } from './session-store'

/** One collapsible tool-call row: icon + category label + summary; the raw
 *  args/result stay behind the fold. */
const props = defineProps<{ message: ChatMessage }>()

const open = ref(false)

// Template/computed narrowing: pin the tool variant up front.
const tool = computed(() => (props.message.kind === 'tool' ? props.message : undefined))
const cat = computed(() => toolCategory(tool.value?.title ?? '', tool.value?.argsText))
const expandable = computed(
  () => tool.value?.argsText !== undefined || tool.value?.resultText !== undefined,
)
</script>

<template>
  <div v-if="tool !== undefined" class="chat-row chat-row--assistant">
    <div :class="`tool-card${tool.status === 'running' ? ' tool-card--running' : ''}`">
      <button
        type="button"
        class="tool-head"
        :aria-expanded="open"
        @click="expandable && (open = !open)"
      >
        <StepIcon :kind="cat.icon" />
        <span class="tool-label">{{ cat.label }}</span>
        <span v-if="cat.summary !== undefined" class="tool-sum">{{ cat.summary }}</span>
        <svg
          v-if="expandable"
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
        <pre v-if="tool.argsText !== undefined" class="tool-pre">{{ tool.argsText }}</pre>
        <pre v-if="tool.resultText !== undefined" class="tool-pre">{{ tool.resultText }}</pre>
      </div>
    </div>
  </div>
</template>
