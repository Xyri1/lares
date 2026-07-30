# Slice 003 — Skeleton · DECISIONS

Slice-scoped forks; root DECISIONS.md holds anything that outlives the
slice.

---

**003-D1 — Two windows in dev; the overlay is the only packaged window.**
*Chosen:* `pnpm dev` creates the overlay (prod deliverable) plus the
existing framed dev window; packaged builds create the overlay only.
Revises 001-D4's "not a separate debug window kept alongside" clause —
that decision assumed one window could switch chrome, but Electron
transparency is create-time, and doing scrub-and-replay tuning work on a
click-through transparent window is hostile ergonomics. *Rejected:*
overlay-chrome-only with the panel floating on it (tuning surface
degrades, M2b is live concurrently); a framed-mode flag swapping chrome
per run (two chromes, one window — judged recordings stop matching the
shipped presentation and the flag never dies). *Status:* decided
by the maintainer.

**003-D2 — The feed broadcasts; the overlay mirrors playback.**
*Chosen:* `affect:update` fans out to all windows; the overlay renders
with stage A's preset. Makes the overlay a live judging surface for M2b
(the face against the real desktop) instead of a breathing statue until
M3a. *Rejected:* overlay idles neutrally in dev (contributes nothing to
tuning; saves almost no code). *Status:* decided.

**003-D3 — Hit-test = the model's Body hit area; per-pixel alpha is the
pre-decided fallback.** *Chosen:* `hitTest` against Hiyori's single
authored `HitArea` (Body) — one call, no per-frame cost; coverage
verified by eye at A6. If head/hands miss, swap in throttled per-pixel
alpha readback (overlay window only) — fallback named now so a miss is a
work item, not a rethink. Nothing beyond (b) is built unless A6 fails.
*Rejected:* bounding box (invisible click-eating rectangle); building
per-pixel readback upfront (cost without evidence). *Status:* decided;
**fallback triggered and built** — see outcome.

*Outcome (A6, measured not eyeballed).* An alpha coverage grid over the
running overlay put Hiyori's one authored `HitArea` at a **96×136 px box
in the middle of a 301×416 window** — her torso and nothing else. Head,
hands and legs all dead; A6 fails on the authored test. The pre-decided
fallback therefore shipped: `IRuntime.alphaAt()` reads one pixel of the
drawing buffer per 30fps tick and the silhouette itself is the hit area.
Re-measured after the swap, coverage traces her outline, and the ~14px
gap between her legs correctly passes clicks through — verified through
the real `WS_EX_TRANSPARENT` flag at seven points (head, torso, both
legs, the gap between them, a corner, below her feet). `hitTest` stays
on `IRuntime` unused; it costs nothing and click reactions may want it
if D03's fence is ever revised. Cost of the fallback: pixi now runs with
`preserveDrawingBuffer: true` (both windows — one flag beat threading a
mode through the runtime constructor).

**003-D4 — Drag anywhere on the body; click and right-click inert;
position memory in userData.** *Chosen:* press-and-hold on the body
drags, release persists `{x, y}` to a JSON in `userData`; restore clamps
into a visible work area. No modifier, no grab zone, no click reactions
(D03), no menu (quit = taskbar until M5a's tray). *Rejected:* dedicated
grab zone (undiscoverable); click reactions (fenced). *Status:* decided.

**003-D5 — Geometry: tight fit, corner spawn, floating level.** *Chosen:*
window tight around the model at default Lar size (400px, root §7) —
minimal transparent area that must forward clicks correctly; first-run
spawn bottom-right of the primary work area, 24px margin; always-on-top
at standard floating level (not screen-saver-level aggression); taskbar
visible. *Rejected:* hide-from-taskbar (kills the only quit path);
generous window margins (more click-through surface to get wrong).
*Status:* decided.
