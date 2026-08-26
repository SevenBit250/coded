/**
 * In-app global shortcut registry for MetaButton.
 *
 * One shortcut, one owner: registration throws on duplicates so a conflicting
 * binding is a loud programming error instead of a silent double-fire. The
 * single window-level keydown listener lives only while at least one shortcut
 * is registered, and fires whenever the window is focused (there is no input
 * guard — these are app-global by design).
 */

/** Modifier flags plus a key name (lowercased). */
interface ParsedShortcut {
  meta: boolean
  ctrl: boolean
  alt: boolean
  shift: boolean
  key: string
}

const isMac = navigator.platform.toLowerCase().includes('mac')

/** "Mod+M" -> { ctrl: true (Win/Linux) | meta: true (macOS), key: "m" }. */
function parseShortcut(shortcut: string): ParsedShortcut {
  const parts = shortcut
    .split('+')
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
  if (parts.length === 0) throw new Error(`empty shortcut: "${shortcut}"`)

  const parsed: ParsedShortcut = { meta: false, ctrl: false, alt: false, shift: false, key: '' }
  for (const part of parts.slice(0, -1)) {
    switch (part.toLowerCase()) {
      case 'mod':
        if (isMac) parsed.meta = true
        else parsed.ctrl = true
        break
      case 'ctrl':
      case 'control':
        parsed.ctrl = true
        break
      case 'cmd':
      case 'meta':
        parsed.meta = true
        break
      case 'alt':
      case 'option':
        parsed.alt = true
        break
      case 'shift':
        parsed.shift = true
        break
      default:
        throw new Error(`unknown shortcut modifier "${part}" in "${shortcut}"`)
    }
  }
  parsed.key = (parts[parts.length - 1] ?? '').toLowerCase()
  if (parsed.key === '') throw new Error(`shortcut missing a key: "${shortcut}"`)
  return parsed
}

/** Fixed-order canonical form; the registry key and the event matcher share it. */
function canonical(parsed: ParsedShortcut): string {
  return `${parsed.meta ? 'meta+' : ''}${parsed.ctrl ? 'ctrl+' : ''}${parsed.alt ? 'alt+' : ''}${
    parsed.shift ? 'shift+' : ''
  }${parsed.key}`
}

function eventToParsed(e: KeyboardEvent): ParsedShortcut {
  return {
    meta: e.metaKey,
    ctrl: e.ctrlKey,
    alt: e.altKey,
    shift: e.shiftKey,
    key: e.key.toLowerCase(),
  }
}

const registry = new Map<string, () => void>()

function onKeydown(e: KeyboardEvent): void {
  const handler = registry.get(canonical(eventToParsed(e)))
  if (handler !== undefined) {
    e.preventDefault()
    handler()
  }
}

/**
 * Bind an app-global shortcut. Returns the cleanup that unbinds it.
 * Throws when the shortcut is already bound elsewhere.
 */
export function registerShortcut(shortcut: string, handler: () => void): () => void {
  const key = canonical(parseShortcut(shortcut))
  if (registry.has(key)) throw new Error(`shortcut already registered: "${shortcut}"`)
  registry.set(key, handler)
  if (registry.size === 1) window.addEventListener('keydown', onKeydown)
  return () => {
    registry.delete(key)
    if (registry.size === 0) window.removeEventListener('keydown', onKeydown)
  }
}

/** Tooltip-facing label: "Mod+M" reads as Ctrl+M on Windows/Linux, Cmd+M on macOS. */
export function shortcutLabel(shortcut: string): string {
  return shortcut
    .split('+')
    .map((p) => {
      const t = p.trim()
      return t.toLowerCase() === 'mod' ? (isMac ? 'Cmd' : 'Ctrl') : t
    })
    .join('+')
}
