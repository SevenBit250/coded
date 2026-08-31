<script setup lang="ts">
import { computed, ref } from 'vue'
import StepIcon from '../StepIcon/StepIcon.vue'
import type { ChatMessage } from '../../bridge/session-store'
import '../styles/fold.css'

/** SkillFold — the skill-invocation card (specialized from the generic tool
 *  fold): ✦ + "技能" + the skill id and its description summary; the raw
 *  args/result stay behind the fold, same as the generic tool card. */
const props = defineProps<{ message: ChatMessage }>()

const open = ref(false)

const skill = computed(() => (props.message.kind === 'tool' ? props.message : undefined))

function firstString(args: Record<string, unknown> | undefined, keys: string[]): string | undefined {
  if (args === undefined) return undefined
  for (const key of keys) {
    const value = args[key]
    if (typeof value === 'string' && value.trim() !== '') return value.trim()
  }
  return undefined
}

const summary = computed(() => {
  let args: Record<string, unknown> | undefined
  try {
    args = skill.value?.argsText === undefined ? undefined : (JSON.parse(skill.value.argsText) as Record<string, unknown>)
  } catch {
    args = undefined
  }
  const id = firstString(args, ['skill', 'name'])
  const desc = firstString(args, ['description'])
  const joined = [id, desc].filter(Boolean).join('  ')
  if (joined === '') return undefined
  return joined.length > 90 ? `${joined.slice(0, 90)}…` : joined
})

const expandable = computed(
  () => skill.value?.argsText !== undefined || skill.value?.resultText !== undefined,
)
</script>

<template>
  <div v-if="skill !== undefined" class="chat-row chat-row--assistant">
    <div :class="`tool-card${skill.status === 'running' ? ' tool-card--running' : ''}`">
      <button
        type="button"
        class="tool-head"
        :aria-expanded="open"
        @click="expandable && (open = !open)"
      >
        <StepIcon kind="skill" />
        <span class="tool-label">技能</span>
        <span v-if="summary !== undefined" class="tool-sum">{{ summary }}</span>
        <svg
          v-if="expandable"
          :class="`fold-chev${open ? ' fold-chev--open' : ''}`"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8">
            <!-- lucide:chevron-right -->
            <path d="m9 18 6-6-6-6" />
          </g>
        </svg>
      </button>
      <div v-if="open" class="tool-body">
        <pre v-if="skill.argsText !== undefined" class="tool-pre">{{ skill.argsText }}</pre>
        <pre v-if="skill.resultText !== undefined" class="tool-pre">{{ skill.resultText }}</pre>
      </div>
    </div>
  </div>
</template>
