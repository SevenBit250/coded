/**
 * CodedBridge wire frames (v0).
 *
 * Transport: one local pipe (Windows named pipe / POSIX UDS), NDJSON framing —
 * one JSON frame per `\n`-terminated line, UTF-8. Both ends are Node.
 *
 * Layering: the handshake frames below are entirely Coded-owned; `rpc` /
 * `stream-*` payloads are a transparent pass-through of the harness ApiProxy
 * RPC face (`method` names and payload shapes come from
 * `@deepseek-ai/dsh-host-apiproxy`'s api/ schemas and are NOT redefined here).
 * Semantic transformation (method pruning, aggregation) is reserved for a
 * future protocol version — the payloads stay opaque to v0.
 */

import { z } from 'zod'

/** Wire protocol version. Bump on any breaking frame-shape change. */
export const BRIDGE_PROTOCOL_VERSION = 0

/** Which end of the pipe a hello frame came from. */
export type BridgeSide = 'adapter' | 'shell'

/**
 * Handshake, sent by the adapter immediately after the pipe connects, echoed
 * by the shell with its own side/version. Mismatched `proto` is fatal for the
 * connection — the shell surfaces "update the adapter/shell", never silently
 * misparses.
 */
export const bridgeHelloSchema = z.object({
  t: z.literal('hello'),
  side: z.enum(['adapter', 'shell']),
  proto: z.number().int(),
  /** Implementation version (adapter package / shell app), informational. */
  version: z.string(),
  /** Capability tokens; empty in v0, additive by design. */
  capabilities: z.array(z.string()).default([]),
})
export type BridgeHello = z.infer<typeof bridgeHelloSchema>

/**
 * Unary RPC, transparent pass-through of the harness ApiProxy face: `method`
 * is an ApiProxy RPC method name, `payload` its request payload verbatim.
 * `id` is minted by the shell and echoed on exactly one reply frame.
 */
export const bridgeRpcCallSchema = z.object({
  t: z.literal('rpc'),
  id: z.number().int(),
  method: z.string(),
  payload: z.unknown(),
})
export type BridgeRpcCall = z.infer<typeof bridgeRpcCallSchema>

/** RPC success reply. `payload` is the ApiProxy response value verbatim. */
export const bridgeRpcOkSchema = z.object({
  t: z.literal('rpc-ok'),
  id: z.number().int(),
  payload: z.unknown(),
})
export type BridgeRpcOk = z.infer<typeof bridgeRpcOkSchema>

/** Structured failure carried inside a reply frame (never a transport error). */
export const bridgeErrorSchema = z.object({
  message: z.string(),
  /** Stable machine-readable code when the source provides one. */
  code: z.string().optional(),
  data: z.unknown().optional(),
})
export type BridgeError = z.infer<typeof bridgeErrorSchema>

/** RPC failure reply. */
export const bridgeRpcErrSchema = z.object({
  t: z.literal('rpc-err'),
  id: z.number().int(),
  error: bridgeErrorSchema,
})
export type BridgeRpcErr = z.infer<typeof bridgeRpcErrSchema>

/** The downstream event streams the harness face exposes. */
export const bridgeStreamNameSchema = z.enum(['mux', 'host', 'events'])
export type BridgeStreamName = z.infer<typeof bridgeStreamNameSchema>

/**
 * Open a downstream event stream. `stream` selects mux (client-bound frames:
 * session updates, search hits, …) or host (host-bound frames: approvals,
 * questions, status). Shell-minted `id` keys every frame/end of this stream.
 */
export const bridgeStreamOpenSchema = z.object({
  t: z.literal('stream-open'),
  id: z.number().int(),
  stream: bridgeStreamNameSchema,
  payload: z.unknown(),
})
export type BridgeStreamOpen = z.infer<typeof bridgeStreamOpenSchema>

/**
 * stream-open payload (opaque to the frame schema, additive by design).
 * `types` asks the adapter to forward only those mux/host frame types — the
 * big `session/projection` deltas are the prime candidate to filter OUT when
 * a consumer only renders session/event traffic.
 */
export interface BridgeStreamOpenPayload {
  types?: string[]
}

/**
 * Adapter confirms the subscription is established (host-side listeners are
 * attached, baseline replay starting) — the shell's `onOpen` signal.
 */
export const bridgeStreamReadySchema = z.object({
  t: z.literal('stream-ready'),
  id: z.number().int(),
})
export type BridgeStreamReady = z.infer<typeof bridgeStreamReadySchema>

/**
 * One downstream frame. `envelope` is a full-form ServerRequest document
 * (`{ type: 'server-request', rpcId, method, payload }`) — byte-compatible
 * with the harness WebSocket downlink carrier, so shell-side parsing code is
 * shared with the browser client shape.
 */
export const bridgeStreamFrameSchema = z.object({
  t: z.literal('stream-frame'),
  id: z.number().int(),
  envelope: z.unknown(),
})
export type BridgeStreamFrame = z.infer<typeof bridgeStreamFrameSchema>

/** Stream finished from the adapter side (host closed it or the source ended). */
export const bridgeStreamEndSchema = z.object({
  t: z.literal('stream-end'),
  id: z.number().int(),
  reason: z.string().optional(),
})
export type BridgeStreamEnd = z.infer<typeof bridgeStreamEndSchema>

/** Shell-side cancellation of a stream it opened. */
export const bridgeStreamAbortSchema = z.object({
  t: z.literal('stream-abort'),
  id: z.number().int(),
})
export type BridgeStreamAbort = z.infer<typeof bridgeStreamAbortSchema>

/** Every frame on the wire, discriminated by `t`. */
export const bridgeFrameSchema = z.discriminatedUnion('t', [
  bridgeHelloSchema,
  bridgeRpcCallSchema,
  bridgeRpcOkSchema,
  bridgeRpcErrSchema,
  bridgeStreamOpenSchema,
  bridgeStreamReadySchema,
  bridgeStreamFrameSchema,
  bridgeStreamEndSchema,
  bridgeStreamAbortSchema,
])
export type BridgeFrame = z.infer<typeof bridgeFrameSchema>

/** Frame `t` values, for exhaustiveness checks on both ends. */
export type BridgeFrameType = BridgeFrame['t']
