/**
 * Central main-process logging on electron-log.
 *
 * Scopes keep the line prefixes stable across the three pipeline layers:
 * [dsh] is the backend child (the dsh adapter's true name — the one place
 * the backend's own name is correct), [bridge-service] and [bridge] are
 * backend-neutral shell layers. The console format carries millisecond
 * timestamps for pipe-latency questions ("did the backend emit before or
 * after the renderer asked?"). The file transport mirrors every line for
 * packaged-build diagnostics.
 */
import log from 'electron-log/main'

log.transports.console.format = '[{h}:{i}:{s}.{ms}] [{scope}] {text}'
log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{scope}] {text}'

/** The backend child (dsh adapter output forwarded line by line). */
export const logDsh = log.scope('dsh')
/** The main-process bridge service (status transitions, stream lifecycle). */
export const logService = log.scope('bridge-service')
/** The pipe client (reconnect loop, in-flight settlement). */
export const logBridge = log.scope('bridge')
