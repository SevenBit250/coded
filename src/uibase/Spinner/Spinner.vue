<script setup lang="ts">
import './Spinner.css'

/** Indeterminate activity spinner: a faint full ring with a rotating arc.
 *  Inherits `currentColor`; drop it inline wherever a task is running. */
withDefaults(
  defineProps<{
    /** Square size in px. Defaults to the inline-list size (13). */
    size?: number
    /** Extra class on the svg for app-side sizing/theming hooks. */
    className?: string
  }>(),
  { size: 13, className: undefined },
)
</script>

<template>
  <svg
    :class="className !== undefined ? `ui-spinner ${className}` : 'ui-spinner'"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2.6" opacity="0.18" />
    <path
      class="ui-spinner-arc"
      d="M12 3a9 9 0 0 1 9 9"
      stroke="currentColor"
      stroke-width="2.6"
      stroke-linecap="round"
    />
  </svg>
</template>
