import { watchEffect } from 'vue'
import type { Ref } from 'vue'
import { registerShortcut } from '../Meta/shortcuts'

/**
 * Bind an app-global shortcut for the lifetime of the calling component
 * (or any active effect scope). `shortcut` may be a plain string or a
 * ref/getter so owners can rebind reactively; `handler` is read through a
 * ref so re-renders never tear the binding down; `enabled` (default true)
 * is the owner's disabled gate. Registration is exclusive (the registry
 * throws on duplicates), so a shortcut may have exactly one owner at a time.
 */
export function useShortcut(
  shortcut: string | undefined | Ref<string | undefined> | (() => string | undefined),
  handler: () => void,
  opts?: { enabled?: boolean | Ref<boolean> },
): void {
  const handlerRef = { current: handler }
  watchEffect((onCleanup) => {
    const value =
      typeof shortcut === 'function'
        ? shortcut()
        : shortcut !== null && typeof shortcut === 'object'
          ? shortcut.value
          : shortcut
    const enabled =
      opts?.enabled === undefined
        ? true
        : typeof opts.enabled === 'object'
          ? opts.enabled.value
          : opts.enabled
    if (value === undefined || !enabled) return
    onCleanup(registerShortcut(value, () => handlerRef.current()))
  })
}
