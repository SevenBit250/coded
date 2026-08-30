/**
 * Central main-process logging on electron-log.
 *
 * Three pipeline layers, three scopes: [bridge-service] (this service's
 * lifecycle wiring), [bridge] (the CB pipe client), and one scope PER LOADED
 * BACKEND named after the binding's manifest id (e.g. [dsh]) — backend lines
 * are foreign output, so the scope comes from data, not shell code. The
 * console format carries millisecond timestamps for pipe-latency questions
 * ("did the backend emit before or after the renderer asked?"). The file
 * transport mirrors every line for packaged-build diagnostics.
 */
import log from 'electron-log/main'

log.transports.console.format = '[{h}:{i}:{s}.{ms}] [{scope}] {text}'
log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{scope}] {text}'

/** The main-process bridge service (status transitions, stream lifecycle). */
export const logService = log.scope('bridge-service')
/** The pipe client (reconnect loop, in-flight settlement). */
export const logBridge = log.scope('bridge')
/** A loaded backend binding's line sink, scoped by its manifest id. */
export const backendScope = (id: string) => log.scope(id)
