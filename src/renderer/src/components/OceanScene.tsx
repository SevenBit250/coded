import { useEffect, useRef } from 'react'
import type { ReactElement } from 'react'

/**
 * Startup ocean scene: a tight matrix of small rounded-square dots covering
 * the whole window, with the shark mark fixed at center underneath. The
 * dots never move — the motion comes from a two-octave brightness field
 * that sweeps organic clusters of dots in and out, like light drifting
 * across water (the reference hero dot-matrix look this scene reproduces). Purely
 * ambient — no pointer interaction. Dots read slightly stronger toward the
 * bottom; overall alpha stays low so it blends with the translucent glass.
 */

/** Grid pitch between dot centers (CSS px) — the reference matrix is tight. */
const PITCH = 18
/** Frame cap, matching the reference site. */
const FRAME_MS = 1000 / 30
/** HiDPI cap; the field is soft enough that 1.5 is indistinguishable. */
const DPR_CAP = 1.5
/** Sprite canvas size; the dot core occupies the center square. */
const SPRITE = 24
const SPRITE_CORE = 9
/** Ink shades (lightest → deepest); brighter clusters pick the deeper end.
 *  On dark glass the "ink" is light, so the deep end is the brightest dot. */
const LIGHT_SHADES = ['#9aa0a8', '#82878f', '#6b7078', '#54585f'] as const
const DARK_SHADES = ['#4a4f57', '#5f656e', '#787f89', '#939aa4'] as const

/** One ocean dot: pinned to its grid point; only its brightness moves. */
interface Dot {
  /** Grid position (CSS px). */
  x: number
  y: number
  /** Per-dot phase so the breathing does not move in lockstep. */
  phase: number
  /** Breathing speed multiplier, 0.8–1.2. */
  speed: number
  /** Core edge length before the cluster scale (CSS px). */
  size: number
  /** Base alpha; the field stays semi-transparent against the glass. */
  alpha: number
}

/** '#rrggbb' plus alpha -> rgba() fill style. */
function tint(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** Hermite smoothstep over [0, 1]; input is clamped. */
function smooth01(t: number): number {
  const x = Math.min(1, Math.max(0, t))
  return x * x * (3 - 2 * x)
}

/** Pre-render one dot sprite: a flat rounded-square core with a tight,
 *  subtle halo (the reference dots glow very little). */
function makeSprite(color: string): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = SPRITE
  c.height = SPRITE
  const g = c.getContext('2d')
  if (g === null) return c
  const mid = SPRITE / 2
  const halo = g.createRadialGradient(mid, mid, 1, mid, mid, mid)
  halo.addColorStop(0, tint(color, 0.22))
  halo.addColorStop(0.55, tint(color, 0.07))
  halo.addColorStop(1, tint(color, 0))
  g.fillStyle = halo
  g.fillRect(0, 0, SPRITE, SPRITE)
  const off = (SPRITE - SPRITE_CORE) / 2
  g.fillStyle = tint(color, 0.95)
  g.beginPath()
  g.roundRect(off, off, SPRITE_CORE, SPRITE_CORE, SPRITE_CORE * 0.28)
  g.fill()
  return c
}

/** Exact grid covering the whole window. Rebuilt on resize. */
function buildField(w: number, h: number): Dot[] {
  const field: Dot[] = []
  for (let gy = PITCH / 2; gy < h + PITCH; gy += PITCH) {
    for (let gx = PITCH / 2; gx < w + PITCH; gx += PITCH) {
      field.push({
        x: gx,
        y: gy,
        phase: Math.random() * Math.PI * 2,
        speed: 0.8 + Math.random() * 0.4,
        size: 3 + Math.random() * 1.2,
        alpha: 0.16 + Math.random() * 0.14,
      })
    }
  }
  return field
}

/** Draw one frame: dots hold their grid positions while a two-octave field
 *  sweeps bright islands across the matrix; lower rows read slightly
 *  stronger, giving the full-window field a sense of depth. */
function draw(
  ctx: CanvasRenderingContext2D,
  field: Dot[],
  sprites: HTMLCanvasElement[],
  w: number,
  h: number,
  t: number,
): void {
  ctx.clearRect(0, 0, w, h)
  for (const p of field) {
    const depth = p.y / h
    const n =
      Math.sin(p.x * 0.006 + t * 0.3) * Math.sin(p.y * 0.011 - t * 0.2) * 0.65 +
      Math.sin(p.x * 0.017 - t * 0.13 + p.y * 0.009) * 0.35
    // Threshold the field into soft islands: outside them the dot is gone.
    const cluster = smooth01((n + 0.08) / 0.55)
    if (cluster <= 0.004) continue
    const breathe = 0.8 + 0.2 * Math.sin(t * 1.9 * p.speed + p.phase)
    const a = cluster * breathe * p.alpha * (0.55 + 0.45 * depth)
    if (a < 0.01) continue
    const core = p.size * (0.9 + 0.2 * cluster)
    const d = core * (SPRITE / SPRITE_CORE)
    ctx.globalAlpha = a
    ctx.drawImage(
      sprites[Math.min(sprites.length - 1, (cluster * sprites.length) | 0)],
      p.x - d / 2,
      p.y - d / 2,
      d,
      d,
    )
  }
  ctx.globalAlpha = 1
}

/**
 * The full startup scene: particle matrix canvas over the centered,
 * motionless shark mark. `dark` swaps the dot palette for the dark glass.
 */
export function OceanScene({ dark = false }: { dark?: boolean }): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas === null) return
    const ctx = canvas.getContext('2d')
    if (ctx === null) return

    const sprites = (dark ? DARK_SHADES : LIGHT_SHADES).map(makeSprite)
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let field: Dot[] = []
    let w = 0
    let h = 0
    let raf = 0
    let last = 0

    const resize = (): void => {
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP)
      w = rect.width
      h = rect.height
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      field = buildField(w, h)
      if (reduced) draw(ctx, field, sprites, w, h, 1.2)
    }

    const frame = (now: number): void => {
      raf = requestAnimationFrame(frame)
      if (now - last < FRAME_MS) return
      last = now - ((now - last) % FRAME_MS)
      draw(ctx, field, sprites, w, h, now / 1000)
    }

    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    if (!reduced) raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [dark])

  return (
    <div className="ocean-scene" aria-hidden="true">
      {/* The shark sits UNDER the particle canvas: dots drift across it,
          which reads as the shark being submerged in the glowing sea. */}
      <img className="startup-shark" src="/shark-icon.svg" alt="" />
      <canvas ref={canvasRef} className="ocean-canvas" />
    </div>
  )
}
