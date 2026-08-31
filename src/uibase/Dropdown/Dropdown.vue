<script lang="ts">
import type { VNode } from 'vue'

/**
 * Where the panel sits relative to the trigger — the full twelve-way grid.
 * When the preferred rect would leave the viewport the panel flips to the
 * opposite side (alignment preserved) and is nudged back inside along the
 * cross axis.
 */
export type DropdownPlacement =
  | 'top'
  | 'top-left'
  | 'top-right'
  | 'bottom'
  | 'bottom-left'
  | 'bottom-right'
  | 'left'
  | 'left-top'
  | 'left-bottom'
  | 'right'
  | 'right-top'
  | 'right-bottom'

/** One selectable workspace entry. */
export interface DropdownOption {
  /** Stable identity handed back through `change`. */
  id: string
  /** Display label. */
  label: string
  /** Leading glyph drawn left of the label in panel rows, and in the
   *  trigger's head slot when this option is selected (`headSlot='selected'`). */
  icon?: () => VNode
  /** Second dim line under the label in panel rows. */
  description?: string
}

/** One non-selecting command row under the option list. */
export interface DropdownAction {
  /** Stable identity handed back through `action`. */
  id: string
  /** Display label. */
  label: string
  /** Leading glyph factory (fresh VNode per render), sized by the same
   *  wrapper as option icons. */
  icon?: () => VNode
}

export interface DropdownProps {
  /** Selectable options (searchable). */
  options?: readonly DropdownOption[]
  /** Selected option id, or null for none (the fallback row checks then). */
  value?: string | null
  /** Trigger label while nothing is selected. */
  placeholder?: string
  /** Command rows below the option list (after a divider). */
  actions?: readonly DropdownAction[]
  /** Label of the null-selection row shown (checked) while `value` is null. */
  noneLabel?: string
  /** Whether the panel leads with a search field (default true). */
  searchable?: boolean
  /** Preferred panel placement; flips to survive the viewport edges. */
  placement?: DropdownPlacement
  /** Disabled triggers neither open nor clear. */
  disabled?: boolean
  /** What anchors the pill's 14px head slot (default 'project'):
   *  - 'project' — built-in folder mark; with a value it crossfades to the
   *    clear × on hover (workspace-selector behavior).
   *  - 'selected' — renders the chosen option's own icon and no clear
   *    affordance (mode-selector behavior: one mode is always active). */
  headSlot?: 'project' | 'selected'
  /** Extra class on the root wrapper so app-side CSS can retheme a
   *  particular instance (e.g. accent-colored access chip). */
  className?: string
  /** Hug the longest row instead of honoring the fixed min-width — for
   *  short-label menus (context actions) where the default width reads
   *  oversized. */
  fitContent?: boolean
  /**
   * App-global shortcut that CYCLES the selection (forward through
   * `options`, wrapping at the end; backward with Shift) without touching
   * the panel. Registration is exclusive — the same shortcut bound
   * elsewhere throws.
   */
  cycleShortcut?: string
}
</script>

<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import Icon from '../Icon/Icon.vue'
import { useShortcut } from '../Meta/useShortcut'
import { shortcutLabel } from '../Meta/shortcuts'
import './Dropdown.css'

const props = withDefaults(defineProps<DropdownProps>(), {
  options: () => [],
  value: null,
  placeholder: '选择项目',
  actions: () => [],
  noneLabel: undefined,
  searchable: true,
  placement: 'bottom-left',
  disabled: false,
  headSlot: 'project',
  className: undefined,
  fitContent: false,
  cycleShortcut: undefined,
})

const emit = defineEmits<{
  /** Fires with the new id, or null when the clear button/fallback row is used. */
  change: [id: string | null]
  /** Fires for an action row; the menu closes either way. */
  action: [id: string]
}>()

/** Anchor↔panel gap and the viewport margin kept on every side (px). */
const GAP = 6
const MARGIN = 8

/** How long the close animation keeps the panel mounted (ms). */
const CLOSE_ANIMATION_MS = 110

interface Point {
  x: number
  y: number
}

/** Which side of the anchor the panel ended up on — drives which way the
 *  entrance animation grows (a top-side panel must emerge bottom-up). */
type PanelSide = 'top' | 'bottom' | 'left' | 'right'

interface Placement extends Point {
  side: PanelSide
  /** CSS transform-origin matching the resolved side + alignment, so the
   *  pop animation always grows from the anchor's direction. */
  origin: string
}

/** Fixed-position point for the panel, flipped and clamped to the viewport
 *  across the full twelve-way placement grid. Returns the resolved side and
 *  a matching transform-origin for the directional entrance animation. */
function place(
  anchor: DOMRect,
  panelW: number,
  panelH: number,
  placement: DropdownPlacement,
): Placement {
  const [prefSide, align = undefined] = placement.split('-') as
    [PanelSide, ('left' | 'right' | 'top' | 'bottom') | undefined]
  const vw = window.innerWidth
  const vh = window.innerHeight

  let side: PanelSide = prefSide

  const clampX = (x: number): number =>
    Math.min(Math.max(x, MARGIN), Math.max(MARGIN, vw - MARGIN - panelW))
  const clampY = (y: number): number =>
    Math.min(Math.max(y, MARGIN), Math.max(MARGIN, vh - MARGIN - panelH))

  // --- horizontal sides (left / right of the anchor) ---
  if (side === 'left' || side === 'right') {
    let x = side === 'left' ? anchor.left - GAP - panelW : anchor.right + GAP
    if (x < MARGIN && side === 'left') {
      side = 'right'
      x = anchor.right + GAP
    } else if (x + panelW > vw - MARGIN && side === 'right') {
      side = 'left'
      x = anchor.left - GAP - panelW
    }
    x = clampX(x)

    let y =
      align === 'top'
        ? anchor.top
        : align === 'bottom'
          ? anchor.bottom - panelH
          : anchor.top + anchor.height / 2 - panelH / 2
    y = clampY(y)

    return {
      x,
      y,
      side,
      origin: `${side === 'left' ? 'right' : 'left'} ${align ?? 'center'}`,
    }
  }

  // --- vertical sides (above / below the anchor) ---
  let y = side === 'top' ? anchor.top - GAP - panelH : anchor.bottom + GAP
  if (y < MARGIN && side === 'top') {
    side = 'bottom'
    y = anchor.bottom + GAP
  } else if (y + panelH > vh - MARGIN && side === 'bottom') {
    side = 'top'
    y = Math.max(MARGIN, anchor.top - GAP - panelH)
  }

  const x = clampX(
    align === 'left'
      ? anchor.left
      : align === 'right'
        ? anchor.right - panelW
        : anchor.left + anchor.width / 2 - panelW / 2,
  )
  const yClamped = clampY(y)

  return {
    x,
    y: yClamped,
    side,
    origin: `${align ?? 'center'} ${side === 'top' ? 'bottom' : 'top'}`,
  }
}

/** One flat keyboard-navigable row inside the open panel. */
interface Row {
  kind: 'option' | 'action' | 'none'
  id: string
}

const open = ref(false)
const closing = ref(false)
const query = ref('')
const highlight = ref(-1)
const pos = ref<Placement | null>(null)

const anchorEl = ref<HTMLDivElement | null>(null)
const panelEl = ref<HTMLDivElement | null>(null)
const triggerEl = ref<HTMLButtonElement | null>(null)
const searchEl = ref<HTMLInputElement | null>(null)
let closeTimer: number | null = null

function closeTimerClear(): void {
  if (closeTimer !== null) {
    clearTimeout(closeTimer)
    closeTimer = null
  }
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

function openPanel(): void {
  if (props.disabled || open.value) return
  closeTimerClear()
  closing.value = false
  query.value = ''
  highlight.value = -1
  open.value = true
}

// Flat navigation model: filtered options, then actions, then the none row.
const filteredOptions = computed<DropdownOption[]>(() => {
  const needle = query.value.trim().toLowerCase()
  return needle === ''
    ? [...props.options]
    : props.options.filter((o) => o.label.toLowerCase().includes(needle))
})
const rows = computed<Row[]>(() => {
  const list: Row[] = filteredOptions.value.map((o) => ({ kind: 'option' as const, id: o.id }))
  for (const a of props.actions) list.push({ kind: 'action', id: a.id })
  if (props.noneLabel !== undefined) list.push({ kind: 'none', id: '' })
  return list
})

function focusTrigger(): void {
  triggerEl.value?.focus()
}

function activateRow(row: Row | undefined): void {
  if (row === undefined) return
  if (row.kind === 'option') {
    emit('change', row.id)
    requestClose()
    focusTrigger()
  } else if (row.kind === 'none') {
    emit('change', null)
    requestClose()
    focusTrigger()
  } else {
    emit('action', row.id)
    requestClose()
    focusTrigger()
  }
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.stopPropagation()
    requestClose()
    focusTrigger()
    return
  }
  if (event.key === 'Tab') {
    requestClose()
    return
  }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    const step = event.key === 'ArrowDown' ? 1 : -1
    const first =
      highlight.value === -1 ? (event.key === 'ArrowDown' ? 0 : rows.value.length - 1) : highlight.value + step
    highlight.value = Math.min(Math.max(first, 0), rows.value.length - 1)
  } else if (event.key === 'Home') {
    event.preventDefault()
    highlight.value = rows.value.length === 0 ? -1 : 0
  } else if (event.key === 'End') {
    event.preventDefault()
    highlight.value = rows.value.length - 1
  } else if (event.key === 'Enter' || event.key === ' ') {
    if (highlight.value >= 0 && highlight.value < rows.value.length) {
      event.preventDefault()
      activateRow(rows.value[highlight.value])
    }
  }
}

// Two-pass placement, mirroring the tooltip: the panel mounts hidden, is
// measured, then lands at its point after one DOM flush so no hidden frame
// paints. While closing, the last position is kept so the exit animation
// plays in place. The state write bails when the computed point is
// unchanged, so unstable inline option/action literals cannot loop.
watch(
  [open, () => props.placement, () => props.options, query],
  ([o]) => {
    if (!o) return
    void nextTick(() => {
      const anchor = anchorEl.value
      const panel = panelEl.value
      if (anchor === null || panel === null) return
      const rect = anchor.getBoundingClientRect()
      const next = place(rect, panel.offsetWidth, panel.offsetHeight, props.placement)
      const prev = pos.value
      if (prev !== null && prev.x === next.x && prev.y === next.y && prev.side === next.side) return
      pos.value = next
    })
  },
  { immediate: true },
)

// Open focuses the search field so typing filters immediately; query
// changes keep the caret there.
watch([open, () => props.searchable], ([o, searchable]) => {
  if (o && searchable) searchEl.value?.focus()
})

// Global dismissal routes. Outside-scroll exempts the panel itself, whose
// option list scrolls internally.
const isInside = (target: Node): boolean =>
  (anchorEl.value?.contains(target) ?? false) ||
  (panelEl.value?.contains(target) ?? false)

function onPointerDown(event: MouseEvent): void {
  if (!isInside(event.target as Node)) requestClose()
}
function onGlobalKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape') requestClose()
}
function onScroll(event: Event): void {
  if (!isInside(event.target as Node)) requestClose()
}
function onResize(): void {
  requestClose()
}

watch(open, (o) => {
  if (o) {
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onGlobalKeyDown, true)
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onScroll, true)
  } else {
    document.removeEventListener('mousedown', onPointerDown)
    document.removeEventListener('keydown', onGlobalKeyDown, true)
    window.removeEventListener('resize', onResize)
    window.removeEventListener('scroll', onScroll, true)
  }
})

// A pending close timer must not fire after unmount.
onUnmounted(closeTimerClear)

// App-global cycle shortcut via Meta: steps the selection WITHOUT touching
// the panel — the user stays at the current focus, the value moves.
useShortcut(
  () => props.cycleShortcut,
  () => {
    if (props.options.length === 0) return
    const current = props.options.findIndex((o) => o.id === props.value)
    // Nothing selected (or a stale value): anchor at the start so forward
    // lands on the first option, backward on the last.
    const base = current === -1 ? -1 : current
    const next = props.options[(base + 1 + props.options.length) % props.options.length]
    if (next === undefined) return
    emit('change', next.id)
  },
  { enabled: () => !props.disabled },
)

const selected = computed(() => props.options.find((o) => o.id === props.value))
const rowId = (index: number): string => `ui-dd-row-${index}`
// Resolved anchor side drives which way the entrance animation grows.
const side = computed<PanelSide>(() => pos.value?.side ?? 'bottom')
const panelClass = computed(() =>
  [
    'ui-dd-panel',
    `ui-dd-side-${side.value}`,
    closing.value ? 'ui-dd-panel--closing' : '',
    props.fitContent ? 'ui-dd-panel--fit' : '',
  ]
    .filter(Boolean)
    .join(' '),
)
const panelStyle = computed(() =>
  pos.value !== null
    ? { left: `${pos.value.x}px`, top: `${pos.value.y}px`, transformOrigin: pos.value.origin }
    : { visibility: 'hidden' as const },
)

function onOptionEnter(index: number): void {
  highlight.value = index
}

defineSlots<{
  /** Full replacement for the built-in pill trigger (React renderTrigger). */
  trigger(slotProps: {
    open: boolean
    toggle: () => void
    selected: DropdownOption | undefined
    /** Pre-expanded shortcut hint for the trigger's tooltip. */
    shortcut?: string
    /** Latest value key for animation bindings (key changes on switch). */
    valueKey: string | null
  }): unknown
}>()
</script>

<template>
  <div ref="anchorEl" :class="`ui-dd${className !== undefined ? ` ${className}` : ''}`">
    <slot
      v-if="$slots.trigger"
      name="trigger"
      :open="open"
      :toggle="open ? requestClose : openPanel"
      :selected="selected"
      :shortcut="cycleShortcut !== undefined ? shortcutLabel(cycleShortcut) : undefined"
      :value-key="selected?.id ?? null"
    />
    <button
      v-else
      ref="triggerEl"
      type="button"
      :class="`ui-dd-trigger${selected !== undefined ? ' ui-dd-trigger--filled' : ''}`"
      aria-haspopup="listbox"
      :aria-expanded="open"
      :disabled="disabled"
      @click="open ? requestClose() : openPanel()"
    >
      <!-- Head slot: the folder mark always anchors the pill; with a value
          picked, the clear × stacks over it and they crossfade on hover. -->
      <span class="ui-dd-slot">
        <template v-if="headSlot === 'selected'">
          <span v-if="selected?.icon !== undefined" class="ui-dd-optico">
            <component :is="selected.icon()" />
          </span>
        </template>
        <template v-else>
          <!-- lucide:folder -->
          <Icon className="ui-dd-fold">
            <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
          </Icon>
          <span
            v-if="selected !== undefined"
            class="ui-dd-clear"
            role="button"
            aria-label="清除选中"
            tabindex="-1"
            @mousedown.stop.prevent
            @click.stop="emit('change', null)"
          >
            <!-- lucide:x -->
            <Icon className="ui-dd-x">
              <path d="M18 6L6 18M6 6l12 12" />
            </Icon>
          </span>
        </template>
      </span>
      <!-- Selection changes roll up through the face (panel picks AND the
          cycle shortcut hit the same path; key remount drives the CSS
          entrance). -->
      <span :key="selected?.id ?? 'none'" class="ui-dd-face">
        <span class="ui-dd-label">{{ selected === undefined ? placeholder : selected.label }}</span>
      </span>
      <!-- lucide:chevron-down -->
      <Icon className="ui-dd-chev">
        <path d="m6 9l6 6 6-6" />
      </Icon>
    </button>

    <Teleport to="body">
      <div
        v-if="open || closing"
        ref="panelEl"
        role="listbox"
        :class="panelClass"
        :style="panelStyle"
        @keydown="onKeyDown"
        @animationend="
          closing && (closeTimerClear(), (open = false), (closing = false))
        "
      >
        <div v-if="searchable" class="ui-dd-search">
          <!-- lucide:search -->
          <Icon className="ui-dd-search-ico">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </Icon>
          <input
            ref="searchEl"
            v-model="query"
            type="text"
            class="ui-dd-search-input"
            placeholder="搜索工作区"
            aria-label="搜索工作区"
            @input="highlight = -1"
          />
        </div>

        <!-- Option list exists only when there are options: action-only
            menus (no options) skip it entirely, empty state included. -->
        <div v-if="options.length > 0" class="ui-dd-list">
          <button
            v-for="o in filteredOptions"
            :key="o.id"
            type="button"
            role="option"
            :aria-selected="o.id === value"
            :id="rowId(rows.findIndex((r) => r.kind === 'option' && r.id === o.id))"
            :class="`ui-dd-item${rows.findIndex((r) => r.kind === 'option' && r.id === o.id) === highlight ? ' ui-dd-item--hot' : ''}`"
            @mouseenter="onOptionEnter(rows.findIndex((r) => r.kind === 'option' && r.id === o.id))"
            @click="activateRow({ kind: 'option', id: o.id })"
          >
            <span v-if="o.icon !== undefined" class="ui-dd-optico">
              <component :is="o.icon()" />
            </span>
            <!-- lucide:folder (default keeps plain lists recognizable) -->
            <Icon v-else className="ui-dd-ico">
              <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
            </Icon>
            <span class="ui-dd-text">
              <span class="ui-dd-label">{{ o.label }}</span>
              <span v-if="o.description !== undefined" class="ui-dd-desc">{{ o.description }}</span>
            </span>
            <Icon v-if="o.id === value" className="ui-dd-check">
              <path d="M20 6L9 17l-5-5" />
            </Icon>
          </button>
          <div v-if="filteredOptions.length === 0" class="ui-dd-empty">无匹配工作区</div>
        </div>

        <template v-if="actions.length > 0">
          <div class="ui-dd-divider" role="separator" />
          <button
            v-for="a in actions"
            :key="a.id"
            type="button"
            role="menuitem"
            :id="rowId(rows.findIndex((r) => r.kind === 'action' && r.id === a.id))"
            :class="`ui-dd-item${rows.findIndex((r) => r.kind === 'action' && r.id === a.id) === highlight ? ' ui-dd-item--hot' : ''}`"
            @mouseenter="onOptionEnter(rows.findIndex((r) => r.kind === 'action' && r.id === a.id))"
            @click="emit('action', a.id); requestClose(); focusTrigger()"
          >
            <span v-if="a.icon !== undefined" class="ui-dd-optico">
              <component :is="a.icon()" />
            </span>
            <span class="ui-dd-label">{{ a.label }}</span>
          </button>
        </template>

        <template v-if="noneLabel !== undefined">
          <div class="ui-dd-divider" role="separator" />
          <button
            type="button"
            role="option"
            :aria-selected="value === null"
            :id="rowId(rows.findIndex((r) => r.kind === 'none'))"
            :class="`ui-dd-item${rows.findIndex((r) => r.kind === 'none') === highlight ? ' ui-dd-item--hot' : ''}`"
            @mouseenter="onOptionEnter(rows.findIndex((r) => r.kind === 'none'))"
            @click="emit('change', null); requestClose(); focusTrigger()"
          >
            <!-- lucide:message-circle (fallback conversation mark) -->
            <Icon className="ui-dd-ico">
              <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
            </Icon>
            <span class="ui-dd-label">{{ noneLabel }}</span>
            <Icon v-if="value === null" className="ui-dd-check">
              <path d="M20 6L9 17l-5-5" />
            </Icon>
          </button>
        </template>
      </div>
    </Teleport>
  </div>
</template>
