import { useEffect, useRef } from 'react'
import type { ReactElement } from 'react'

/**
 * Startup ocean scene: a canvas of glowing rounded-square particles
 * simulating gentle sea swell, plus the whale mark swaying at center.
 * Purely ambient — no pointer interaction. The field occupies the bottom
 * two-thirds of the screen and fades out toward the top; overall alpha is
 * kept low so the scene blends with the translucent glass startup screen.
 */

/** Top fraction of the screen kept clear of particles. */
const OCEAN_TOP = 1 / 3
/** Grid pitch between particle anchor points (CSS px). */
const PITCH = 34
/** Per-particle random offset from its grid anchor (CSS px). */
const JITTER = 9
/** Frame cap, matching the reference site. */
const FRAME_MS = 1000 / 30
/** HiDPI cap; the field is soft enough that 1.5 is indistinguishable. */
const DPR_CAP = 1.5
/** Sprite canvas size; the glowing core occupies the center square. */
const SPRITE = 33
const SPRITE_CORE = 10
/** Sea-blue shades (deep → bright), sampled from the DeepSeek hero palette. */
const SHADES = ['#16305e', '#1f4480', '#2f5fa3', '#5b8bc7'] as const

/** One ocean particle: anchored to a grid point, waving around it. */
interface Particle {
  /** Anchor position (CSS px). */
  x: number
  y: number
  /** Per-particle phase so neighbors do not move in lockstep. */
  phase: number
  /** Wave speed multiplier, 0.8–1.2. */
  speed: number
  /** Index into the sprite table. */
  shade: number
  /** Core edge length before the breathing scale (CSS px). */
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

/** Pre-render one glow sprite: radial halo plus a rounded-square core. */
function makeSprite(color: string): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = SPRITE
  c.height = SPRITE
  const g = c.getContext('2d')
  if (g === null) return c
  const mid = SPRITE / 2
  const halo = g.createRadialGradient(mid, mid, 1, mid, mid, mid)
  halo.addColorStop(0, tint(color, 0.5))
  halo.addColorStop(0.45, tint(color, 0.16))
  halo.addColorStop(1, tint(color, 0))
  g.fillStyle = halo
  g.fillRect(0, 0, SPRITE, SPRITE)
  const off = (SPRITE - SPRITE_CORE) / 2
  g.fillStyle = tint(color, 0.9)
  g.beginPath()
  g.roundRect(off, off, SPRITE_CORE, SPRITE_CORE, SPRITE_CORE * 0.3)
  g.fill()
  return c
}

/** Jittered grid covering the ocean band. Rebuilt on resize, so anchors
 *  reshuffle — acceptable for a brief splash, and cheap. */
function buildField(w: number, h: number): Particle[] {
  const field: Particle[] = []
  for (let gy = h * OCEAN_TOP + PITCH / 2; gy < h + PITCH; gy += PITCH) {
    for (let gx = PITCH / 2; gx < w + PITCH; gx += PITCH) {
      field.push({
        x: gx + (Math.random() * 2 - 1) * JITTER,
        y: gy + (Math.random() * 2 - 1) * JITTER,
        phase: Math.random() * Math.PI * 2,
        speed: 0.8 + Math.random() * 0.4,
        shade: (Math.random() * SHADES.length) | 0,
        size: 2.6 + Math.random() * 2.2,
        alpha: 0.22 + Math.random() * 0.38,
      })
    }
  }
  return field
}

/** Draw one frame: two traveling swells plus per-particle breathing,
 *  alpha fading in from the ocean's top boundary. */
function draw(
  ctx: CanvasRenderingContext2D,
  field: Particle[],
  sprites: HTMLCanvasElement[],
  w: number,
  h: number,
  t: number,
): void {
  ctx.clearRect(0, 0, w, h)
  const top = h * OCEAN_TOP
  const span = h - top
  for (const p of field) {
    const swell = Math.sin(p.x * 0.011 - t * 0.9 * p.speed + p.phase * 0.35)
    const chop = Math.sin(p.x * 0.023 + p.y * 0.014 - t * 1.7 + p.phase)
    const x = p.x + Math.cos(p.x * 0.008 - t * 0.6 + p.phase) * 3
    const y = p.y + swell * 9 + chop * 3.5
    const depth = (y - top) / span
    if (depth <= 0) continue
    // Depth perspective: deeper particles are larger, brighter, and the
    // band fades in quickly from its top boundary.
    const fade = smooth01(depth / 0.3)
    const scale = 0.45 + 0.55 * depth
    const breathe = 0.72 + 0.28 * Math.sin(t * 1.6 * p.speed + p.phase * 2.3)
    const a = fade * breathe * p.alpha * (0.35 + 0.65 * depth)
    if (a < 0.01) continue
    const core = p.size * scale * (0.85 + 0.3 * chop)
    const d = core * (SPRITE / SPRITE_CORE)
    ctx.globalAlpha = a
    ctx.drawImage(sprites[p.shade], x - d / 2, y - d / 2, d, d)
  }
  ctx.globalAlpha = 1
}

/**
 * The full startup scene. The whale is the app's own mark
 * (`public/whale.png`, a transparent sprite with the sea-blue gradient
 * baked in — no mask tricks, so it composites cleanly over the acrylic
 * window); the sway lives in CSS (`whale-sway`).
 */
export function OceanScene(): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas === null) return
    const ctx = canvas.getContext('2d')
    if (ctx === null) return

    const sprites = SHADES.map(makeSprite)
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let field: Particle[] = []
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
  }, [])

  return (
    <div className="ocean-scene" aria-hidden="true">
      <canvas ref={canvasRef} className="ocean-canvas" />
      <img className="startup-whale" src="/whale.png" alt="" />
    </div>
  )
}
