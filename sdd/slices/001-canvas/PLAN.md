# Slice 001 — Canvas · PLAN

Execution notes; disposable after the gate closes. Steps are ordered by
dependency; each ends in something runnable.

---

## 1. Scaffold (001-D1)

`pnpm create @quick-start/electron` (electron-vite, TS template) → strict
TS, vitest wired, repo layout started per root SPEC §1 module map — only
the dirs this slice uses: `src/main/characters/`, `src/main/config/`,
`src/renderer/stage/`, `src/renderer/runtime/`. Commit the scaffold clean
before touching it. AGENTS.md "Commands" section gets its first content:
`pnpm dev`, `pnpm test`, `pnpm fetch-assets`.

## 2. Asset fetch script (001-D3)

`scripts/fetch-assets.mjs` (Node 24 built-in fetch; `fflate` for the zip —
only new dep). Sources: Cubism Core from Live2D's official CDN/SDK
distribution; Hiyori zip from the official sample-data page (capture exact
URLs as script constants when written). Targets (gitignored):
`vendor/live2d/live2dcubismcore.min.js`, `characters/hiyori/runtime/`.
Idempotent: skips existing files, `--force` re-downloads. Commit NOTICE +
license texts per M0 clearance wording.

**License hooks while here (from `sdd/clearances/M0-clearances.md`):**
download the Cubism SDK for Web zip once, confirm `live2dcubismcore` is
listed in `RedistributableFiles.txt` (§1.15 authority) — record the result
as a one-line addendum in the clearance note.

## 3. Runtime spike (001-D2 — resolves the open decision)

Bare page: PixiJS + candidate package + Core + Hiyori. Try candidates in
001-D2 order against its criteria; first clean pass wins, ties broken by
code quality. **Read the Live2D Open Software License now** — every
candidate vendors the Cubism Framework (second M0 clearance hook; addendum
to the clearance note; escalate to the maintainer only on a surprise). Record the
winner + PixiJS major in 001-D2. Timebox: one day; if all four candidates
fail on Hiyori, that's a D24-level surprise → stop, escalate.

## 4. IRuntime adapter

`src/renderer/runtime/`: implement slice SPEC §3 over the winner.
Inventory extraction, batch writes with clamp/drop (A4), expression via
raw params, motion playback, hit-test passthrough, 30fps ticker cap.
Nothing outside `runtime/` imports the package (root §8) — enforce by
convention now, lint rule if it's ever violated.

## 5. Package skeleton + load flow

`src/main/characters/`: manifest read + M1a checks (slice SPEC §4,
hand-rolled guards — full schema validation lands M4). IPC: main sends
the `renderers.live2d` block; renderer loads via IRuntime and reports the
inventory back (first real `body:inventory` message, root §8 shape).
Commit `characters/hiyori/lar.character.json` (`format: "lares/1"`,
identity block with FML notice in `license`, model path into the
gitignored runtime dir; `expressions`/`cues` empty — M2/M4 fill them).
Failure path: readable in-window error (A5).

## 6. Dev parameter panel (001-D5)

In-renderer panel behind a dev flag: param list from `parameters()`,
sliders → `setParams`, sweep-all (each param min→max→default, sequential),
FPS readout, motion-play button (A7). Ugly is fine; it's the gate harness
and the future debug surface.

## 7. Tests

vitest on pure main-side logic only: manifest checks (valid / bad format /
missing path), clamp/drop logic if factored pure. GL rendering is not
unit-tested — the gate is visual by design. One test file per module,
no fixtures beyond two tiny manifest JSONs.

## 8. Gate run

Windows first (dev machine): A1–A7 checklist from slice SPEC §6, recorded
(OS screen capture). Then macOS: fresh clone, same checklist. Both green ⇒
gate closed: mark ROADMAP M1a closed with date, note `.exp3.json`-ref
status (A7), fold 001-D2 outcome into root DECISIONS D24 row if the
winner isn't upstream (that choice outlives the slice).

## Close-out

Gate closed: A1–A7 green on Windows and macOS. Notes:

- **A7 exp3-ref status:** Hiyori ships no `.exp3.json` (motions only); the
  ref-form of `applyExpression` is exercised by raw params only, deferred
  to the first model that bundles one — per slice SPEC §6.
- **001-D2 fold:** winner is upstream `pixi-live2d-display@0.4.0`, so no
  D24 edit needed; the Core ≤5.2 pin and its tripwire are recorded in
  001-D2 and enforced in `scripts/fetch-assets.mjs`.
- **Gotcha found at the macOS gate run:** `pnpm dev` fails with
  `Error: Electron uninstall` on Node 24.x older than 24.18.0 — fix is
  updating Node.

## Standing risks

- Candidate-package quality unknown until step 3; timebox guards it.
- Premultiplied-alpha fringing is *not* checked here (plain window, M1b
  concern) — don't chase ghosts if edges look soft on white.
- Node/Electron ABI quirks with pnpm on Windows: if `pnpm dev` misbehaves,
  check electron-vite issue tracker before blaming the scaffold.
