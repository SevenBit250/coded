/**
 * Harness runtime supervisor (main process): spawns the dsh CLI as a pure
 * Node child — `process.execPath` with ELECTRON_RUN_AS_NODE=1, so dev and the
 * packaged app share one code path and the Node version is always the one the
 * shell ships — and watches stdout for the readiness line.
 *
 * Readiness signal: the harness prints `dsh web: http://127.0.0.1:<port>` only
 * after the plugin tree settles, so that line is both the port source and the
 * "tree is up" marker. The bridge client should only start racing its pipe
 * once this resolves.
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { createInterface } from 'node:readline'
import { EventEmitter } from 'node:events'

export type DshRuntimeStatus = 'starting' | 'ready' | 'exited' | 'failed'

export interface DshRuntimeOptions {
  /** Harness repository root (cwd for the child; also anchors tsx resolution). */
  harnessRoot: string
  /** CLI entry relative to harnessRoot. Dev runs the TS source via tsx. */
  entryPath?: string
  /** Profile name to boot ('web' = `dsh web`). */
  profile?: string
  /** Per-line log sink (child stdout/stderr). */
  log?: (line: string) => void
}

/** The readiness line the web app prints once the tree is up. */
const READY_PATTERN = /dsh web: http:\/\/127\.0\.0\.1:(\d+)/

export class DshRuntime extends EventEmitter {
  private child: ChildProcess | null = null
  private stopping = false
  private ready = false

  constructor(private readonly opts: DshRuntimeOptions) {
    super()
  }

  /** Actual port once ready (undefined before). */
  get port(): number | undefined {
    return this.portValue
  }

  private portValue: number | undefined = undefined

  /** Spawn and wait for readiness. Fails loud if the child exits first. */
  async start(): Promise<void> {
    // Built CLI artifact (plain JS) — never the TS source: tsx 4.22 drops the
    // resolution baseUrl on Electron's Node 24, and the loader's internal
    // import API is Node 22/23-shaped, so today the runtime needs a full
    // system Node (>= 24 verified on 26). `DSH_NODE` overrides the command;
    // the packaged app will point this at a bundled node.exe (S3) — the
    // ELECTRON_RUN_AS_NODE trick stays reserved until harness lands Node 24
    // internals compatibility. Requires `pnpm run build` in the harness repo.
    const entry = this.opts.entryPath ?? 'apps/cli/lib/bin.js'
    const profile = this.opts.profile ?? 'web'
    const nodeCommand = process.env['DSH_NODE'] ?? 'node'
    this.emitStatus('starting')
    const child = spawn(nodeCommand, [entry, profile, '--port', '0', '--no-open'], {
      cwd: this.opts.harnessRoot,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    this.child = child

    const log = this.opts.log ?? (() => {})
    const pipeline = (stream: NodeJS.ReadableStream): void => {
      const rl = createInterface({ input: stream })
      rl.on('line', (line) => {
        log(line)
        if (this.ready) return
        const match = READY_PATTERN.exec(line)
        if (match !== null) {
          this.ready = true
          this.portValue = Number(match[1])
          this.emitStatus('ready')
        }
      })
    }
    pipeline(child.stdout!)
    pipeline(child.stderr!)

    const exited = new Promise<void>((resolve) => {
      child.once('exit', (code, signal) => {
        log(`child process exited (code=${String(code)}, signal=${String(signal)})`)
        resolve()
      })
    })
    const readyOrDead = new Promise<void>((resolve, reject) => {
      this.once('status', (status: DshRuntimeStatus) => {
        if (status === 'ready') resolve()
        if (status === 'failed') reject(new Error('harness runtime failed to start'))
      })
    })
    void exited.then(() => {
      if (!this.ready && !this.stopping) this.emitStatus('failed')
      else this.emitStatus('exited')
    })

    await Promise.race([readyOrDead, exited])
  }

  /**
   * Stop the runtime and its whole process tree (the harness spawns agents
   * and shells of its own — killing only the direct child would orphan them).
   */
  async stop(): Promise<void> {
    const child = this.child
    if (child === null || child.exitCode !== null) return
    this.stopping = true
    if (process.platform === 'win32') {
      const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
        windowsHide: true,
      })
      await new Promise<void>((resolve) => killer.once('exit', () => resolve()))
    } else {
      child.kill('SIGTERM')
    }
    await new Promise<void>((resolve) => child.once('exit', () => resolve()))
  }

  private emitStatus(status: DshRuntimeStatus): void {
    this.emit('status', status)
  }
}
