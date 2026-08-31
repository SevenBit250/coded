<script setup lang="ts">
import { computed } from 'vue'
import MsgActions from '../MsgActions/MsgActions.vue'
import type { ChatMessage } from '../../bridge/session-store'
import './UserBubble.css'

/** UserBubble — the right-aligned accent message bubble (text parts only;
 *  non-text parts are skipped until attachment support lands). */
const props = defineProps<{ message: ChatMessage }>()

// Template narrowing: pin the user variant up front.
const user = computed(() => (props.message.kind === 'user' ? props.message : undefined))

const userText = computed(() =>
  user.value !== undefined
    ? user.value.content.map((p) => (p.type === 'text' ? p.text : '')).join('')
    : '',
)
</script>

<template>
  <div v-if="user !== undefined" class="chat-row chat-row--user">
    <div class="chat-bubble chat-bubble--user">
      <template v-for="(part, i) in user.content" :key="i">
        <span v-if="part.type === 'text'">{{ part.text }}</span>
      </template>
    </div>
    <MsgActions :text="userText" />
  </div>
</template>
