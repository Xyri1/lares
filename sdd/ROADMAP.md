# ROADMAP — Lares

**Artifact:** ROADMAP · **Project:** Lares · **Status:** Living · **Date:** 2026-07-24

Milestones are gated, not dated: each closes on its exit gate, and a slice doc set (SPEC, DECISIONS, PLAN under `sdd/slices/NNN-name/`) attaches per milestone. Sequence reflects dependency order, not importance.

---

## M0 — Clearances

FML per-character terms read for the bundled sample models, including copyright-notice format (D19). Cubism Core distribution read: bundled-with-notice vs user-loaded (D20). Register lares.io (deferred 2026-07-25 — not gate-blocking; land before M5b launch prep).
**Exit gate:** asset and Core licensing paths confirmed in writing; D19/D20 rows sealed. **Closed 2026-07-25** — `sdd/clearances/M0-clearances.md`.

## M1a — Canvas

pixi-live2d-display behind the runtime interface, inside the body (P6/D31); bundled sample model renders in a plain ordinary window — no overlay behaviors yet; renderer capped at 30fps; character package skeleton loads the model. Sequenced before the overlay chrome deliberately: the thesis risk lives in M2, and M2 needs only a rendered model, not a polished window.
**Exit gate:** the bundled model renders on macOS and Windows and every model parameter is drivable through the runtime interface. **Closed 2026-07-26** — A1–A7 green on both OSes; close-out notes in `sdd/slices/001-canvas/PLAN.md`.

## M2a — Soul

Affect engine as a pure TS module: two-timescale dynamics (emotion/mood), event ingestion, decay, per-source saturation, cue selection by affect distance — physics frozen against unit tests here, before any tuning (D28). Performance feed live brain→body; idle modulation body-side (breath rate, blink interval, sway amplitude driven by mood/arousal). In-app scenario player with the golden scenarios (brutal-debugging-session, smooth-build, long-wait-for-input, recovery-arc) at real and accelerated time — deterministic replay, side-by-side A/B playback, parameter-trace overlay: the player is the tuning harness, so it closes before tuning starts. Starter cue set for Hiyori (she bundles no `.exp3.json` — slice 001 close-out).
**Exit gate:** golden scenarios replay deterministically through the live engine driving the rendered model; physics unit tests green and frozen; A/B playback and trace overlay usable. Agent-verifiable by construction.
**Closed 2026-07-26** — A1–A7 green on Windows, render smoke on macOS; close-out notes in `sdd/slices/002-soul/PLAN.md`. Note the one gate defect that every automated check missed and only the eye caught: authored expressions were being overwritten before they were drawn.

## M2b — Performance

The D28 tuning ladder: subjective iteration confined to the affect→parameter mapping layer, descending the retreat rungs (continuous curves → exaggerated/body-weighted mapping → history-through-cues) as the owner judges — no timebox, no drop rule (D28 amended 2026-07-27); recordings at default Lar size (400 logical px model height, root §7) stay normative. Human-judged by design — fenced off from build work by the M2a gate.
**Exit gate:** history-dependence demonstrable on recording at the current rung. The full §9 criteria bind M5b (D28), not this milestone.

## M1b — Skeleton

Electron overlay chrome with the D13 care items: frameless transparent always-on-top window, forwarded-event click-through with model hit-testing, create-hidden-show-after-first-paint, drag with position memory, single-instance lock, screen-edge spawn sanity.
**Exit gate:** a Lar stands on the desktop on macOS and Windows — alpha-clean (no fringing on either OS), click-through outside the body, draggable, surviving restart in place.
M2b is human-paced (weekly A/B rounds with dead time between); M1b may interleave with it — sequence is dependency order, not calendar.
**Closed 2026-07-27** — A1–A8 green on Windows, smoke green on macOS; close-out notes in `sdd/slices/003-skeleton/PLAN.md`. The gate defect worth remembering: the model's one authored hit area covered her torso and nothing else, so A6 failed on it and 003-D3's pre-decided per-pixel alpha fallback shipped — the silhouette is the hit area.

## M3a — Nerves

Loopback HTTP server in main: event route + streamable-HTTP MCP endpoint; discovery file, no auth — Origin rejection + strict JSON content-type (D27). Embedded-Node hook forwarder. Session table with liveness and P10 aggregation. Emote protocol complete: cues, freeform expressions, duration, queue, caps; MCP server instructions carry the D26 adoption guidance. Closing this first freezes the wire contract before any adapter is written against it.
**Exit gate:** synthetic clients over real loopback HTTP (event route + MCP) drive the Lar end-to-end — caps enforced (S10-class checks), daemon down/up degrading gracefully (S9). Agent-verifiable, no real harness required.
**Closed 2026-07-27** — 171 tests green on Windows and macOS, visual smoke confirmed on both; close-out notes in `sdd/slices/004-nerves/PLAN.md`. The gate defect worth remembering was in the contract, not the code: A8's 50ms forwarder budget was written spawn-inclusive, which process startup alone makes impossible — 004-D8 re-bound it to in-script time.

## M3b — Senses

Claude Code adapter (command hooks incl. PostToolUseFailure and the `permission_prompt` Notification matcher, plus the MCP entry, auto-registered in one managed block — D29) and Codex adapter as a Lares plugin (hooks + MCP entry, GitHub-hosted marketplace, installed through Codex's own trust flow; JSONL fallback deleted — P11, D15 as amended). Harness skills are reinforcement only; both plugins now ship the same `emoting` skill. Verifications: Codex plugin-format and failure-signal recon against the installed version; one real-session emote-density measurement to calibrate D26's instruction wording.
**Exit gate:** a real Claude Code session and a real Codex session simultaneously drive the Lar end-to-end — baseline states via hooks, emotes via MCP — with the daemon down/up cycle behaving as designed (connection refused ⇒ agents degrade gracefully).
Live-smoke discovery (2026-07-28): Codex trust-reviews plugin hooks but never executes them (`plugin_hooks` removed upstream — D15 as amended), so the Codex half of the gate delivers MCP emotes only; the baseline-states half rides on the D15 design-around (user-level `~/.codex/hooks.json` writer). Slice 005 is frozen as implemented; slice 006 (`sdd/slices/006-codex-hooks/`) carries the writer and the remaining live checks, and closes this gate.
**Closed 2026-07-28** — user-level hooks writer live on both channels (standalone CLI proven in the 006 prelim research, desktop app at the live gate) and both OSes; both harnesses drove the Lar simultaneously with down/up degrading as designed. D26 density tuning deferred to post-demo by the maintainer (wording stands). Close-out notes in `sdd/slices/006-codex-hooks/PLAN.md`. The gate defect worth remembering: the plugin-hooks surface trust-reviews but never executes — caught by doing the prelim research live against the installed binary instead of trusting docs folklore.

## M4 — Format

Character package schema published (D08 shape: identity / expressions / renderer blocks) with the fully worked example. Expression auto-import from bundled `.exp3.json`/`.motion3.json`. Expression-authoring skill over the MCP surface (parameter inventory → compose → preview on the live character → user-accept → save). Import validation in-app plus the dev script.
**Exit gate:** a stranger following only the published docs imports a third-party Live2D model and produces a working character package, including at least one agent-authored gap expression.
Slice `sdd/slices/007-format/` opened 2026-07-28, scope settled by grilling: import as a dev script with directory-scan harvest (the model index is advisory — VTube-Studio-convention models index nothing; cue keys are artist names verbatim, null affect coords legal and emote-able), one brain-side exp3 apply path, four authoring tools with conversational user-accept, validation as a shared library function, docs with a synthetic worked example (Hiyori is the atypical reference; the commercial gate model stays local, never committed — D19). Calibration initiation is pull-only (D32); the tray dot + armed-mode surfacing lands at M5a. The gate stranger is a fresh docs-only agent session with the maintainer as the one human observer.
**Closed 2026-07-29** — The maintainer accepted the outcome despite a contaminated docs-only protocol: a fresh stranger in a separate checkout imported commercial IceGirl, mapped 13 bundled expressions, discarded 7 non-emotive toggles, left 3 motions intentionally null, authored 2 accepted low-arousal gaps, validated with no errors, and rendered the Lar live. Source reads were needed to work around character selection, MCP startup ordering, and non-tool-backed discard/rename, so this is not a pristine usability claim. Re-run the cold documented flow after M5a's managed character, packaged-startup, and calibration surfaces settle; close-out evidence and the regression checklist are in `sdd/slices/007-format/PLAN.md`.

**Post-close compatibility follow-up (2026-07-30):** slice `sdd/slices/010-format/` narrows the supported runtime to VTS-style Cubism SDK 3.0–4.2, explicitly rejects Cubism 2.1/5, adds an honest compatibility probe/report, and makes Haru the intended default after additive license/sound clearance. It extends the closed M4 path; it does not reopen or renumber slice 007.

## M5a — Ship

Tray-only product shell, persistent R9 settings, DND, launch-at-login,
managed character copies/import/switching (D33), and calibration
surfacing per D32. The disclosed update check runs on launch and every
24h while open, with a manual action; it never installs. Distribution
is deliberately local at this gate: manually built unsigned macOS 13+
universal DMG and Windows 10/11 x64 NSIS artifacts, with local-fixture
coverage for the future one-line scripts. Slice
`sdd/slices/008-ship/` opened 2026-07-29; skill files are excluded
while the maintainer performs the manual pass.
Slice `sdd/slices/009-claude-plugin/` opened and implemented
2026-07-29: the Claude Code adapter moves to a marketplace plugin
(hooks + MCP; D15/D29 as amended), the settings writer demoted to a
launch-time legacy cleaner. Same day the D15 fold-back tripwire
fired — the maintainer's re-smoke showed Codex executes plugin hooks after
all — so the `~/.codex/hooks.json` writer folded back too; both
harnesses now deliver hooks + MCP through their plugins, app-side
writers reduced to legacy cleaners. The exit gate below runs once,
after 009, verifying the plugin install story (marketplace add +
`/plugin install`) in place of silent registration.
**Configure Agent Integrations…** now makes that install story a
consented tray action: Lares delegates to each available harness's
official plugin CLI with fixed arguments, post-verifies exact status,
and leaves Codex hook trust to `/hooks` (008-D9).
**Exit gate:** manually transferred installers complete the documented
Gatekeeper/SmartScreen bypass and full tray/import/restart/update/
uninstall flow on a clean Apple Silicon Mac and clean x64 Windows
machine. No warning-free or public-release claim at M5a.

## M5b — Launch

GitHub Actions builds and publishes intentionally unsigned macOS and
Windows installers to the public GitHub Release page, the sole public
distribution channel. Release notes publish SHA-256 checksums, disclose
the unsigned artifacts, and document the exact Gatekeeper/SmartScreen
bypasses; production one-line installer URLs complete D30. Full §9
emotion criteria pass on recording (D28 — the deferred half of the M2b
gate; the one item that can bounce work back into tuning). Bilingual
README and docs (en, zh-CN, no preference); app-UI strings already
bilingual per amended D22, leaving installer strings to localize with
packaging here. Demo recordings cut from the scenario player. Launch.
**Exit gate:** §9 criteria on recording; public GitHub Release.

## Parking lot (post-v1, in no order)

Multiple concurrent Lares (per-session pets and affect isolation — D11's deferred half). Observer-LLM dual mode (D05's phase two). Agent-generated models, with the generation skill authoring pre-baked expression sets (D25). VRM/3D body attaching at the D31 performance feed, with its renderer block behind the D08 seam; richer body-mode feedback in the emote protocol (`status()` beyond active-body name — D31's deferred half); phase-2 service exploration. Additional harness adapters as community contributions via the protocol. Success-metrics regime, if ever wanted (D21 deferred it). Frame-rate governor and occlusion-paused rendering (v1 ships a flat 30fps cap — though Chromium already throttles a hidden window's rAF to ~0.2fps, observed at the M2a gate run, so part of this arrives for free). Climbing back up the M2b retreat ladder if the alpha shipped below rung (a).
