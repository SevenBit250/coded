<script setup lang="ts">
import { computed, useAttrs } from 'vue'
import MetaButton from '../MetaButton/MetaButton.vue'
import './Button.css'

/** Button props: MetaButton passthrough plus text-button sizing/variant. */
export interface ButtonProps {
  /** Visual weight: 'primary' (accent fill), 'secondary' (outline), 'ghost'. */
  variant?: 'primary' | 'secondary' | 'ghost'
  /** Height bucket; 'md' matches the composer toolbar pills. */
  size?: 'sm' | 'md' | 'lg'
  /** Stretch to the container width. */
  block?: boolean
  /** Extra class for app-side theming. */
  className?: string
}

const props = withDefaults(defineProps<ButtonProps>(), {
  variant: 'secondary',
  size: 'md',
  block: false,
  className: undefined,
})

// label/tip/shortcut/onClick/disabled/aria-* flow through to MetaButton.
const attrs = useAttrs()

const cls = computed(() =>
  [
    'ui-btn',
    `ui-btn--${props.variant}`,
    `ui-btn--${props.size}`,
    props.block ? 'ui-btn--block' : '',
    props.className ?? '',
  ]
    .filter((c) => c !== '')
    .join(' '),
)
</script>

<template>
  <!-- attrs carry label/tip/shortcut/onClick from the caller; the shape is
       caller-determined so the bind is cast (runtime passthrough is exact). -->
  <MetaButton v-bind="(attrs as any)" :class="cls">
    <slot />
  </MetaButton>
</template>
