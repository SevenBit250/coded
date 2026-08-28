/**
 * CodedBridge semantic domain (proto 1 pilot: models + permission).
 *
 * These types are the CONTRACT between the shell and any adapter — the shell
 * must never see backend shapes. Per codedbridge-protocol.md §2; migration
 * plan M1 covers exactly this file's domains. Backend dialect knowledge lives
 * in each adapter's translation layer, never here.
 */

/** One reasoning effort of an exact model route (adapter-owned vocabulary). */
export interface CodedReasoningEffort {
  id: string
  name: string
  description?: string
}

/** One selectable model route flattened from its provider group. */
export interface CodedModelRoute {
  provider: string
  providerName: string
  model: string
  modelName: string
  description?: string
  /** Present only when the model supports thinking (adapter-owned efforts). */
  efforts?: CodedReasoningEffort[]
  /** Adapter-configured default effort. */
  defaultEffort?: string
}

/** Complete model selection for one session. */
export interface CodedModelSelection {
  provider: string
  model: string
  reasoningEffort?: string
}

/** `coded.models.list` response. */
export interface CodedModelsSnapshot {
  current: CodedModelSelection
  /** False = the current provider has no live adapter; shell blocks input. */
  routable: boolean
  routes: CodedModelRoute[]
}

/** One permission mode (a backend permission preset). */
export interface CodedAccessMode {
  id: string
  name: string
  description?: string
}

/** `coded.permission.modes` response. */
export interface CodedPermissionModes {
  modes: CodedAccessMode[]
  /** Current session mode, when the backend can determine it. */
  current?: string
}
