import { useEffect, useRef } from 'react'
import { registerShortcut } from './shortcuts'

/**
 * Bind an app-global shortcut for the lifetime of the calling component.
 *
 * `handler` is read through a ref so re-renders never tear the binding down;
 * `enabled` (default true) is the owner's disabled gate — the shortcut only
 * responds while the owner is interactive. Registration is exclusive (the
 * registry throws on duplicates), so a shortcut may have exactly one owner
 * at a time.
 */
export function useShortcut(
  shortcut: string | undefined,
  handler: () => void,
  opts?: { enabled?: boolean },
): void {
  const enabled = opts?.enabled ?? true
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    if (shortcut === undefined || !enabled) return
    return registerShortcut(shortcut, () => handlerRef.current())
  }, [shortcut, enabled])
}
