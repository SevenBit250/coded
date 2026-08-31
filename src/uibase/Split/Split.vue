<script lang="ts">
export interface SplitProps {
  /** Current size (px) of the pane this sash resizes. */
  value: number
  /** Smallest allowed size (px). */
  min?: number
  /** Largest allowed size (px). */
  max?: number
  /** Arrow-key step (px). */
  step?: number
  /** Split axis: 'horizontal' splits into left/right panes (a vertical strip
   *  with a col-resize cursor); 'vertical' splits into top/bottom panes. */
  orientation?: 'horizontal' | 'vertical'
  /** Which pane `value` measures, relative to the sash: 'start' (left/top)
   *  grows when dragging right/down; 'end' (right/bottom) grows the other way. */
  pane?: 'start' | 'end'
  /** Accessible name for the separator. */
  label?: string
  /** Extra class for app-side positioning/theming. */
  className?: string
  /** Inline positioning — the sash ships unpositioned; the parent owns layout. */
  style?: Record<string, string | number>
}
</script>

<script setup lang="ts">
import { ref } from 'vue'
import './Split.css'

const props = withDefaults(defineProps<SplitProps>(), {
  min: 0,
  max: Number.POSITIVE_INFINITY,
  step: 10,
  orientation: 'horizontal',
  pane: 'start',
  label: '调整面板大小',
  className: undefined,
  style: undefined,
})

const emit = defineEmits<{
  /** Clamped size update while dragging or keying. */
  change: [size: number]
  dragStart: []
  dragEnd: []
}>()

let drag: { pointerId: number; startPos: number; startSize: number } | null = null
const dragging = ref(false)

const clamp = (size: number): number => Math.min(props.max, Math.max(props.min, Math.round(size)))
const sign = () => (props.pane === 'start' ? 1 : -1)
const posOf = (e: PointerEvent): number => (props.orientation === 'horizontal' ? e.clientX : e.clientY)

function handleDown(e: PointerEvent): void {
  if (e.button !== 0) return
  e.preventDefault()
  // No focus() here: mouse users must never see the keyboard-only
  // :focus-visible hairline; the sash stays reachable via Tab instead.
  ;(e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId)
  drag = { pointerId: e.pointerId, startPos: posOf(e), startSize: props.value }
  dragging.value = true
  emit('dragStart')
}

function handleMove(e: PointerEvent): void {
  const d = drag
  if (d === null || e.pointerId !== d.pointerId) return
  emit('change', clamp(d.startSize + sign() * (posOf(e) - d.startPos)))
}

function handleUp(e: PointerEvent): void {
  if (drag === null || e.pointerId !== drag.pointerId) return
  drag = null
  dragging.value = false
  emit('dragEnd')
}

function handleKeyDown(e: KeyboardEvent): void {
  const grow = props.orientation === 'horizontal' ? 'ArrowRight' : 'ArrowDown'
  const shrink = props.orientation === 'horizontal' ? 'ArrowLeft' : 'ArrowUp'
  if (e.key !== grow && e.key !== shrink) return
  e.preventDefault()
  emit('change', clamp(props.value + sign() * (e.key === grow ? props.step : -props.step)))
}
</script>

<template>
  <div
    :class="`ui-split${dragging ? ' dragging' : ''}${className !== undefined ? ` ${className}` : ''}`"
    :style="style"
    role="separator"
    tabindex="0"
    :aria-label="label"
    :aria-orientation="orientation === 'horizontal' ? 'vertical' : 'horizontal'"
    :aria-valuenow="Math.round(value)"
    :aria-valuemin="Math.round(min)"
    :aria-valuemax="Number.isFinite(max) ? Math.round(max) : undefined"
    :data-orientation="orientation"
    @pointerdown="handleDown"
    @pointermove="handleMove"
    @pointerup="handleUp"
    @pointercancel="handleUp"
    @lostpointercapture="handleUp"
    @keydown="handleKeyDown"
  />
</template>
