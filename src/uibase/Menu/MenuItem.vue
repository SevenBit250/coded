<script setup lang="ts">
import { inject } from 'vue'
import './Menu.css'

/** One menu entry; clicking it also closes the parent menu. */
withDefaults(
  defineProps<{
    /** Right-aligned shortcut hint text. */
    shortcut?: string
    /** When set, the item renders a trailing check and checkbox semantics
     *  (option-style menus: view options, toggles). */
    selected?: boolean
    /** Destructive entry: renders in the danger color. */
    danger?: boolean
  }>(),
  { shortcut: undefined, selected: undefined, danger: false },
)

const emit = defineEmits<{ click: [] }>()

const requestClose = inject<() => void>('ui-menu-close', () => {})

function onClick(): void {
  requestClose()
  emit('click')
}
</script>

<template>
  <button
    :class="`ui-menu-item${danger ? ' ui-menu-item--danger' : ''}`"
    :role="selected === undefined ? 'menuitem' : 'menuitemcheckbox'"
    :aria-checked="selected === undefined ? undefined : selected"
    @click="onClick"
  >
    <span>
      <slot />
    </span>
    <svg v-if="selected === true" class="ui-menu-check" viewBox="0 0 16 16" aria-hidden="true">
      <path d="m3.5 8.5 3 3 6-7" />
    </svg>
    <span v-else-if="shortcut !== undefined" class="ui-menu-shortcut">{{ shortcut }}</span>
  </button>
</template>
