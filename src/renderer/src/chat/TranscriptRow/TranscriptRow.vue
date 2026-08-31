<script setup lang="ts">
import { computed } from 'vue'
import ToolFold from '../ToolFold/ToolFold.vue'
import SkillFold from '../SkillFold/SkillFold.vue'
import ReasonFold from '../ReasonFold/ReasonFold.vue'
import UserBubble from '../UserBubble/UserBubble.vue'
import AssistantBlock from '../AssistantBlock/AssistantBlock.vue'
import type { ChatMessage } from '../../bridge/session-store'
import './TranscriptRow.css'

/** TranscriptRow — pure kind dispatcher over the transcript item shapes.
 *  Every visible card lives in its own directory; this file only routes. */
const props = defineProps<{ message: ChatMessage; tick?: number | null }>()

const isSkill = computed(
  () => props.message.kind === 'tool' && (props.message.title ?? '').toLowerCase() === 'skill',
)
</script>

<template>
  <SkillFold v-if="isSkill" :message="message" />
  <ToolFold v-else-if="message.kind === 'tool'" :message="message" />
  <ReasonFold v-else-if="message.kind === 'reasoning'" :message="message" :tick="tick" />
  <UserBubble v-else-if="message.kind === 'user'" :message="message" />
  <AssistantBlock v-else :message="message" />
</template>
