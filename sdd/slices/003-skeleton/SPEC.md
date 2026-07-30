# Slice 003 — Skeleton · SPEC

**Artifact:** Slice SPEC · **Slice:** 003-skeleton (= ROADMAP M1b) · **Status:** Closed

**Why / gate.** The Lar leaves the dev window and stands on the desktop.
Exit gate (ROADMAP M1b): *a Lar stands on the desktop on macOS and
Windows — alpha-clean (no fringing on either OS), click-through outside
the body, draggable, surviving restart in place.*

Refines root SPEC §1/§8 and D13; revises 001-D4 (see 003-D1). Binding
within the slice; root SPEC stays source of truth.

---

## 1. Scope

**In:** overlay window chrome (frameless, transparent, always-on-top);
forwarded-event click-through with Body-hit-area hit-testing over the
`stage:pointer` seam (root §8); drag with position memory and clamped
restore; screen-edge spawn sanity; single-instance lock; performance-feed
broadcast so the overlay mirrors playback; second (dev) window in dev
runs.

**Out (fence):** tray menu (M5a — now named on the ROADMAP), settings /
DND / launch-at-login (M5a), click or right-click reactions on the body
(D03), multiple Lares, frame-rate governor / occlusion pause (parking
lot), HTTP/MCP server (M3a).

## 2. Windows (003-D1)

Packaged builds create exactly **one** window: the overlay. `pnpm dev`
creates **two**: the overlay (the prod deliverable, chrome identical to
packaged) plus today's framed dev window (stage, A/B stages, panel —
untouched). Electron transparency is create-time, so the two chromes are
two windows, not one window with modes. The dev window remains the only
scenario-control surface; the overlay carries no panel.

## 3. Overlay window

Frameless, `transparent: true`, always-on-top at the standard floating
level, taskbar entry visible (the quit path until M5a's tray), created
hidden and shown after first paint (D13 — already the pattern). Size:
tight fit around the model at default Lar size (400 logical px tall, root
§7) plus a few px padding — width from the model's aspect ratio at load,
not hardcoded. First-run spawn: bottom-right of the primary display's
work area, 24px margin. Thereafter position memory owns placement
(003-D4): saved to a JSON in `userData` on drag release, restored on
launch, clamped into a visible work area if the saved spot is off-screen.

## 4. Click-through and hit-testing (003-D3)

The overlay window sets `setIgnoreMouseEvents(true, { forward: true })`.
On forwarded pointer moves the body hit-tests via the model's authored
`Body` hit area (`IRuntime.hitTest`) and reports over `stage:pointer`
(root §8); main toggles mouse-event capture accordingly. Cursor over the
body ⇒ interactive (drag possible); anywhere else ⇒ clicks land on the
desktop beneath.

**Pre-decided fallback — triggered.** A6 measured Hiyori's authored
`Body` hit area as a 96×136 box over her torso alone: no head, no hands.
The fallback therefore shipped, and per-pixel alpha readback
(`IRuntime.alphaAt`, one pixel per 30fps tick, overlay only) is what
gates click-through — the silhouette is the hit area. Bounding-box
testing stays rejected outright; an invisible click-eating rectangle is
the classic overlay bug. See 003-D3's outcome note.

## 5. Drag (003-D4)

Press-and-hold anywhere on the body drags the window; release drops and
persists position. Left button only, no modifier. Plain click and
right-click do nothing (D03 fence). The hit test that gates click-through
gates drag starts.

## 6. Feed broadcast (003-D2)

`affect:update` fans out to every live window instead of targeting the
scenario requester. The overlay mirrors playback using stage A's preset;
A/B comparison stays a dev-window affair. Scenario control routes are
unchanged and dev-window-only. The overlay's `body:inventory` report is
harmless duplication (console log today).

## 7. Acceptance (GWT)

**A1 — Two windows dev, one packaged.** GIVEN `pnpm dev` THEN overlay +
dev window both appear; GIVEN a production run (`pnpm build && pnpm
start`) THEN only the overlay exists.

**A2 — Click-through.** GIVEN the overlay over a desktop icon WHEN
clicking beside the body (inside the window rect) THEN the icon beneath
receives the click; WHEN clicking on the body THEN the overlay captures
it.

**A3 — Drag + memory (the gate's "in place").** GIVEN a drag to a new
spot and an app restart THEN the Lar stands where she was dropped.

**A4 — Clamped restore.** GIVEN a saved position off every visible work
area THEN she spawns snapped inside the nearest work area, fully visible.

**A5 — Single instance.** GIVEN a second launch THEN it exits immediately
and the first instance is unaffected.

**A6 — Hit-area coverage (gates 003-D3's fallback).** GIVEN the running
overlay THEN head, torso and hands all capture the cursor; misses ⇒ the
per-pixel fallback becomes a work item before the gate can close.
*Failed on the authored hit area (torso-only box), passes on the
per-pixel fallback that consequently shipped — measured with an alpha
coverage grid, not an eyeball.*

**A7 — Mirror.** GIVEN `recovery-arc` playing in the dev window THEN the
overlay Lar performs the same arc on the desktop.

**A8 — Alpha-clean (eyeball, both OSes).** GIVEN the overlay over light
and dark backgrounds THEN no white/dark fringing on her silhouette —
premultiplied-alpha check from D13.

A1–A5 agent-verifiable on Windows during the build; A6–A8 are eyes-on
items, macOS half on the maintainer's machine (as the M2a render smoke was).

**All green** — A6 only after 003-D3's fallback shipped. A6
turned out to be measurable rather than eyes-on: an alpha coverage grid
over the running overlay beats a squint, and it is what caught the
torso-only hit area.
