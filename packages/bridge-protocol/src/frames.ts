/**
 * CodedBridge wire frames (proto 2, channel model).
 *
 * Transport: one local pipe (Windows named pipe / POSIX UDS), NDJSON framing —
 * one JSON frame per `\n`-terminated line, UTF-8. Both ends are Node.
 *
 * Layering: the frame type names a CHANNEL (a vocabulary domain), and the
 * payload discriminates the frame's role inside that channel — `method` marks
 * a request (shell → adapter), `rsp` the exactly-one reply (adapter → shell),
 * `e` a data item and `eof` the terminal of a subscription. One discrimination
 * philosophy everywhere: classification lives in the payload; the frame plane
 * stays frozen while the payload unions grow. Direction policing is therefore
 * shape × direction, not type × direction (see coded-adapter's server).
 */

import { z } from 'zod'

/** Wire protocol version. Bump on any breaking frame-shape change. */
export const BRIDGE_PROTOCOL_VERSION = 2

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
  /** Capability tokens; additive by design, unknown tokens are ignored. */
  capabilities: z.array(z.string()).default([]),
})
export type BridgeHello = z.infer<typeof bridgeHelloSchema>

/**
 * Reply document of the call channels: the success value, or a business
 * failure with a stable semantic code (`bad-request`, `unknown-method`,
 * `title-invalid`, `backend`, … — codedbridge-protocol.md §2.5).
 */
export const bridgeRspSchema = z.union([
  z.object({ ok: z.literal(true), value: z.unknown() }),
  z.object({ ok: z.literal(false), code: z.string(), message: z.string() }),
])
export type BridgeRsp = z.infer<typeof bridgeRspSchema>

const callRequestShape = {
  /** Shell-minted call id; the reply echoes it on exactly one frame. */
  id: z.number().int(),
  method: z.string(),
  payload: z.unknown(),
}
const callReplyShape = {
  id: z.number().int(),
  rsp: bridgeRspSchema,
}

/**
 * The read-only channel: query-class methods ride out as request variants and
 * come back as reply variants on the same frame type. Queries are idempotent —
 * a timed-out query may be re-issued verbatim, a cached answer may be kept.
 */
export const bridgeQuerySchema = z.union([
  z.object({ t: z.literal('query'), ...callRequestShape }),
  z.object({ t: z.literal('query'), ...callReplyShape }),
])
export type BridgeQuery = z.infer<typeof bridgeQuerySchema>

/**
 * The mutation channel: control-class methods plus the reserved transport
 * lifecycle methods (`stream.subscribe` / `stream.unsubscribe`). Never
 * blindly retried — a duplicated control may duplicate its effect.
 */
export const bridgeControlSchema = z.union([
  z.object({ t: z.literal('control'), ...callRequestShape }),
  z.object({ t: z.literal('control'), ...callReplyShape }),
])
export type BridgeControl = z.infer<typeof bridgeControlSchema>

/** Reserved control methods (transport lifecycle; not part of `coded.*`). */
export const STREAM_SUBSCRIBE_METHOD = 'stream.subscribe'
export const STREAM_UNSUBSCRIBE_METHOD = 'stream.unsubscribe'

export const bridgeStreamSubscribePayloadSchema = z.object({
  /** Shell-minted stream id, echoed on every frame of this subscription. */
  streamId: z.number().int(),
  /** Semantic event names to keep; omit for all. Fixed per subscription. */
  types: z.array(z.string()).optional(),
})
export const bridgeStreamUnsubscribePayloadSchema = z.object({
  streamId: z.number().int(),
})

/**
 * The data channel (adapter → shell): one frame per semantic event, then at
 * most one terminal frame. `eof` without `reason` is a clean end (including
 * unsubscribe); with `reason` the source failed. A disconnected connection
 * implies eof on every live stream without a frame.
 */
export const bridgeStreamSchema = z.union([
  z.object({ t: z.literal('stream'), id: z.number().int(), e: z.unknown() }),
  z.object({
    t: z.literal('stream'),
    id: z.number().int(),
    eof: z.literal(true),
    reason: z.string().optional(),
  }),
])
export type BridgeStream = z.infer<typeof bridgeStreamSchema>

/** Every frame on the wire, classified by channel. */
export const bridgeFrameSchema = z.union([
  bridgeHelloSchema,
  bridgeQuerySchema,
  bridgeControlSchema,
  bridgeStreamSchema,
])
export type BridgeFrame = z.infer<typeof bridgeFrameSchema>

/** Frame `t` values, for exhaustiveness checks on both ends. */
export type BridgeFrameType = BridgeFrame['t']

/**
 * Method → channel class. The single source of truth shared by the shell
 * (channel selection) and the adapter (class validation — a method arriving
 * on the wrong channel is a `bad-request`). The registry test pins the
 * convention: list/describe/modes/history-shaped methods are query-class.
 */
export type CodedMethodClass = 'query' | 'control'
export const CODED_METHOD_CLASS: Readonly<Record<string, CodedMethodClass>> = {
  'coded.describe': 'query',
  'coded.workspace.list': 'query',
  'coded.session.list': 'query',
  'coded.session.history': 'query',
  'coded.models.list': 'query',
  'coded.permission.modes': 'query',
  'coded.session.create': 'control',
  'coded.session.rename': 'control',
  'coded.session.fork': 'control',
  'coded.session.archive': 'control',
  'coded.session.cancel': 'control',
  'coded.session.send': 'control',
  'coded.session.respond': 'control',
  'coded.queue.remove': 'control',
  'coded.models.select': 'control',
  'coded.permission.set': 'control',
  'coded.workspace.rename': 'control',
  'coded.workspace.delete': 'control',
}
