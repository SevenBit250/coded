<script setup lang="ts">
import { ref, watch } from 'vue'
import Icon from '@uibase/Icon/Icon.vue'
import type { PendingApproval } from '../../bridge/session-store'
import '../styles/gate.css'

/**
 * ApprovalCard — the tool-permission interaction card (reference: ZCode's
 * permission card, from its renderer bundle): a small "需要权限" header with
 * the tool chip, the reason and the arguments preview, then a NUMBERED
 * option list (允许 / 拒绝, each with a one-line description), a keyboard
 * hint, and a trailing 确认. Rendered by Main in the composer anchor — the
 * answer replaces the composer, exactly like the question gates.
 *
 * Interaction follows the reference: clicking an option commits it (focus
 * selects first), digits 1/2 commit from the keyboard, arrows/Tab move the
 * selection, Enter commits the selected row. Row visuals live in the shared
 * gate.css family (same family as the question card).
 */
const props = defineProps<{
  pending: PendingApproval
}>()

const emit = defineEmits<{ answer: [outcome: 'allowed-once' | 'rejected'] }>()

/** Allow variants first, then deny (the reference's option order). */
const OPTIONS = [
  { outcome: 'allowed-once', label: '允许', description: '仅允许这一次' },
  { outcome: 'rejected', label: '拒绝', description: '这次先拒绝' },
] as const

const selected = ref(0)
const optionEls: (HTMLButtonElement | null)[] = []

function setOptionRef(index: number, node: unknown): void {
  if (node instanceof HTMLButtonElement) optionEls[index] = node
}

watch(selected, (index) => optionEls[index]?.focus())

function respond(index: number): void {
  emit('answer', OPTIONS[index]?.outcome ?? 'allowed-once')
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === '1' || event.key === '2') {
    event.preventDefault()
    respond(Number(event.key) - 1)
    return
  }
  switch (event.key) {
    case 'ArrowDown':
    case 'ArrowRight':
    case 'Tab':
      event.preventDefault()
      selected.value = (selected.value + 1) % OPTIONS.length
      return
    case 'ArrowUp':
    case 'ArrowLeft':
      event.preventDefault()
      selected.value = (selected.value + OPTIONS.length - 1) % OPTIONS.length
      return
    case 'Enter':
      event.preventDefault()
      respond(selected.value)
      return
    default:
      return
  }
}
</script>

<template>
  <div class="gate-panel" role="group" aria-label="需要权限" @keydown="onKeydown">
    <div class="gate-panel-head">
      <span class="gate-panel-title">需要权限</span>
      <span class="gate-panel-tool">{{ pending.toolName }}</span>
    </div>
    <p v-if="pending.reason !== undefined" class="gate-panel-reason">{{ pending.reason }}</p>
    <pre v-if="pending.argsSummary !== undefined" class="gate-panel-args">{{ pending.argsSummary }}</pre>
    <div class="gate-rows" role="listbox" aria-label="处理方式">
      <button
        v-for="(opt, i) in OPTIONS"
        :key="opt.outcome"
        :ref="(node) => setOptionRef(i, node)"
        type="button"
        role="option"
        :aria-selected="i === selected"
        :tabindex="i === selected ? 0 : -1"
        :class="['gate-row', i === selected ? 'is-selected' : '']"
        @click="respond(i)"
        @focus="selected = i"
      >
        <span class="gate-row-index">{{ i + 1 }}.</span>
        <span class="gate-row-main">
          <span class="gate-row-label">{{ opt.label }}</span>
          <span class="gate-row-desc">{{ opt.description }}</span>
        </span>
      </button>
    </div>
    <div class="gate-foot">
      <span class="gate-hint">
        <Icon class="gate-hint-icon">
          <path d="M10 8h.01M12 12h.01M14 8h.01M16 12h.01M18 8h.01M6 8h.01M7 16h10m-9-4h.01" />
          <rect width="20" height="16" x="2" y="4" rx="2" />
        </Icon>
        <span>使用 Tab / 上下键选择，回车确认</span>
      </span>
      <button type="button" class="gate-confirm" @click="respond(selected)">确认</button>
    </div>
  </div>
</template>
