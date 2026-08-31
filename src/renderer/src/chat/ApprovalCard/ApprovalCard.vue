<script setup lang="ts">
import type { PendingApproval } from '../../bridge/session-store'
import '../styles/gate.css'

/** Tool-approval card: what is about to run, then allow-once / reject. */
defineProps<{
  pending: PendingApproval
}>()

const emit = defineEmits<{ answer: [outcome: 'allowed-once' | 'rejected'] }>()
</script>

<template>
  <div class="chat-row chat-row--assistant">
    <div class="gate-card" role="group" aria-label="工具调用确认">
      <div class="gate-head">
        <span class="gate-badge">需要确认</span>
        <span class="gate-title">{{ pending.toolName }}</span>
      </div>
      <p v-if="pending.reason !== undefined" class="gate-reason">{{ pending.reason }}</p>
      <pre v-if="pending.argsSummary !== undefined" class="gate-args">{{ pending.argsSummary }}</pre>
      <div class="gate-actions">
        <button type="button" class="gate-btn gate-btn--primary" @click="emit('answer', 'allowed-once')">
          允许一次
        </button>
        <button type="button" class="gate-btn gate-btn--danger" @click="emit('answer', 'rejected')">
          拒绝
        </button>
      </div>
    </div>
  </div>
</template>
