/**
 * Backend lifecycle manager: drives one loaded binding through start / stop /
 * auto-restart / hot-swap, and watches its liveness.
 *
 * Failure model (see docs/coded-architecture.html §6.2): two detection layers —
 * transport close (binding status events, free and immediate) and a heartbeat
 * probe through the CodedBridge pipe (`coded.ping`, catches a live-but-hung
 * backend). Restart decisions live ONLY here: the manager owns the binding,
 * and whatever died inside the plugin converges to the same contract signals.
 * Restarts back off exponentially and circuit-break into a surfaced `failed`
 * status after too many attempts; a stability window resets the counter so a
 * backend that crashed once does not accumulate attempts forever.
 */

import type { BackendBinding, BackendStatus, ScannedBackend } from './types'

export interface BackendManagerOptions {
  /** Binding lifecycle broadcast (change-only forwarding is the manager's job). */
  onStatus: (status: BackendStatus) => void
  /** Backend log lines (stdout/stderr or the binding's own stream). */
  onLog: (line: string) => void
  /** Fired on EVERY successful start — the pipe may be re-created per attempt. */
  onPipePath: (pipePath: string) => void
  log: (message: string) => void
  /** Heartbeat cadence; 0 disables the watchdog. */
  heartbeatIntervalMs?: number
  heartbeatTimeoutMs?: number
  heartbeatMaxMisses?: number
  /** Restart backoff: base delay doubles per attempt, capped at 30s. */
  restartMaxAttempts?: number
  restartBaseDelayMs?: number
  /** Continuous uptime that resets the restart attempt counter. */
  stabilityWindowMs?: number
}

const DEFAULTS = {
  heartbeatIntervalMs: 10_000,
  heartbeatTimeoutMs: 5_000,
  heartbeatMaxMisses: 3,
  restartMaxAttempts: 5,
  restartBaseDelayMs: 1_000,
  stabilityWindowMs: 30_000,
}

export class BackendManager {
  private binding: BackendBinding | null = null
  private stopping = false
  private broken = false
  private attempts = 0
  private misses = 0
  private probe: (() => Promise<void>) | null = null
  private selected: ScannedBackend | null = null
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private restartTimer: ReturnType<typeof setTimeout> | null = null
  private stabilityTimer: ReturnType<typeof setTimeout> | null = null
  /** Set until the first start settles: its failure rejects through start()
   *  (the shell surfaces it) while the restart policy keeps retrying. */
  private firstStart: { reject: (error: Error) => void } | null = null

  constructor(private readonly opts: BackendManagerOptions) {}

  /**
   * Wire the CB-level liveness probe (BridgeClient.call('coded.ping')). The
   * shell installs it once its client is connected and clears it when the
   * bridge goes down — a dead pipe is the transport layer's detection, the
   * watchdog only judges when the pipe still answers.
   */
  /** The loaded backend binding's identity (null until a start was attempted). */
  info(): { id: string; label: string } | null {
    if (this.selected === null) return null
    return { id: this.selected.manifest.id, label: this.selected.manifest.label }
  }

  setProbe(probe: (() => Promise<void>) | null): void {
    this.probe = probe
  }

  /** Load and start the selected backend. Rejects when the FIRST start fails
   *  (the shell surfaces it); later failures go through the restart policy. */
  async start(selected: ScannedBackend): Promise<void> {
    this.selected = selected
    const binding = selected.create()
    this.binding = binding
    binding.on('status', (status) => this.handleStatus(status))
    binding.on('log', (line) => this.opts.onLog(line))
    this.startHeartbeat()
    return new Promise<void>((resolve, reject) => {
      this.firstStart = { reject }
      void this.runStart(binding, resolve)
    })
  }

  /** User-initiated teardown: no auto-restart beyond this point. */
  async stop(): Promise<void> {
    this.stopping = true
    this.clearTimers()
    await this.binding?.stop()
  }

  /** Immediate managed restart (the hot-swap path; auto-restart uses the
   *  backoff scheduler). */
  async restart(reason: string): Promise<void> {
    if (this.stopping || this.binding === null) return
    this.opts.log(`restart requested: ${reason}`)
    await this.binding.stop()
    await this.runStart(this.binding)
  }

  private async runStart(binding: BackendBinding, onFirstSuccess?: () => void): Promise<void> {
    this.misses = 0
    this.emit('starting')
    try {
      const { pipePath } = await binding.start()
      this.opts.onPipePath(pipePath)
      if (this.firstStart !== null) {
        this.firstStart = null
        onFirstSuccess?.()
      }
    } catch (error) {
      this.opts.log(`binding start failed: ${String(error)}`)
      this.scheduleRestart('start failed')
      if (this.firstStart !== null) {
        const first = this.firstStart
        this.firstStart = null
        first.reject(error instanceof Error ? error : new Error(String(error)))
      }
    }
  }

  private handleStatus(status: BackendStatus): void {
    if (status === 'ready') {
      // Stabilized: a clean run clears the restart counter.
      if (this.stabilityTimer !== null) clearTimeout(this.stabilityTimer)
      this.stabilityTimer = setTimeout(() => {
        this.stabilityTimer = null
        if (this.attempts > 0) this.opts.log('backend stable; restart counter reset')
        this.attempts = 0
        this.broken = false
      }, this.defaults().stabilityWindowMs)
    }
    if ((status === 'exited' || status === 'failed') && !this.stopping) {
      this.scheduleRestart(status === 'exited' ? 'backend exited' : 'backend failed to start')
    }
    this.emit(status)
  }

  private scheduleRestart(reason: string): void {
    if (this.stopping || this.restartTimer !== null) return
    const d = this.defaults()
    if (this.attempts >= d.restartMaxAttempts) {
      if (!this.broken) {
        this.broken = true
        this.opts.log(`circuit break: ${String(d.restartMaxAttempts)} restart attempts exhausted (${reason})`)
        this.emit('failed')
      }
      return
    }
    this.attempts += 1
    const delay = Math.min(d.restartBaseDelayMs * 2 ** (this.attempts - 1), 30_000)
    this.opts.log(`scheduling restart in ${String(delay)}ms (attempt ${String(this.attempts)}/${String(d.restartMaxAttempts)}): ${reason}`)
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null
      if (this.stopping || this.binding === null) return
      const binding = this.binding
      void binding.stop().then(() => this.runStart(binding))
    }, delay)
  }

  private startHeartbeat(): void {
    const d = this.defaults()
    if (d.heartbeatIntervalMs === 0 || this.heartbeatTimer !== null) return
    this.heartbeatTimer = setInterval(() => {
      void this.heartbeatTick()
    }, d.heartbeatIntervalMs)
  }

  private async heartbeatTick(): Promise<void> {
    const d = this.defaults()
    if (this.probe === null || this.stopping || this.restartTimer !== null) return
    let ok = false
    try {
      await Promise.race([
        this.probe(),
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('heartbeat timeout')), d.heartbeatTimeoutMs)
        }),
      ])
      ok = true
    } catch {
      ok = false
    }
    if (ok) {
      this.misses = 0
      return
    }
    this.misses += 1
    this.opts.log(`heartbeat missed (${String(this.misses)}/${String(d.heartbeatMaxMisses)})`)
    if (this.misses >= d.heartbeatMaxMisses) {
      this.misses = 0
      this.scheduleRestart('heartbeat lost')
    }
  }

  private clearTimers(): void {
    if (this.heartbeatTimer !== null) clearInterval(this.heartbeatTimer)
    if (this.restartTimer !== null) clearTimeout(this.restartTimer)
    if (this.stabilityTimer !== null) clearTimeout(this.stabilityTimer)
    this.heartbeatTimer = null
    this.restartTimer = null
    this.stabilityTimer = null
  }

  private emit(status: BackendStatus): void {
    this.opts.onStatus(status)
  }

  private defaults(): Required<BackendManagerOptions> {
    return { ...DEFAULTS, ...this.opts } as Required<BackendManagerOptions>
  }
}
