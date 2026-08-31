<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import Icon from '@uibase/Icon/Icon.vue'
import '../styles/gate.css'
import './QuestionCard.css'
import type { PendingQuestion, QuestionAnswerItem } from '../../bridge/session-store'

/**
 * QuestionCard — the elicitation wizard (modeled on ZCode's elicitation
 * dialog, from its renderer bundle): ONE question per screen. The question
 * text is the title; a ‹ 1 / N › pager sits in the top-right corner; the
 * options render as numbered full-width rows (checkboxes when
 * multiSelect) with the custom-answer input as the trailing row N+1.
 *
 * Interaction, per the reference: clicking an option ANSWERS the question
 * and auto-advances — answering the LAST question submits the whole form;
 * multiSelect rows toggle instead and advance via 继续/Enter. Drafts are
 * kept per question, so ‹ / Escape go back to revise (Escape on the first
 * question dismisses = 忽略). Advancing never blocks on an empty answer;
 * submit ships whatever was answered.
 */
const props = defineProps<{
  pending: PendingQuestion
}>()

const emit = defineEmits<{
  submit: [answers: QuestionAnswerItem[]]
  cancel: []
}>()

interface Draft {
  selected: string[]
  custom: string
}

const total = computed(() => props.pending.questions.length)
const current = ref(0)
const q = computed(() => props.pending.questions[Math.min(current.value, total.value - 1)])
const opts = computed(() => q.value?.options ?? [])
const isLast = computed(() => current.value >= total.value - 1)

/** Per-question drafts, kept so ‹ can revise earlier answers. Seeded up
 *  front so the draft computed never writes while evaluating. */
const drafts = reactive<Record<string, Draft>>({})
watch(
  () => props.pending.gateId,
  () => {
    for (const question of props.pending.questions) {
      drafts[question.id] ??= { selected: [], custom: '' }
    }
  },
  { immediate: true },
)
const draft = computed<Draft>(() => drafts[q.value.id] ?? { selected: [], custom: '' })

function isSel(label: string): boolean {
  return draft.value.selected.includes(label)
}

/** Keyboard cursor across the rows (options… then the custom-input row). */
const cursor = ref(0)
const optionEls: (HTMLButtonElement | null)[] = []
const inputEl = ref<HTMLInputElement | null>(null)

function setRowRef(index: number, node: unknown): void {
  if (node instanceof HTMLButtonElement) optionEls[index] = node
}

watch(cursor, (index) => {
  if (index >= opts.value.length) inputEl.value?.focus()
  else optionEls[index]?.focus()
})

// New question, same cursor: re-focus so keyboard flow continues (the row
// elements are remounted per question).
watch(current, () => {
  void nextTick(() => {
    if (cursor.value >= opts.value.length) inputEl.value?.focus()
    else optionEls[cursor.value]?.focus()
  })
})

function rowClass(label: string, index: number): string {
  return [
    'gate-row',
    isSel(label) ? 'is-selected' : '',
    cursor.value === index ? 'is-cursor' : '',
  ]
    .filter(Boolean)
    .join(' ')
}

const inputRowClass = computed(() =>
  [
    'gate-row',
    'gate-row--input',
    draft.value.custom.trim() !== '' ? 'is-selected' : '',
    cursor.value >= opts.value.length ? 'is-cursor' : '',
  ]
    .filter(Boolean)
    .join(' '),
)

/** Record an option: single-select replaces + auto-advances; multi toggles. */
function pick(label: string): void {
  const d = draft.value
  if (q.value.multiSelect === true) {
    d.selected = d.selected.includes(label)
      ? d.selected.filter((l) => l !== label)
      : [...d.selected, label]
    return
  }
  d.selected = [label]
  advance()
}

function onCustomInput(event: Event): void {
  const d = draft.value
  d.custom = (event.target as HTMLInputElement).value
  if (q.value.multiSelect !== true) d.selected = []
}

/** Next question — or, on the last one, submit the whole form. */
function advance(): void {
  if (isLast.value) {
    submit()
    return
  }
  current.value += 1
}

/** 继续 / 下一题: the reference's provisional fill — an unanswered
    single-select question takes the option under the cursor first. */
function primary(): void {
  if (q.value.multiSelect !== true && draft.value.selected.length === 0 && draft.value.custom.trim() === '') {
    const idx = cursor.value
    if (idx >= 0 && idx < opts.value.length) draft.value.selected = [opts.value[idx].label]
  }
  advance()
}

function goBack(): void {
  if (current.value > 0) current.value -= 1
}

/** Escape: revise the previous question, or dismiss on the first. */
function backOrCancel(): void {
  if (current.value > 0) goBack()
  else emit('cancel')
}

function submit(): void {
  emit(
    'submit',
    props.pending.questions.map((question) => {
      const d = drafts[question.id]
      const custom = (d?.custom ?? '').trim()
      return {
        id: question.id,
        selected: [...(d?.selected ?? [])],
        ...((custom !== '' ? { custom } : {})),
      }
    }),
  )
}

function onKeydown(event: KeyboardEvent): void {
  const target = event.target
  if (target instanceof HTMLInputElement) return // the input handles its own Enter/Escape
  if (target instanceof HTMLButtonElement && !target.classList.contains('gate-row')) {
    return // pager / footer verbs behave natively
  }
  const rowCount = opts.value.length + 1
  switch (event.key) {
    case 'ArrowDown':
    case 'ArrowRight':
    case 'Tab':
      event.preventDefault()
      cursor.value = (cursor.value + 1) % rowCount
      return
    case 'ArrowUp':
    case 'ArrowLeft':
      event.preventDefault()
      cursor.value = (cursor.value + rowCount - 1) % rowCount
      return
    case 'Enter':
      event.preventDefault()
      if (cursor.value < 0) primary()
      else if (cursor.value < opts.value.length) {
        if (q.value.multiSelect === true) primary()
        else pick(opts.value[cursor.value].label)
      } else {
        inputEl.value?.focus()
      }
      return
    case 'Escape':
      event.preventDefault()
      backOrCancel()
      return
    default:
      return
  }
}

// A plan-review batch labels its submit with the intent's approve copy.
const submitLabel = computed(
  () =>
    props.pending.questions.find((question) => question.intent?.kind === 'plan-review')?.intent
      ?.approve ?? '提交',
)
</script>

<template>
  <div class="gate-panel" role="group" aria-label="问题确认" @keydown="onKeydown">
    <div class="elicit-head">
      <div class="elicit-head-main">
        <span v-if="q.header !== undefined" class="gate-panel-tool">{{ q.header }}</span>
        <span class="elicit-question">{{ q.question }}</span>
        <span v-if="q.detail !== undefined" class="elicit-detail">{{ q.detail }}</span>
      </div>
      <div class="elicit-pager">
        <button
          type="button"
          class="elicit-pager-btn"
          :disabled="current === 0"
          aria-label="上一题"
          @click="goBack"
        >
          <Icon><path d="m15 18-6-6 6-6" /></Icon>
        </button>
        <span class="elicit-count">{{ current + 1 }} / {{ total }}</span>
        <button
          type="button"
          class="elicit-pager-btn"
          :disabled="isLast"
          aria-label="下一题"
          @click="primary"
        >
          <Icon><path d="m9 18 6-6-6-6" /></Icon>
        </button>
      </div>
    </div>
    <div
      :role="q.multiSelect === true ? 'group' : 'listbox'"
      class="gate-rows"
      :aria-label="q.question"
    >
      <button
        v-for="(opt, i) in opts"
        :key="opt.label"
        :ref="(node) => setRowRef(i, node)"
        type="button"
        :role="q.multiSelect === true ? 'checkbox' : 'option'"
        :aria-checked="q.multiSelect === true ? isSel(opt.label) : undefined"
        :aria-selected="q.multiSelect === true ? undefined : isSel(opt.label)"
        :tabindex="cursor === i ? 0 : -1"
        :class="rowClass(opt.label, i)"
        @click="pick(opt.label)"
        @focus="cursor = i"
      >
        <span v-if="q.multiSelect === true" class="gate-row-check">
          <Icon><path d="M20 6 9 17l-5-5" /></Icon>
        </span>
        <span v-else class="gate-row-index">{{ i + 1 }}.</span>
        <span class="gate-row-main">
          <span class="gate-row-label">{{ opt.label }}</span>
          <span v-if="opt.description !== undefined" class="gate-row-desc">{{ opt.description }}</span>
        </span>
      </button>
      <div :class="inputRowClass" @click="inputEl?.focus()">
        <span v-if="q.multiSelect === true" class="gate-row-check">
          <Icon><path d="M20 6 9 17l-5-5" /></Icon>
        </span>
        <span v-else class="gate-row-index">{{ opts.length + 1 }}.</span>
        <input
          ref="inputEl"
          class="gate-input"
          :value="draft.custom"
          placeholder="其他：直接输入…"
          :aria-label="`自定义回答：${q.question}`"
          @input="onCustomInput"
          @focus="cursor = opts.length"
          @keydown.enter.stop.prevent="advance()"
          @keydown.esc.stop.prevent="backOrCancel()"
        />
      </div>
    </div>
    <div class="gate-foot">
      <span class="gate-hint">
        <Icon class="gate-hint-icon">
          <path d="M10 8h.01M12 12h.01M14 8h.01M16 12h.01M18 8h.01M6 8h.01M7 16h10m-9-4h.01" />
          <rect width="20" height="16" x="2" y="4" rx="2" />
        </Icon>
        <span>使用 Tab / 上下键选择，回车确认</span>
      </span>
      <div class="gate-actions">
        <button type="button" class="gate-ghost" @click="emit('cancel')">忽略</button>
        <button type="button" class="gate-confirm" @click="primary">{{ isLast ? submitLabel : '继续' }}</button>
      </div>
    </div>
  </div>
</template>
