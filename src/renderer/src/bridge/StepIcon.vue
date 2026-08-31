<script setup lang="ts">
import { computed, h } from 'vue'
import { LUCIDE } from './step-icons'
import type { StepIconKind } from './step-icons'

const props = defineProps<{ kind: StepIconKind }>()

/** Render one Lucide body inside the shared 24-grid line wrapper. */
const body = computed(() => LUCIDE[props.kind])
const line = computed(() =>
  h(
    'g',
    {
      fill: 'none',
      stroke: 'currentColor',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'stroke-width': 1.6,
    },
    [body.value],
  ),
)
</script>

<template>
  <svg class="step-ico" viewBox="0 0 24 24" aria-hidden="true">
    <component :is="line" />
  </svg>
</template>
