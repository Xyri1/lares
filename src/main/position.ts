import { readFileSync, writeFileSync } from 'node:fs'

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface Point {
  x: number
  y: number
}

/** Overlapping area of two rects; 0 when they are disjoint. */
function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  return w > 0 && h > 0 ? w * h : 0
}

function centreDistance(a: Rect, b: Rect): number {
  const dx = a.x + a.width / 2 - (b.x + b.width / 2)
  const dy = a.y + a.height / 2 - (b.y + b.height / 2)
  return dx * dx + dy * dy
}

/**
 * Snap a remembered window rect fully inside a visible work area (003-D4, A4).
 * Home is the area it overlaps most; with no overlap anywhere — the monitor it
 * was dropped on is gone, or the layout changed under it — the nearest area by
 * centre distance takes it.
 *
 * All coordinates are DIP, Electron's default (PLAN §7): never mix in raw
 * device pixels, or the clamp drifts on a scaled monitor.
 */
export function clampToWorkArea(win: Rect, areas: Rect[]): Point {
  if (areas.length === 0) return { x: win.x, y: win.y }
  const most = areas.reduce((a, b) => (overlapArea(win, b) > overlapArea(win, a) ? b : a))
  const home =
    overlapArea(win, most) > 0
      ? most
      : areas.reduce((a, b) => (centreDistance(win, b) < centreDistance(win, a) ? b : a))
  // Far edge first, near edge last: a window bigger than its home area then
  // lands flush at the top-left and overflows away from the origin, instead of
  // being pushed off-screen behind it.
  return {
    x: Math.round(Math.max(home.x, Math.min(win.x, home.x + home.width - win.width))),
    y: Math.round(Math.max(home.y, Math.min(win.y, home.y + home.height - win.height)))
  }
}

/** P7: the position file is ingress too — hand-edited, truncated or written by
 *  an older build, and none of that may take the launch down. */
export function parsePoint(raw: unknown): Point | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const { x, y } = raw as Record<string, unknown>
  if (typeof x !== 'number' || !Number.isFinite(x)) return null
  if (typeof y !== 'number' || !Number.isFinite(y)) return null
  return { x: Math.round(x), y: Math.round(y) }
}

/** Remembered overlay position, or null for a first-run spawn. */
export function loadPosition(file: string): Point | null {
  try {
    return parsePoint(JSON.parse(readFileSync(file, 'utf8')))
  } catch {
    return null // absent or unreadable — the corner spawn takes over
  }
}

export function savePosition(file: string, pos: Point): void {
  try {
    writeFileSync(file, JSON.stringify(pos))
  } catch (err) {
    // Losing the memory is a papercut; crashing the drop is not.
    console.error(`[lares] could not save window position: ${(err as Error).message}`)
  }
}
