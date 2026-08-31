<script setup lang="ts">
import { computed, ref } from 'vue'
import ToolFold from './ToolFold.vue'
import ReasonFold from './ReasonFold.vue'
import MsgActions from './MsgActions.vue'
import Markdown from './Markdown.vue'
import type { ChatMessage } from './session-store'

/** One transcript row, any kind. */
const props = defineProps<{ message: ChatMessage; tick?: number | null }>()

const userText = computed(() =>
  props.message.kind === 'user'
    ? props.message.content.map((p) => (p.type === 'text' ? p.text : '')).join('')
    : '',
)
</script>

<template>
  <ToolFold v-if="message.kind === 'tool'" :message="message" />
  <ReasonFold v-else-if="message.kind === 'reasoning'" :message="message" :tick="tick" />
  <div v-else-if="message.kind === 'user'" class="chat-row chat-row--user">
    <div class="chat-bubble chat-bubble--user">
      <template v-for="(part, i) in message.content" :key="i">
        <span v-if="part.type === 'text'">{{ part.text }}</span>
      </template>
    </div>
    <MsgActions :text="userText" />
  </div>
  <div v-else class="chat-row chat-row--assistant">
    <div v-if="message.error !== undefined" class="chat-error">发送失败：{{ message.error }}</div>
    <div
      v-else
      :class="`chat-assistant${message.streaming ? ' chat-assistant--streaming' : ''}`"
    >
      <Markdown :text="message.text" />
    </div>
    <MsgActions v-if="!message.streaming && message.text !== ''" :text="message.text" />
  </div>
</template>
