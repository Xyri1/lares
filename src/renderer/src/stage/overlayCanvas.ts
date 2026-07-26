// Dev-panel trace overlay: plain 2D canvas, no chart library (002 step 6,
// decision 4). Draws E/M curves, a baseline-state band strip, and any
// selected synth param curves over scenario time; click maps back to a
// seek target using the same x<->t mapping the draw pass uses.
import type { TraceBuffer } from './traceBuffer'

export interface OverlayToggles {
  eValence: boolean
  eArousal: boolean
  mValence: boolean
  mArousal: boolean
  synthParams: Set<string>
}

const BASELINE_COLORS: Record<string, string> = {
  idle: '#3a3a3a',
  thinking: '#2b6cb0',
  working: '#2f855a',
  awaiting_input: '#d69e2e',
  error: '#c53030',
  done: '#805ad5'
}

const CURVE_COLORS = {
  eValence: '#ff6b6b',
  eArousal: '#ffa94d',
  mValence: '#4dabf7',
  mArousal: '#94d82d'
} as const

const BAND_HEIGHT = 14

/** Scenario time -> canvas x. Shared by drawing and click-to-seek so they
 * never drift apart. */
export function tToX(t: number, width: number, maxT: number): number {
  if (maxT <= 0) return 0
  return (t / maxT) * width
}

/** Canvas x -> scenario time, clamped to [0, maxT]. */
export function xToT(x: number, width: number, maxT: number): number {
  if (width <= 0 || maxT <= 0) return 0
  return Math.min(maxT, Math.max(0, (x / width) * maxT))
}

// Stable per-param-id color so a given synth param keeps its curve color
// across redraws without a fixed palette table (preset param lists vary).
function paramColor(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  return `hsl(${hash % 360}, 70%, 60%)`
}

function drawCurve(
  ctx: CanvasRenderingContext2D,
  points: { t: number; v: number }[],
  width: number,
  plotHeight: number,
  maxT: number,
  color: string
): void {
  if (points.length === 0) return
  ctx.strokeStyle = color
  ctx.lineWidth = 1.5
  ctx.beginPath()
  points.forEach((p, i) => {
    const x = tToX(p.t, width, maxT)
    // valence ~[-1,1], arousal ~[0,1] — both fit the same [-1,1] vertical
    // scale without per-curve rescaling (legible, not precise — decision 4).
    const y = plotHeight - ((p.v + 1) / 2) * plotHeight
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  })
  ctx.stroke()
}

export function drawOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  buf: TraceBuffer,
  toggles: OverlayToggles
): void {
  ctx.clearRect(0, 0, width, height)
  const maxT = Math.max(buf.endMs, 1)
  const plotHeight = height - BAND_HEIGHT

  // baseline-state band strip
  for (let i = 0; i < buf.engine.length; i++) {
    const p = buf.engine[i]
    const next = buf.engine[i + 1]
    const x0 = tToX(p.t, width, maxT)
    const x1 = next ? tToX(next.t, width, maxT) : tToX(p.t + 100, width, maxT)
    ctx.fillStyle = BASELINE_COLORS[p.baselineState] ?? '#888'
    ctx.fillRect(x0, plotHeight, Math.max(1, x1 - x0), BAND_HEIGHT)
  }

  if (toggles.eValence) {
    drawCurve(
      ctx,
      buf.engine.map((p) => ({ t: p.t, v: p.E.valence })),
      width,
      plotHeight,
      maxT,
      CURVE_COLORS.eValence
    )
  }
  if (toggles.eArousal) {
    drawCurve(
      ctx,
      buf.engine.map((p) => ({ t: p.t, v: p.E.arousal })),
      width,
      plotHeight,
      maxT,
      CURVE_COLORS.eArousal
    )
  }
  if (toggles.mValence) {
    drawCurve(
      ctx,
      buf.engine.map((p) => ({ t: p.t, v: p.M.valence })),
      width,
      plotHeight,
      maxT,
      CURVE_COLORS.mValence
    )
  }
  if (toggles.mArousal) {
    drawCurve(
      ctx,
      buf.engine.map((p) => ({ t: p.t, v: p.M.arousal })),
      width,
      plotHeight,
      maxT,
      CURVE_COLORS.mArousal
    )
  }
  for (const id of toggles.synthParams) {
    const points = buf.synth.filter((f) => id in f.params).map((f) => ({ t: f.t, v: f.params[id] }))
    drawCurve(ctx, points, width, plotHeight, maxT, paramColor(id))
  }

  // playhead — how far actual playback has reached within [0, endMs]
  const playheadT = buf.engine.length ? buf.engine[buf.engine.length - 1].t : 0
  const x = tToX(playheadT, width, maxT)
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(x, 0)
  ctx.lineTo(x, plotHeight)
  ctx.stroke()
}
