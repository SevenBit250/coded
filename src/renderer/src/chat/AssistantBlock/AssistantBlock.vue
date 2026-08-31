<script setup lang="ts">
import { computed } from 'vue'
import Markdown from '../Markdown/Markdown.vue'
import MsgActions from '../MsgActions/MsgActions.vue'
import type { ChatMessage } from '../../bridge/session-store'
import './AssistantBlock.css'

/** AssistantBlock — the assistant's answer as a plain text flow (reference
 *  style, no card): markdown rendering, streaming caret, send-error state,
 *  and the hover copy actions. */
const props = defineProps<{ message: ChatMessage }>()

// Template narrowing: pin the assistant variant up front.
const assistant = computed(() => (props.message.kind === 'assistant' ? props.message : undefined))
</script>

<template>
  <div v-if="assistant !== undefined" class="chat-row chat-row--assistant">
    <div v-if="assistant.error !== undefined" class="chat-error">
      发送失败：{{ assistant.error }}
    </div>
    <div
      v-else
      :class="`chat-assistant${assistant.streaming ? ' chat-assistant--streaming' : ''}`"
    >
      <Markdown :text="assistant.text" />
    </div>
    <MsgActions
      v-if="!assistant.streaming && assistant.text !== ''"
      :text="assistant.text"
    />
  </div>
</template>
