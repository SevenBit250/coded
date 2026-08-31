<script setup lang="ts">
/**
 * Line-icon wrapper: `currentColor` stroke, no fill, round caps and joins.
 * Icons inherit the surrounding text color; sizing is the caller's CSS.
 * SVG children (paths/shapes) come through the default slot.
 * IRON RULE: icon path data is never hand-drawn — official sets only
 * (Lucide via iconify), see AGENTS.md.
 */
withDefaults(
  defineProps<{
    /** SVG viewBox. Defaults to the lucide 24 grid. */
    viewBox?: string
    /** Stroke width in viewBox units (lucide uses 2, the 16 set ~1.3). */
    strokeWidth?: number
    /** Extra class on the svg for app-side sizing/theming hooks. */
    className?: string
  }>(),
  { viewBox: '0 0 24 24', strokeWidth: 2, className: undefined },
)
</script>

<template>
  <svg :class="className" :viewBox="viewBox" aria-hidden="true">
    <g
      fill="none"
      stroke="currentColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      :stroke-width="strokeWidth"
    >
      <slot />
    </g>
  </svg>
</template>
