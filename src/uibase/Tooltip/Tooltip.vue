<script lang="ts">
/**
 * Where the bubble sits relative to its anchor: a side (top/bottom/left/
 * right, centered on that side) or a side with an edge alignment —
 * 'top-left' means above the anchor with the bubble's left edge lined up
 * with the anchor's left edge.
 */
export type TooltipPlacement =
  | 'top'
  | 'bottom'
  | 'left'
  | 'right'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'

export interface TooltipProps {
  /** Bubble text. */
  label: string
  /** Optional keyboard shortcut, shown dimmed after the label. */
  shortcut?: string
  /** Preferred placement; flips when it would leave the viewport. */
  placement?: TooltipPlacement
  /** Hover intent delay before showing (ms). Keyboard focus shows at once. */
  delay?: number
  /** Extra class for app-side theming (applied to the bubble). */
  className?: string
}
</script>

<script setup lang="ts">
import { nextTick, onUnmounted, ref, watch } from 'vue'
import './Tooltip.css'

const props = withDefaults(defineProps<TooltipProps>(), {
  placement: 'top',
  delay: 150,
  shortcut: undefined,
  className: undefined,
})

/** Anchor↔bubble gap and the viewport margin kept on every side (px). */
const GAP = 8
const MARGIN = 8

interface Point {
  x: number
  y: number
}

/** Fixed-position point for the bubble, flipped and clamped to the viewport. */
function place(anchor: DOMRect, tipW: number, tipH: number, placement: TooltipPlacement): Point {
  const [side, align] = placement.split('-')
  const vw = window.innerWidth
  const vh = window.innerHeight

  let x =
    align === 'left'
      ? anchor.left
      : align === 'right'
        ? anchor.right - tipW
        : anchor.left + anchor.width / 2 - tipW / 2
  let y = anchor.top + anchor.height / 2 - tipH / 2

  if (side === 'top') y = anchor.top - GAP - tipH
  else if (side === 'bottom') y = anchor.bottom + GAP
  else if (side === 'left') x = anchor.left - GAP - tipW
  else x = anchor.right + GAP

  if (side === 'top' && y < MARGIN) y = anchor.bottom + GAP
  else if (side === 'bottom' && y + tipH > vh - MARGIN) y = anchor.top - GAP - tipH
  if (side === 'left' && x < MARGIN) x = anchor.right + GAP
  else if (side === 'right' && x + tipW > vw - MARGIN) x = anchor.left - GAP - tipW

  x = Math.min(Math.max(x, MARGIN), Math.max(MARGIN, vw - MARGIN - tipW))
  y = Math.min(Math.max(y, MARGIN), Math.max(MARGIN, vh - MARGIN - tipH))

  return { x, y }
}

const anchorEl = ref<HTMLSpanElement | null>(null)
const tipEl = ref<HTMLDivElement | null>(null)
let timer: number | null = null
// `open` is the target visibility; `mounted` keeps the bubble in the DOM
// for the exit animation after `open` flips false.
const open = ref(false)
const mounted = ref(false)
const pos = ref<Point | null>(null)

let idCounter = 0
const id = `ui-tip-${idCounter++}`

function show(): void {
  mounted.value = true
  open.value = true
}
function hide(): void {
  open.value = false
}
function handleEnter(): void {
  timer = window.setTimeout(show, props.delay)
}
/** Leave and click both dismiss; a pending show timer must not fire later. */
function dismiss(): void {
  if (timer !== null) {
    clearTimeout(timer)
    timer = null
  }
  hide()
}

// Two-pass placement: the bubble mounts hidden, is measured, then lands at
// its point — after one DOM flush, so no hidden frame paints. While closing,
// the last position is kept so the exit animation plays in place.
watch(
  [open, () => props.placement, () => props.label, () => props.shortcut],
  ([o]) => {
    if (!o) return
    void nextTick(() => {
      const anchor = anchorEl.value
      const tip = tipEl.value
      if (anchor === null || tip === null) return
      const rect = anchor.getBoundingClientRect()
      pos.value = place(rect, tip.offsetWidth, tip.offsetHeight, props.placement)
    })
  },
  { immediate: true },
)

// Dismissal routes that don't come from the anchor itself.
function onWindowDismiss(): void {
  hide()
}
watch(open, (o) => {
  if (o) {
    window.addEventListener('resize', onWindowDismiss)
    window.addEventListener('scroll', onWindowDismiss, true)
  } else {
    window.removeEventListener('resize', onWindowDismiss)
    window.removeEventListener('scroll', onWindowDismiss, true)
  }
})

// A pending show timer must not fire after unmount.
onUnmounted(() => {
  if (timer !== null) clearTimeout(timer)
})
</script>

<template>
  <span
    ref="anchorEl"
    class="ui-tip"
    :aria-describedby="open ? id : undefined"
    @mouseenter="handleEnter"
    @mouseleave="dismiss"
    @focus="show"
    @blur="dismiss"
    @click="dismiss"
  >
    <slot />
  </span>
  <Teleport to="body">
    <div
      v-if="mounted"
      ref="tipEl"
      :id="id"
      role="tooltip"
      :class="`ui-tip-bubble${open ? '' : ' leaving'}${className !== undefined ? ` ${className}` : ''}`"
      :style="pos !== null ? { left: `${pos.x}px`, top: `${pos.y}px` } : { visibility: 'hidden' }"
      @animationend="!open && (mounted = false)"
    >
      <span>{{ label }}</span>
      <span v-if="shortcut !== undefined" class="ui-tip-shortcut">{{ shortcut }}</span>
    </div>
  </Teleport>
</template>
