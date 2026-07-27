import type { IRuntime } from '../runtime/iface'

// One hit test per 30fps tick (PLAN §4), not one per pointermove. The OS
// delivers moves far faster than we render, and the test is a GPU readback
// that stalls the pipeline — unthrottled it would cost a stall per move.
const HIT_TEST_MS = 33

/** Alpha (0..255) at or below which a pixel counts as "not her" (003-D3). */
const ALPHA_HIT = 8

/**
 * Overlay-only pointer wiring (003-D3, 003-D4).
 *
 * Main keeps the window on `setIgnoreMouseEvents(true, { forward: true })`, so
 * moves still arrive here while clicks fall through to the desktop. Each move
 * is tested against her silhouette and *transitions* are reported over
 * `stage:pointer` (root §8) — main flips capture on and off from that. A press
 * on the body drags the window; release persists the drop.
 *
 * Plain clicks and right-clicks stay inert: D03 fences body reactions out.
 */
export function wireOverlayPointer(runtime: IRuntime): void {
  // Canvas fills the window (#stage-wrap is inset:0 and pixi renders at the
  // stage origin), so client coords are already the runtime's coords.
  //
  // 003-D3 shipped its fallback: Hiyori's authored `Body` hit area measured as
  // a 96x136 box over the torso alone, so A6 fails on it — her head and hands
  // would eat nothing. The silhouette's own alpha is the hit area instead.
  // The threshold keeps a soft anti-aliased hair edge grabbable without
  // turning the fully transparent surround into a click-eating rectangle.
  const onBody = (e: PointerEvent): boolean => runtime.alphaAt(e.clientX, e.clientY) > ALPHA_HIT

  let over: boolean | null = null
  let lastTest = 0
  let dragging = false

  window.addEventListener('pointermove', (e) => {
    // No hit tests mid-drag — capture has to stay pinned on even once the
    // cursor outruns the body.
    if (dragging) {
      window.lares.dragMove({ x: e.screenX, y: e.screenY })
      return
    }
    const now = performance.now()
    if (now - lastTest < HIT_TEST_MS) return
    lastTest = now
    const hit = onBody(e)
    if (hit === over) return
    over = hit
    window.lares.reportPointer(hit)
  })

  window.addEventListener('pointerdown', (e) => {
    // Left button, no modifier (003-D4). Anything else is not a drag.
    if (e.button !== 0 || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return
    if (!onBody(e)) return
    dragging = true
    // Keeps moves coming once the cursor leaves the window mid-drag.
    ;(e.target as Element | null)?.setPointerCapture?.(e.pointerId)
    window.lares.dragStart({ x: e.screenX, y: e.screenY })
  })

  const endDrag = (): void => {
    if (!dragging) return
    dragging = false
    over = null // re-test on the next move; she may have been dropped out from under the cursor
    window.lares.dragEnd()
  }

  window.addEventListener('pointerup', endDrag)
  window.addEventListener('pointercancel', endDrag)
}
