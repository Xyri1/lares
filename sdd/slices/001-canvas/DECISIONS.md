# Slice 001 — Canvas · DECISIONS

Implementation-scoped only; anything binding outside this slice goes to
`sdd/DECISIONS.md` with a D-number (rule agreed: if reverting
the slice wouldn't erase the decision's relevance, it's a root decision).

---

**001-D1 — Toolchain: pnpm + electron-vite + TypeScript strict + vitest.**
*Chosen:* electron-vite scaffold (main/preload/renderer builds + renderer
HMR preconfigured); pnpm (installed, strict node_modules); TS strict in
all three targets; vitest from day one (root SPEC §1 already names it for
`affect/`). *Rejected:* hand-rolled tsc+electron (chores, no payoff);
ESLint/Prettier now (add when it hurts); electron-builder (M5). *Status:*
decided.

**001-D2 — Live2D runtime package: pick at spike, criteria fixed now.**
Upstream `pixi-live2d-display` v0.4.0 is ~4 years stale and pinned to
PixiJS 6. Candidates: upstream 0.4 (most field-proven), the PixiJS-7
lipsyncpatch fork, `@jannchie/pixi-live2d-display` (PixiJS 8),
`@naari3/pixi-live2d-display` (PixiJS 8, claims Cubism 5 — would defuse
D24's known gap). *Criteria, in order:* Hiyori (Cubism 3/4) loads and
renders; parameter inventory + batch-write API completeness for IRuntime;
license (MIT-compatible); maintenance signal; code quality (D24 weights
this above officialness). PixiJS major follows the winning package —
newest major that passes, no dogma. *Status:* **resolved —
winner: upstream `pixi-live2d-display@0.4.0` + `pixi.js@6.5.10`** (first
candidate in order to pass cleanly; no tie-break needed). *Spike outcome:*
all four candidates initially failed identically on Hiyori — isolated
over three rounds to a **Cubism Core 5.3 regression** (clip-mask layout
crash in the shared Cubism-4 framework port; asset vintage and PixiJS
major ruled out empirically). Core ≤5.2 renders cleanly; maintainer-
acknowledged upstream as issue #118. **Standing constraint: the Core pin
stays ≤5.2 (`core/05`) for this renderer** — enforced in
`scripts/fetch-assets.mjs`; Cubism 5 is now explicitly out rather than
the release tripwire (root D24/010-D1). Strike noted
for `@naari3` fork: its `setRenderer()` is dead code, render hookup only
works via an undocumented `window.app` global. Adapter facts from the
spike: param inventory via `coreModel._model.parameters` parallel arrays;
writes need explicit `coreModel.update()` before render to reach the
mesh; expression/motion/hit-test via public `Live2DModel` API.

**001-D3 — No model assets in the repo; fetch script + gitignore.**
*Chosen:* `pnpm fetch-assets` downloads Cubism Core and the Hiyori sample
into gitignored paths; committed files are only our manifest, NOTICE, and
license texts. Core exclusion is compelled (D20 §6.8). Hiyori exclusion is
The maintainer's repo-hygiene call — the FML read would permit
committing it (M0 clearance), we choose not to. *Cost accepted:* one extra
setup step; dev docs must say so. *Status:* decided.

**001-D4 — Plain framed window now; it becomes the M1b overlay later.**
One window whose chrome changes at M1b (frameless/transparent/click-
through), not a separate debug window kept alongside. Dev parameter panel
survives behind a dev flag as the debugging surface. *Status:* decided.
**Revised by 003-D1:** dev runs keep this framed
window alongside the overlay (transparency is create-time, so chrome
can't switch in place); packaged builds ship the overlay only.

**001-D5 — Gate harness = in-renderer dev panel.** Parameter list,
per-param slider, sweep-all button, FPS readout. Chosen over a scripted
headless check because the gate is visual (renders, moves); over devtools
console driving because sweep-all must be one repeatable click on both
OSes. *Status:* decided.
