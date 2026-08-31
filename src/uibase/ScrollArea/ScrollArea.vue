<script lang="ts">
export interface ScrollAreaProps {
  /** Extra class on the root wrapper (app-side sizing/layout). */
  className?: string
  /** Thumb thickness while visible (px). */
  size?: number
  /** Hover variant thickness (px). */
  hoverSize?: number
  /** Minimum thumb height (px). */
  minThumb?: number
  /** Fade-out delay after scrolling stops (ms). */
  idleDelay?: number
  /** Axis to show; vertical is the common case. */
  axis?: 'y' | 'x'
  /** aria-label for the scrollable region. */
  label?: string
  /** Push the thumb this many pixels PAST the container's right edge so it
   *  can hug an outer seam (e.g. the split sash beside a sidebar pane). */
  outside?: number
}
</script>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import './ScrollArea.css'

const props = withDefaults(defineProps<ScrollAreaProps>(), {
  className: undefined,
  size: 5,
  hoverSize: 8,
  minThumb: 28,
  idleDelay: 900,
  axis: 'y',
  label: undefined,
  outside: 0,
})

const viewportEl = ref<HTMLDivElement | null>(null)
const thumbH = ref(0)
const thumbTop = ref(0)
const visible = ref(false)
let idleTimer: number | null = null

function bump(): void {
  if (idleTimer !== null) clearTimeout(idleTimer)
  idleTimer = window.setTimeout(() => (visible.value = false), props.idleDelay)
}

function recalc(): void {
  const viewport = viewportEl.value
  if (viewport === null) return
  const { scrollHeight, clientHeight, scrollTop } = viewport
  if (scrollHeight <= clientHeight) {
    thumbH.value = 0
    visible.value = false
    return
  }
  const ratio = clientHeight / scrollHeight
  const h = Math.max(props.minThumb, Math.round(clientHeight * ratio))
  const maxTop = clientHeight - h
  const top = Math.round((scrollTop / (scrollHeight - clientHeight)) * maxTop)
  thumbH.value = h
  thumbTop.value = top
  visible.value = true
  bump()
}

let ro: ResizeObserver | null = null

onMounted(() => {
  const viewport = viewportEl.value
  if (viewport === null) return
  ro = new ResizeObserver(recalc)
  ro.observe(viewport)
  recalc()
})

onUnmounted(() => {
  ro?.disconnect()
  if (idleTimer !== null) clearTimeout(idleTimer)
})
</script>

<template>
  <div
    :class="`ui-scroll-area${className !== undefined ? ` ${className}` : ''}`"
    :style="{ '--ui-scroll-size': `${size}px`, '--ui-scroll-hover': `${hoverSize}px` }"
    @mouseenter="visible = true"
    @mouseleave="visible = false"
  >
    <div
      ref="viewportEl"
      class="ui-scroll-viewport"
      role="region"
      :aria-label="label"
      @scroll="recalc"
    >
      <slot />
    </div>
    <div
      v-if="axis === 'y' && thumbH > 0"
      :class="`ui-scroll-thumb${visible ? ' ui-scroll-thumb--on' : ''}${outside > 0 ? ' ui-scroll-thumb--outside' : ''}`"
      :style="{ height: `${thumbH}px`, top: `${thumbTop}px`, '--ui-scroll-outside': `${outside}px` }"
      aria-hidden="true"
    />
  </div>
</template>
