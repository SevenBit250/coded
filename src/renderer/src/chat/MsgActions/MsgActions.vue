<script setup lang="ts">
import { ref } from 'vue'

/** Hover action row under one message: copy + (timestamp when available). */
const props = defineProps<{ text: string }>()

const copied = ref(false)

function copy(): void {
  void navigator.clipboard.writeText(props.text).then(() => {
    copied.value = true
    setTimeout(() => (copied.value = false), 1200)
  })
}
</script>

<template>
  <div class="msg-actions">
    <button type="button" aria-label="复制内容" @click="copy">
      <span v-if="copied">已复制</span>
      <svg v-else viewBox="0 0 24 24" aria-hidden="true">
        <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6">
          <!-- lucide:copy -->
          <rect x="9" y="9" width="12" height="12" rx="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </g>
      </svg>
    </button>
  </div>
</template>
