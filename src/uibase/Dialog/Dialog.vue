<script setup lang="ts">
import { watch, onUnmounted } from 'vue'
import './Dialog.css'

/** Modal dialog: dimmed overlay plus a centered card. Closes on overlay
 *  pointer-down and Escape; clicks inside the card do not close it. */
const props = defineProps<{
  /** Whether the dialog is mounted. */
  open: boolean
  /** Accessible dialog name (aria-label). */
  label: string
}>()

const emit = defineEmits<{ close: [] }>()

function onKey(event: KeyboardEvent): void {
  if (event.key === 'Escape') emit('close')
}

watch(
  () => props.open,
  (open) => {
    if (open) window.addEventListener('keydown', onKey)
    else window.removeEventListener('keydown', onKey)
  },
  { immediate: true },
)

onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div v-if="open" class="ui-dialog-overlay" role="presentation" @mousedown="emit('close')">
    <div
      class="ui-dialog-card"
      role="dialog"
      aria-modal="true"
      :aria-label="label"
      @mousedown.stop
    >
      <slot />
    </div>
  </div>
</template>
