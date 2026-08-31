<script setup lang="ts">
import { useAttrs } from 'vue'
import Tooltip from '../Tooltip/Tooltip.vue'
import type { TooltipPlacement } from '../Tooltip/Tooltip.vue'
import { useShortcut } from '../Meta/useShortcut'
import { shortcutLabel } from '../Meta/shortcuts'
import './MetaButton.css'

/** MetaButton: the shared base for all button forms — native button +
 *  built-in Tooltip + global shortcut binding. Button/IconButton compose
 *  it and add their own classes and content. */
export interface MetaButtonProps {
  /** Accessible name. */
  label: string
  onClick?: () => void
  /** Extra class for app-side theming. */
  className?: string
  /** Tooltip text; falls back to `label` when omitted. */
  tip?: string
  /** Tooltip placement. */
  tipPlacement?: TooltipPlacement
  /**
   * In-app global shortcut, e.g. "Mod+M". While the button is mounted the
   * key fires `onClick` app-wide and is shown in the tooltip. Registration
   * is exclusive: the same shortcut cannot be bound twice.
   */
  shortcut?: string
}

defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<MetaButtonProps>(), {
  onClick: undefined,
  className: undefined,
  tip: undefined,
  tipPlacement: 'top',
  shortcut: undefined,
})

// Passthrough button attributes (aria-expanded, disabled, title, …) plus
// the click listener land here and flow onto the native button.
const attrs = useAttrs()

// The shortcut mirrors the click; onClick is a DECLARED prop, so it never
// appears in attrs — read it off props (reactive, always the latest).
useShortcut(
  () => props.shortcut,
  () => props.onClick?.(),
)
</script>

<template>
  <Tooltip
    :label="tip ?? label"
    :placement="tipPlacement"
    :shortcut="shortcut !== undefined ? shortcutLabel(shortcut) : undefined"
  >
    <button
      :class="`ui-metabtn${className !== undefined ? ` ${className}` : ''}`"
      :aria-label="label"
      @click="onClick"
      v-bind="attrs"
    >
      <slot />
    </button>
  </Tooltip>
</template>
