<script lang="ts">
/** How long the close animation keeps the menu mounted (ms). */
const CLOSE_ANIMATION_MS = 110

export interface MenuProps {
  /** Class on the root wrapper (anchor scope for the absolutely-positioned
   *  card and the outside-click boundary). */
  className?: string
  /** Render the card through a body portal, fixed below the trigger's right
   *  edge. Required when the anchor lives inside an overflow-clipped
   *  container (scroll areas), which would otherwise cut the card off. */
  portal?: boolean
  /** Extra class on the card itself (works in both inline and portal mode,
   *  where the wrapper's descendant selectors cannot reach the card). */
  cardClassName?: string
}

export interface MenuItemProps {
  /** Fires after the menu starts closing. */
  onClick?: () => void
  /** Right-aligned shortcut hint text. */
  shortcut?: string
  /** When set, the item renders a trailing check and checkbox semantics
   *  (option-style menus: view options, toggles). */
  selected?: boolean
  /** Destructive entry: renders in the danger color. */
  danger?: boolean
}
</script>

<script setup lang="ts">
import { nextTick, onUnmounted, provide, ref, watch } from 'vue'
import './Menu.css'

const props = withDefaults(defineProps<MenuProps>(), {
  className: undefined,
  portal: false,
  cardClassName: undefined,
})

const emit = defineEmits<{ openChange: [open: boolean] }>()

const open = ref(false)
const closing = ref(false)
const rootEl = ref<HTMLDivElement | null>(null)
const cardEl = ref<HTMLDivElement | null>(null)
let closeTimer: number | null = null
// Portal mode: the trigger's bottom-right corner in viewport coordinates,
// measured once per open; the card hangs off it (see Menu.css).
const anchorCorner = ref<{ top: number; left: number } | null>(null)

function openMenu(): void {
  if (closeTimer !== null) {
    clearTimeout(closeTimer)
    closeTimer = null
  }
  closing.value = false
  open.value = true
}

function requestClose(): void {
  if (!open.value || closeTimer !== null) return
  closing.value = true
  closeTimer = window.setTimeout(() => {
    closeTimer = null
    open.value = false
    closing.value = false
  }, CLOSE_ANIMATION_MS)
}

defineExpose({ openMenu, requestClose })

// Menu-scoped action handed to items (React MenuContext equivalent).
provide('ui-menu-close', requestClose)

watch(open, (value) => emit('openChange', value))

// Two-pass placement in portal mode: mount hidden, measure the trigger,
// then land — no hidden frame paints. The card's frame sits 4px below the
// trigger, right-aligned via CSS translateX.
watch(
  [open, () => props.portal],
  ([o, portal]) => {
    if (!o || !portal) {
      anchorCorner.value = null
      return
    }
    void nextTick(() => {
      const rect = rootEl.value?.getBoundingClientRect()
      if (rect !== undefined) anchorCorner.value = { top: rect.bottom + 4, left: rect.right }
    })
  },
  { immediate: true },
)

function setCardEl(el: unknown): void {
  cardEl.value = el as HTMLDivElement | null
}

function onPointerDown(event: MouseEvent): void {
  const target = event.target as Node
  if (rootEl.value !== null && rootEl.value.contains(target)) return
  if (props.portal && cardEl.value !== null && cardEl.value.contains(target)) return
  requestClose()
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape') requestClose()
}

watch(
  [open, () => props.portal],
  ([o, portal]) => {
    if (!o) return
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    // Portal-mode cards hang at a fixed viewport point, so any scroll or
    // resize would leave them stranded away from their anchor — close instead.
    const onViewportChange = (): void => requestClose()
    if (portal) {
      window.addEventListener('resize', onViewportChange)
      window.addEventListener('scroll', onViewportChange, true)
    }
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
      if (portal) {
        window.removeEventListener('resize', onViewportChange)
        window.removeEventListener('scroll', onViewportChange, true)
      }
    }
  },
  { flush: 'post' },
)

onUnmounted(() => {
  if (closeTimer !== null) clearTimeout(closeTimer)
})

/** Scoped-slot payload for the trigger (React render-prop equivalent). */
defineSlots<{
  trigger(slotProps: { open: boolean; toggle: () => void }): unknown
  default(): unknown
}>()
</script>

<template>
  <div ref="rootEl" :class="className">
    <slot
      name="trigger"
      :open="open"
      :toggle="open ? requestClose : openMenu"
    />
    <template v-if="open">
      <Teleport v-if="portal" to="body">
        <div
          class="ui-menu-portal"
          :style="anchorCorner !== null ? { top: `${anchorCorner.top}px`, left: `${anchorCorner.left}px` } : undefined"
        >
          <div
            :ref="setCardEl"
            :class="`ui-menu${cardClassName !== undefined ? ` ${cardClassName}` : ''}${closing ? ' ui-menu--closing' : ''}`"
            role="menu"
            :style="anchorCorner === null ? { visibility: 'hidden' } : undefined"
          >
            <slot />
          </div>
        </div>
      </Teleport>
      <div
        v-else
        :class="`ui-menu${cardClassName !== undefined ? ` ${cardClassName}` : ''}${closing ? ' ui-menu--closing' : ''}`"
        role="menu"
      >
        <slot />
      </div>
    </template>
  </div>
</template>
