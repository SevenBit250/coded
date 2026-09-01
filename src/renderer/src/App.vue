<script setup lang="ts">
import { computed, onUnmounted, ref, watch, watchEffect } from 'vue'
import { applyTheme } from '@uibase'
import Startup from './screens/Startup.vue'
import Main from './screens/Main.vue'
import { useSessionStore } from './bridge/session-store'
import { THEMES, loadThemeChoice, resolveTheme, saveThemeChoice, systemPrefersDark } from './theme'
import type { ThemeChoice } from './theme'

/** Startup-sequence phase: the glass, then the workspace. The glass whitens
 *  for a beat before the swap; only the atomically-committed screen change
 *  is phase-visible, so no intermediate state can paint blank. */
type ShellPhase = 'startup' | 'main'

/** Floor dwell on the startup ocean (ms): the brand beat, and the idle
 *  window the workspace pre-mount lands in. The gate never opens earlier
 *  than this even when the backend is already connected. */
const BOOT_MIN_HOLD_MS = 1000

/** Ceiling on waiting for the backend (ms): first harness spawn can take
 *  tens of seconds; past this the workspace shows anyway (live with the
 *  bridge's own disconnected state and the manager's auto-restart) instead
 *  of pinning the user under the glass forever. */
const BOOT_MAX_WAIT_MS = 60_000

/** Pre-mount the workspace this far into the boot hold (ms): the first
 *  render/layout/paint of the (large) main tree lands while the glass is
 *  idle, so the final swap presents the workspace the very frame it fires —
 *  no blank gap. */
const MAIN_PREMOUNT_MS = 600

/** How long the glass backdrop takes to whiten once the hold ends (ms).
 *  Must stay in sync with the `.startup.whitening::after` transition. */
const WHITEN_MS = 450

/** Dwell on the fully-white glass before swapping to the workspace (ms):
 *  a beat of calm white so the cut lands as a non-event. */
const UNVEIL_DELAY_MS = 300

/** Tuning aid: keep the startup ocean scene mounted, skip the main
 *  transition. Flip back to false (or remove) when done tuning. */
const HOLD_ON_STARTUP = false

/**
 * Root shell: drives the startup -> main handoff and owns the theme.
 * Theme application is the same :root CSS-custom-property write the React
 * ThemeProvider performed — here as a watcher-driven data swap.
 */
const session = useSessionStore()
const phase = ref<ShellPhase>('startup')
const themeChoice = ref<ThemeChoice>(loadThemeChoice())
const systemDark = ref(systemPrefersDark())
const mainMounted = ref(false)
const whitening = ref(false)
let started = false
let minHoldDone = false
let waitTimedOut = false

// The 'system' choice tracks the OS live.
watchEffect((onCleanup) => {
  if (themeChoice.value !== 'system') return
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  const onChange = (event: MediaQueryListEvent): void => {
    systemDark.value = event.matches
  }
  mq.addEventListener('change', onChange)
  onCleanup(() => mq.removeEventListener('change', onChange))
})

const theme = computed(() => resolveTheme(themeChoice.value, systemDark.value))

// Apply the palette to :root before paint on every change.
watch(
  [theme, systemDark],
  () => applyTheme(THEMES[theme.value], theme.value, theme.value),
  { immediate: true, flush: 'post' },
)

const timers: number[] = []

/**
 * The real readiness gate: unveil once the backend bridge is connected.
 * Guards — never before the minimum dwell (ocean flash), never past the
 * wait ceiling (a failed/restarting backend must not pin the glass); the
 * workspace itself renders the disconnected state and the manager keeps
 * retrying underneath.
 */
function considerUnveil(): void {
  if (!minHoldDone || started) return
  if (session.status === 'bridge-connected' || waitTimedOut || session.status === 'failed') {
    started = true
    whitening.value = true
  }
}

// Whitening → dwell → atomic swap.
watch(whitening, (w) => {
  if (!w) return
  timers.push(
    window.setTimeout(() => {
      phase.value = 'main'
      void window.coded.transition()
    }, WHITEN_MS + UNVEIL_DELAY_MS),
  )
})

// Signal first paint so the main process can show the window.
window.coded.ready()
if (!HOLD_ON_STARTUP) {
  // The gate: minimum dwell, wait ceiling, then follow the bridge status.
  timers.push(
    window.setTimeout(() => {
      minHoldDone = true
      considerUnveil()
    }, BOOT_MIN_HOLD_MS),
  )
  timers.push(
    window.setTimeout(() => {
      waitTimedOut = true
      considerUnveil()
    }, BOOT_MAX_WAIT_MS),
  )
  watch(() => session.status, considerUnveil)
  // Workspace pre-mount: goes up during the idle part of the hold, hidden
  // at opacity 0 under the startup glass.
  timers.push(
    window.setTimeout(() => {
      mainMounted.value = true
    }, MAIN_PREMOUNT_MS),
  )
}

watch(themeChoice, (choice) => saveThemeChoice(choice))

onUnmounted(() => {
  for (const t of timers) clearTimeout(t)
})
</script>

<template>
  <Startup v-if="phase === 'startup'" :whitening="whitening" :dark="theme === 'dark'" />
  <Main
    v-if="mainMounted"
    :visible="phase === 'main'"
    v-model:theme-choice="themeChoice"
  />
</template>
