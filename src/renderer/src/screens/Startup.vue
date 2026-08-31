<script setup lang="ts">
import OceanScene from '../components/OceanScene.vue'

/** Frosted-glass startup screen (Plan B chrome): the window stays transparent
 *  so the native acrylic material blurs the desktop behind it. Above the glass
 *  tint sits the ocean scene — glow particles filling the bottom two-thirds,
 *  whale mark swaying at center. Presentational only: App drives the
 *  whitening class and unmounts this screen in the same commit that uncovers
 *  the workspace. */
withDefaults(
  defineProps<{
    /** Handoff underway: the glass backdrop fades to the workspace color while
     *  the ocean scene keeps drifting. */
    whitening?: boolean
    /** Dark glass variant (particle palette swaps; the shark inverts via CSS). */
    dark?: boolean
  }>(),
  { whitening: false, dark: false },
)
</script>

<template>
  <section :class="`screen startup${whitening ? ' whitening' : ''}`" aria-label="启动中">
    <OceanScene :dark="dark" />
    <!-- Empty chrome bar: owns the top drag region during startup. -->
    <div class="startup-chrome" />
  </section>
</template>
