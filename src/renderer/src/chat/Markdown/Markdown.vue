<script lang="ts">
export interface MarkdownProps {
  text: string
}
</script>

<script setup lang="ts">
import { computed } from 'vue'
import MarkdownIt from 'markdown-it'

/**
 * Markdown — assistant text rendering over markdown-it.
 *
 * html:false drops raw HTML in model output (escaped, never interpreted),
 * preserving the exact XSS posture of the react-markdown port. Tables and
 * strikethrough are built-in (the GFM features models actually emit).
 * Links get target=_blank so clicks route through the main process
 * setWindowOpenHandler (shell.openExternal) already wired at window
 * creation. The rendered HTML is markdown-it's own escaped output only —
 * never raw model text.
 */
const props = defineProps<MarkdownProps>()

const md = new MarkdownIt({ html: false, linkify: false, breaks: false })

const defaultLinkOpen =
  md.renderer.rules['link_open'] ??
  ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options))

md.renderer.rules['link_open'] = (tokens, idx, options, env, self) => {
  tokens[idx].attrSet('target', '_blank')
  tokens[idx].attrSet('rel', 'noopener noreferrer')
  return defaultLinkOpen(tokens, idx, options, env, self)
}

const html = computed(() => md.render(props.text))
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html — markdown-it output with
       html:false; embedded raw HTML is escaped, links forced external. -->
  <div class="md" v-html="html" />
</template>
