# ROADMAP — Lares

**Artifact:** ROADMAP · **Project:** Lares · **Status:** Living · **Date:** 2026-08-05

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
The affect engine and cue stack above remain historical close-out evidence; slice 013 retires them from the target runtime rather than carrying them forward.

## M2b — Performance

The original D28 history-through-cues tuning ladder is superseded by slice 013 and receives no further work. Root §9 / 013-S1–S11 now form a continuous assessment matrix for the deterministic `feel`→performance path, repeated when models, guidance, anchors, or wiring materially change. Findings create bounded tuning work here; they do not keep slice 013 or launch permanently open.
**Authored choreography (slice 014):** E1–E5 established that natural Live2D
body performance comes from complete character-authored phrases, not
independent parameter oscillators. Slice 014 promotes the accepted Haru E5
basis into the body: the `feel` wire and P6 feed stay unchanged; explicit
character mapping selects one complete renderer-local phrase on a displayed
feel change, then returns to the persistent latched target. E5 is the visual
quality floor.
**Status:** slice 014 complete. Its production matrix matched the accepted E5
quality floor, and the maintainer accepted the current animation quality
without opening further tuning. G1 remains closed as a terminal slice-013 gate
by D36; future findings create bounded work rather than keeping M2b open.

## M1b — Skeleton

Electron overlay chrome with the D13 care items: frameless transparent always-on-top window, forwarded-event click-through with model hit-testing, create-hidden-show-after-first-paint, drag with position memory, single-instance lock, screen-edge spawn sanity.
**Exit gate:** a Lar stands on the desktop on macOS and Windows — alpha-clean (no fringing on either OS), click-through outside the body, draggable, surviving restart in place.
M2b is human-paced; future slice-013 assessment may interleave with implementation work — sequence is dependency order, not calendar.
**Closed 2026-07-27** — A1–A8 green on Windows, smoke green on macOS; close-out notes in `sdd/slices/003-skeleton/PLAN.md`. The gate defect worth remembering: the model's one authored hit area covered her torso and nothing else, so A6 failed on it and 003-D3's pre-decided per-pixel alpha fallback shipped — the silhouette is the hit area.

## M3a — Nerves

Loopback HTTP server in main: event route + streamable-HTTP MCP endpoint; discovery file, no auth — Origin rejection + strict JSON content-type (D27). Embedded-Node hook forwarder. Session table with liveness and P10 aggregation. Emote protocol complete: cues, freeform expressions, duration, queue, caps; MCP server instructions carry the D26 adoption guidance. Closing this first freezes the wire contract before any adapter is written against it.
**Exit gate:** synthetic clients over real loopback HTTP (event route + MCP) drive the Lar end-to-end — caps enforced (S10-class checks), daemon down/up degrading gracefully (S9). Agent-verifiable, no real harness required.
**Closed 2026-07-27** — 171 tests green on Windows and macOS, visual smoke confirmed on both; close-out notes in `sdd/slices/004-nerves/PLAN.md`. The gate defect worth remembering was in the contract, not the code: A8's 50ms forwarder budget was written spawn-inclusive, which process startup alone makes impossible — 004-D8 re-bound it to in-script time.
**Post-close emoting research (2026-07-31):** slice `sdd/slices/011-interjection/` records the model-owned semantic-action direction: the agent voluntarily reports its own appraisal through the existing callable emote interface, independent of language and without Lares observing chain of thought or inferring from text. The discarded token branch has no SPEC or PLAN. Multilingual, cross-model, cross-harness behavioral evidence must justify any later instruction or protocol change (D34).
**Host-guidance follow-up (2026-08-01):** slice `sdd/slices/012-host-guidance/` records the first fresh adoption failure after tool exposure was verified and opens a second, host-level instruction vector (012-D1). MCP remains the canonical emote contract; concise plugin-delivered context will reinforce it without moving appraisal into hooks. Delivery is session-scoped per host (012-D4): an app-owned `~/.claude/rules/lares.md` on Claude Code and `SessionStart.additionalContext` on Codex, both gated on app liveness and a hidden settings toggle; per-turn injection was tried (012-D2) and retired. Its emote-based A/B moment-coverage gate (G1) was first superseded by slice 013's model-behavior matrix, then reclassified as continuous assessment by D36.
**Feel replacement (slice 013):** `sdd/slices/013-feel/` replaces the model-facing `emote(cue | params)` contract with the three-axis absolute `feel(valence, activation, control)` report. The fixed runtime cue vocabulary, freeform animation input, engine-owned emotional history, and hook-synthesized emotion are retired rather than retained as compatibility paths. Supplied Live2D expressions and motions remain physical assets, not agent-facing semantic choices. I1–I6 are implemented and the root contract is updated. D36 closes G1 as a terminal gate without claiming the unrun matrix passed; real-model behavior, shipped-anchor calibration, and 400px forced-choice viewing continue under M2b when material changes warrant them.
**Lar-instance binding follow-up (future `0xx-lar-harness-binding`):** binding
is deliberately outside slices 013 and 014. The deferred slice binds each Lar
instance to one harness; another harness requires another Lar instance. Lares
still launches every configured Lar, each in a visually identifiable
hibernation presentation, and wakes the bound Lar on its first valid
invocation. Hibernation is operational presentation rather than a neutral
feeling: it does not clear a previously latched `feel` tuple, which becomes
visible again on wake unless the waking invocation replaces it.

## M3b — Senses

Claude Code adapter (command hooks incl. PostToolUseFailure and the `permission_prompt` Notification matcher, plus the MCP entry, auto-registered in one managed block — D29) and Codex adapter as a Lares plugin (hooks + MCP entry, GitHub-hosted marketplace, installed through Codex's own trust flow; JSONL fallback deleted — P11, D15 as amended). At close, both plugins carried the same reinforcement skill and the gate measured emote density; slice 013 later removed the skill and replaced that behavioral obligation with `feel()` acceptance.
**Exit gate:** a real Claude Code session and a real Codex session simultaneously drive the Lar end-to-end — baseline states via hooks, emotes via MCP — with the daemon down/up cycle behaving as designed (connection refused ⇒ agents degrade gracefully).
Live-smoke discovery (2026-07-28): Codex trust-reviews plugin hooks but never executes them (`plugin_hooks` removed upstream — D15 as amended), so the Codex half of the gate delivers MCP emotes only; the baseline-states half rides on the D15 design-around (user-level `~/.codex/hooks.json` writer). Slice 005 is frozen as implemented; slice 006 (`sdd/slices/006-codex-hooks/`) carries the writer and the remaining live checks, and closes this gate.
**Closed 2026-07-28** — user-level hooks writer live on both channels (standalone CLI proven in the 006 prelim research, desktop app at the live gate) and both OSes; both harnesses drove the Lar simultaneously with down/up degrading as designed. The then-deferred D26 emote-density tuning is superseded by slice 013's model-behavior acceptance. Close-out notes in `sdd/slices/006-codex-hooks/PLAN.md`. The gate defect worth remembering: the plugin-hooks surface trust-reviews but never executes — caught by doing the prelim research live against the installed binary instead of trusting docs folklore.

## M4 — Format

Character package schema published (D08 shape: identity / expressions / renderer blocks) with the fully worked example. Expression auto-import from bundled `.exp3.json`/`.motion3.json`. Expression-authoring skill over the MCP surface (parameter inventory → compose → preview on the live character → user-accept → save). Import validation in-app plus the dev script.
**Exit gate:** a stranger following only the published docs imports a third-party Live2D model and produces a working character package, including at least one agent-authored gap expression.
Slice `sdd/slices/007-format/` opened 2026-07-28, scope settled by grilling: import as a dev script with directory-scan harvest (the model index is advisory — VTube-Studio-convention models index nothing; cue keys are artist names verbatim, null affect coords legal and emote-able), one brain-side exp3 apply path, four authoring tools with conversational user-accept, validation as a shared library function, docs with a synthetic worked example (Hiyori is the atypical reference; the commercial gate model stays local, never committed — D19). Calibration initiation is pull-only (D32); the tray dot + armed-mode surfacing lands at M5a. The gate stranger is a fresh docs-only agent session with the maintainer as the one human observer.
**Closed 2026-07-29** — The maintainer accepted the outcome despite a contaminated docs-only protocol: a fresh stranger in a separate checkout imported commercial IceGirl, mapped 13 bundled expressions, discarded 7 non-emotive toggles, left 3 motions intentionally null, authored 2 accepted low-arousal gaps, validated with no errors, and rendered the Lar live. Source reads were needed to work around character selection, MCP startup ordering, and non-tool-backed discard/rename, so this is not a pristine usability claim. Slice 013 retires the cue-calibration rerun obligation; current package and visible-performance gates live in root §§5/9. Close-out evidence remains in `sdd/slices/007-format/PLAN.md`.

**Post-close compatibility follow-up (2026-07-30):** slice `sdd/slices/010-format/` narrows the supported runtime to VTS-style Cubism SDK 3.0–4.2, explicitly rejects Cubism 2.1/5, adds an honest compatibility probe/report, and makes Haru the intended default after additive license/sound clearance. It extends the closed M4 path; it does not reopen or renumber slice 007.

## M5a — Ship

Tray-only product shell, persistent R9 settings, DND, launch-at-login,
managed character copies/import/switching (D33), and consented agent
integration setup. The disclosed update check runs on launch and every
24h while open, with a manual action; it never installs. Distribution
is deliberately local at this gate: manually built unsigned macOS 13+
universal DMG and Windows 10/11 x64 NSIS artifacts, with local-fixture
coverage for the future one-line scripts. Slice
`sdd/slices/008-ship/` opened 2026-07-29; skill files are excluded
while the maintainer performs the manual pass.
Release-hardening amendment (2026-08-07): new third-party model import is
deferred; the existing importer remains internal behind a disabled
**Import Character — Coming Soon** tray item.
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
consented tray action: Lares delegates to a compatible harness-owned
plugin manager with fixed mutation arguments, finds Codex through
either its standalone launcher or desktop-bundled manager,
post-verifies exact status, and leaves Codex hook trust to `/hooks`
(008-D9).
**Exit gate:** manually transferred installers complete the documented
Gatekeeper/SmartScreen bypass and full tray/bundled-character/restart/update/
uninstall flow on a clean Apple Silicon Mac and clean x64 Windows
machine. No warning-free or public-release claim at M5a.
**Closed 2026-08-07** — the maintainer confirmed A8/A9 passed on the
clean Apple Silicon macOS and x64 Windows targets; closure evidence is
recorded in `sdd/slices/008-ship/PLAN.md`.

## M5b — Launch

GitHub Actions builds and publishes intentionally unsigned macOS and
Windows installers to the public GitHub Release page, the sole public
distribution channel. Release notes publish SHA-256 checksums, disclose
the unsigned artifacts, and document the exact Gatekeeper/SmartScreen
bypasses; production one-line installer URLs complete D30. Slice 013's
continuous assessment can still bounce concrete regressions into M2b
tuning, but it is not a standing launch gate. Bilingual
README and docs (en, zh-CN, no preference); app-UI strings already
bilingual per amended D22, leaving installer strings to localize with
packaging here. Demo recordings cut from the scenario player. Launch.
**Exit gate:** public GitHub Release with the distribution requirements above.

## Parking lot (post-v1, in no order)

Multiple concurrent sessions within one harness, including per-session pets and feel isolation (D11's deferred half). Observer-LLM dual mode (D05's phase two). Agent-generated models and physical assets (D25). Interactive anchor/wiring calibration and authoring (013-D11). VRM/3D body attaching at the D31 performance feed, with its renderer block behind the D08 seam; richer body-mode feedback in `status()`; phase-2 service exploration. Additional harness adapters as community contributions via the protocol. Success metrics, if ever wanted (D21 deferred them). Frame-rate governor and occlusion-paused rendering. Further M2b tuning if slice 013's visible-performance gate exposes a gap.
