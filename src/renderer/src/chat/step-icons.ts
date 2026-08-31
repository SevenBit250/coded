import type { VNode } from 'vue'
import { h } from 'vue'

export type StepIconKind =
  | 'think'
  | 'terminal'
  | 'skill'
  | 'write'
  | 'read'
  | 'search'
  | 'todo'
  | 'generic'

/**
 * Lucide icon bodies (fetched from api.iconify.design; same vocabulary the
 * reference UI uses). NEVER hand-drawn — see the icon rule in AGENTS.md.
 * Rendered through the shared 24-grid line wrapper (stroke via CSS g rules
 * in StepIcon.vue).
 */
export const LUCIDE: Record<StepIconKind, VNode> = {
  think: h('path', {
    d: 'M12 18V5m3 8a4.17 4.17 0 0 1-3-4 4.17 4.17 0 0 1-3 4m8.598-6.5A3 3 0 1 0 12 5a3 3 0 1 0-5.598 1.5',
  }),
  terminal: h('path', { d: 'm7 11 2-2-2-2m4 6h4' }),
  skill: h('path', {
    d: 'M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z',
  }),
  write: h('path', {
    d: 'M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7m-5.625-12.375a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z',
  }),
  read: h('path', {
    d: 'M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2zM14 2v5a1 1 0 0 0 1 1h5M10 9H8m8 4H8m8 4H8',
  }),
  search: h('path', { d: 'm21 21-4.34-4.34M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0z' }),
  todo: h('path', {
    d: 'M13 5h8m-8 7h8m-8 7h8M3 17l2 2 4-4M3.5 4.5h5v5h-5z',
  }),
  generic: h('circle', { cx: '12', cy: '12', r: '10' }),
}

function firstString(
  args: Record<string, unknown> | undefined,
  keys: string[],
): string | undefined {
  if (args === undefined) return undefined
  for (const key of keys) {
    const value = args[key]
    if (typeof value === 'string' && value.trim() !== '') return value.trim()
  }
  return undefined
}

/** Map a tool call onto its human fold label + one-line summary. Unknown
 *  tools keep their raw name as the label. */
export function toolCategory(
  title: string,
  argsText: string | undefined,
): { label: string; icon: StepIconKind; summary?: string } {
  let args: Record<string, unknown> | undefined
  try {
    args = argsText === undefined ? undefined : (JSON.parse(argsText) as Record<string, unknown>)
  } catch {
    args = undefined
  }
  const clip = (value: string | undefined): string | undefined =>
    value === undefined ? undefined : value.length > 90 ? `${value.slice(0, 90)}…` : value
  const name = title.toLowerCase()
  if (['pwsh', 'powershell', 'bash', 'sh', 'cmd', 'zsh'].includes(name))
    return { label: '终端', icon: 'terminal', summary: clip(firstString(args, ['command', 'cmd', 'script'])) }
  if (name === 'skill') {
    const id = firstString(args, ['skill', 'name'])
    const desc = firstString(args, ['description'])
    return { label: '技能', icon: 'skill', summary: clip([id, desc].filter(Boolean).join('  ') || undefined) }
  }
  if (['write', 'edit', 'multiedit', 'notebookedit'].includes(name))
    return { label: '写入', icon: 'write', summary: clip(firstString(args, ['path', 'file_path', 'notebook_path'])) }
  if (name === 'read')
    return { label: '读取', icon: 'read', summary: clip(firstString(args, ['path', 'file_path'])) }
  if (['glob', 'grep', 'ls'].includes(name))
    return { label: '搜索', icon: 'search', summary: clip(firstString(args, ['pattern', 'path', 'query'])) }
  if (name.includes('todo')) return { label: '待办', icon: 'todo' }
  return {
    label: title === '' ? '工具调用' : title,
    icon: 'generic',
    summary: clip(firstString(args, Object.keys(args ?? {}))),
  }
}
