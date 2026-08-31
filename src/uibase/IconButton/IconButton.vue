<script setup lang="ts">
import { computed, useAttrs } from 'vue'
import MetaButton from '../MetaButton/MetaButton.vue'
import './IconButton.css'

/** Ghost icon button for chrome/sidebar toolbars — MetaButton with the
 *  icon square chrome (.ui-iconbtn) and an icon slot (usually an uibase
 *  Icon). Tooltip and global shortcut behavior come from MetaButton. */
export interface IconButtonProps {
  /** Extra class for app-side theming. */
  className?: string
}

const props = defineProps<IconButtonProps>()

// label/tip/shortcut/onClick/disabled/aria-* flow through to MetaButton.
const attrs = useAttrs()

const cls = computed(() =>
  props.className !== undefined ? `ui-iconbtn ${props.className}` : 'ui-iconbtn',
)
</script>

<template>
  <!-- attrs carry label/tip/shortcut/onClick from the caller; the shape is
       caller-determined so the bind is cast (runtime passthrough is exact). -->
  <MetaButton v-bind="(attrs as any)" :class="cls">
    <slot />
  </MetaButton>
</template>
