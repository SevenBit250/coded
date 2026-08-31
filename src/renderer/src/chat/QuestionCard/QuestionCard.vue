<script setup lang="ts">
import { computed, reactive } from 'vue'
import '../styles/gate.css'
import './QuestionCard.css'
import type { PendingQuestion, QuestionAnswerItem } from '../../bridge/session-store'

/** Question form: one block per question, options single/multi + custom. */
const props = defineProps<{
  pending: PendingQuestion
}>()

const emit = defineEmits<{
  submit: [answers: QuestionAnswerItem[]]
  cancel: []
}>()

const selections = reactive<Record<string, string[]>>({})
const customs = reactive<Record<string, string>>({})

function toggleOption(qid: string, label: string, multi: boolean): void {
  const current = selections[qid] ?? []
  if (multi) {
    selections[qid] = current.includes(label)
      ? current.filter((l) => l !== label)
      : [...current, label]
  } else {
    selections[qid] = current.includes(label) ? [] : [label]
  }
}

const complete = computed(() =>
  props.pending.questions.every(
    (q) => (selections[q.id]?.length ?? 0) > 0 || (customs[q.id] ?? '').trim() !== '',
  ),
)

function submit(): void {
  if (!complete.value) return
  emit(
    'submit',
    props.pending.questions.map((q) => ({
      id: q.id,
      selected: selections[q.id] ?? [],
      ...((customs[q.id] ?? '').trim() !== '' ? { custom: customs[q.id].trim() } : {}),
    })),
  )
}

// A plan-review batch labels its submit with the intent's approve copy.
const submitLabel = computed(
  () =>
    props.pending.questions.find((q) => q.intent?.kind === 'plan-review')?.intent?.approve ??
    '提交',
)
</script>

<template>
  <div class="chat-row chat-row--assistant">
    <div class="gate-card" role="group" aria-label="问题确认">
      <div v-for="q in pending.questions" :key="q.id" class="gate-question">
        <span v-if="q.header !== undefined" class="gate-badge">{{ q.header }}</span>
        <p class="gate-reason">{{ q.question }}</p>
        <p v-if="q.detail !== undefined" class="gate-detail">{{ q.detail }}</p>
        <div v-if="q.options !== undefined && q.options.length > 0" class="gate-options">
          <button
            v-for="opt in q.options"
            :key="opt.label"
            type="button"
            :class="`gate-option${(selections[q.id] ?? []).includes(opt.label) ? ' active' : ''}`"
            :aria-pressed="(selections[q.id] ?? []).includes(opt.label)"
            :title="opt.description"
            @click="toggleOption(q.id, opt.label, q.multiSelect === true)"
          >
            {{ opt.label }}
          </button>
        </div>
        <input
          v-model="customs[q.id]"
          class="gate-custom"
          placeholder="其他：直接输入…"
          :aria-label="`自定义回答：${q.question}`"
        />
      </div>
      <div class="gate-actions">
        <button type="button" class="gate-btn gate-btn--primary" :disabled="!complete" @click="submit">
          {{ submitLabel }}
        </button>
        <button type="button" class="gate-btn" @click="emit('cancel')">取消</button>
      </div>
    </div>
  </div>
</template>
