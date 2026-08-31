<script setup lang="ts">
import './WindowControls.css'

/** WindowControls emits the platform window ops; the host wires them. */
defineEmits<{
  minimize: []
  maximize: []
  close: []
}>()
</script>

<template>
  <div class="controls no-drag">
    <button class="ctl" title="最小化" aria-label="最小化" @click="$emit('minimize')">
      <svg viewBox="0 0 12 12" aria-hidden="true">
        <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.3">
          <line x1="2" y1="6" x2="10" y2="6" />
        </g>
      </svg>
    </button>
    <button class="ctl" title="最大化" aria-label="最大化" @click="$emit('maximize')">
      <svg viewBox="0 0 12 12" aria-hidden="true">
        <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.3">
          <rect x="2.5" y="2.5" width="7" height="7" rx="1" />
        </g>
      </svg>
    </button>
    <button class="ctl danger" title="关闭" aria-label="关闭" @click="$emit('close')">
      <svg viewBox="0 0 12 12" aria-hidden="true">
        <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.3">
          <path d="M3 3l6 6M9 3l-6 6" />
        </g>
      </svg>
    </button>
  </div>
</template>
