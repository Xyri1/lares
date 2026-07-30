# Slice 003 — Skeleton · PLAN

Execution notes; disposable after the gate closes. Steps ordered by
dependency; each ends in something runnable.

---

## 1. Overlay window in main (003-D1, 003-D5)

`createOverlayWindow()` beside the existing `createWindow()`: frameless,
`transparent: true`, `alwaysOnTop` (floating), `show: false` +
`ready-to-show` (pattern already in place), no menu bar. Dev creates
both windows; packaged creates the overlay only (`is.dev` branch).
Renderer entry: same page with a `?mode=overlay` query — stage boot
skips the panel mount and sizes to the model. Single-instance lock
(`app.requestSingleInstanceLock()`; loser quits) lands here too.
Initial size: placeholder constant until step 2 reports model bounds;
spawn bottom-right of primary work area, 24px margin.

## 2. Overlay renderer mode + tight fit

Stage boot reads the mode: overlay ⇒ no dev panel, model at default Lar
size (400px — the runtime already pins this), window resized to model
bounds + padding via one IPC (`window:fitToModel` or reuse of the
existing size channel). Verify A1.

## 3. Feed broadcast (003-D2)

`scenario:play`'s `onFeed` targets `BrowserWindow.getAllWindows()`
instead of the requesting sender (guard destroyed webContents — pattern
already there). Overlay subscribes with stage A's preset; scenario
control and synth-trace return stay dev-window-only. Verify A7.

## 4. Click-through + hit-test (003-D3)

Overlay only: `setIgnoreMouseEvents(true, { forward: true })`; on
forwarded `pointermove` the stage hit-tests (`IRuntime.hitTest` → Body
hit area) and sends `stage:pointer` (root §8 shape) on transitions;
main toggles `setIgnoreMouseEvents` accordingly. Throttle to the 30fps
tick. Verify A2, then the A6 eyeball — a head/hands miss activates
003-D3's per-pixel fallback as a work item before the gate.

## 5. Drag + position memory (003-D4)

Pointer-down over the body starts a drag (screen-coord deltas →
`win.setPosition`); release writes `{x, y}` to `userData/window.json`.
On launch: restore if saved, clamp into the nearest visible work area
(pure function — unit-test the clamp), else first-run spawn. Verify
A3–A4.

## 6. Tests

Pure logic only: the restore-clamp function (in-bounds, off-screen,
monitor-gone cases) and any position-persistence shape guard. Window
chrome, click-through and alpha are visual by design — the gate
checklist covers them.

## 7. Gate run

Windows first: A1–A5 scripted/checklisted, A6/A8 eyeballed, A7 with
`recovery-arc`. Then macOS on the maintainer's machine: fresh pull, same
checklist, fringing check over light and dark wallpapers. Both green ⇒
mark ROADMAP M1b closed with date, note the 003-D3 outcome (Body hit
area sufficient or fallback built), close out here.

**Closed — both halves green, ROADMAP M1b marked closed.**

Windows: A1 both halves (dev = overlay + control window; `pnpm build &&
pnpm start` = overlay alone), A2, A3, A4, A5, A6, A7 verified against
measured window geometry and the real `WS_EX_TRANSPARENT` flag rather
than by eye; A8 eyeballed. macOS: fresh clone of master, smoke green —
nothing wrong, fringing included.

The gate's one real defect was A6, and only measurement caught it: the
authored hit area is a 96x136 box over her torso, so head and hands
captured nothing. 003-D3's pre-decided fallback shipped in its place —
see the outcome note in DECISIONS.md. Naming the fallback up front is
what turned that from a redesign into an afternoon.

Two things worth carrying into the macOS run:

- `is.dev` is `!app.isPackaged`, so it is still true under
  `electron-vite preview` and A1's production half fails if window
  creation branches on it. The dev *server* variable is the honest
  discriminator (`IS_DEV_RUN` in main); keep it that way.
- Forwarding must be re-applied on `did-finish-load`, not once at
  construction, or no pointer move ever reaches the hit test. Worth
  re-checking on macOS, where navigation timing differs.

A test-harness note, since it cost real time here: `SetCursorPos` moves
the cursor without producing the injected input Chromium reacts to, so
forwarded moves never arrive and every click-through check reads as a
false failure. Drive A2/A3 with `mouse_event`/`SendInput` instead.

## Standing risks

- Transparent + always-on-top + `forward: true` behaves differently
  across Windows DWM and macOS spaces; the D13 field evidence says the
  combination works, but fringing (A8) and forwarded-event quirks are
  exactly where the eyeball items live. Budget a real desktop session
  per OS, not a glance.
- Two windows double the WebGL contexts in dev only; if dev-machine GPU
  load annoys, the overlay can be closed during pure tuning sessions —
  no code needed.
- `windows.json` restore interacts with per-monitor DPI scaling on
  Windows; the clamp works in DIP coordinates (Electron's default) —
  resist raw-pixel math.
