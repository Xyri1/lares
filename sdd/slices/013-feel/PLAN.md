# Slice 013 — Feel · PLAN

**Artifact:** Slice PLAN · **Slice:** 013-feel ·
**Status:** I1–I6 complete; G1 closed as terminal gate ·
**Date:** 2026-08-03

Implements the approved slice per SPEC v0.2. Work lands on a slice
branch; every commit typechecks and passes vitest, and runtime behavior
cuts over at I4 — no parallel emote/feel compatibility path ever ships
(013-D6, no-backward-compatibility direction 2026-08-02). Each phase is
roughly one reviewable commit series.

## I1 — Pure performance math — complete

- New pure module (placement mirrors `synth/`: pure, no Electron, no
  wall clock): channel vector type, nine-anchor blend (SPEC §4),
  expressiveness scale + per-channel clamp, per-channel anchor merge
  (SPEC §13).
- Shipped default anchor set in channel space, seeded from
  `research/human-feeling-space.md` posture/gaze/energy findings; JSON
  data, not code.
- Property tests, porting the 2026-08-02 numerical check: anchor
  exactness, convexity at `k ≤ 1`, exact ray linearity and per-channel
  monotonicity from neutral, wire ±1 exactly half of ±2, Chebyshev
  full-strength at the shell, clamp-only-above-1, the §4 worked example
  verbatim.

## I2 — Body: blend, wiring, overlays — complete

- Stage consumes the new feed `{ feel | null, operational }`; the blend
  replaces the synth's `E`/`M` path; `null` performs the neutral anchor.
- Adapter wiring: `params[].source` as channel names; idle writers take
  the §13 channel-driven formulas; operational overlay compositing for
  `awaiting_input`/`error` at 0.6 weight, root §3 priority.
- One fixed critically damped ease, `TRANSITION_MS ≈ 700ms`, for target
  and overlay changes alike.
- Character loader: `anchors`/`operational` blocks, channel-name
  validation (loud at import, warn-skip at load); retired cue blocks
  become ordinary unknown keys.
- Default wiring fallback: a package without a `performance` block gets
  the shipped standard-id wiring (successor of `presets/default.json`);
  ids missing from the body inventory skip (013-D11).
- Rewrite `characters/haru/lar.character.json`: drop `expressions`
  affect coords, `cueMappings`, `renderers.live2d.cues`; re-source
  `performance.params`; optional Haru anchor overrides seeded by eye
  from its exp3 files.

## I3 — Brain: register, storage, attribution — complete

- Feel register keyed `(harness, session_id)`; atomic replace;
  `feel.json` write-through storage with the 64-key hygiene cap; boot
  restore; volatile `mcp:*` keys excluded.
- Attribution via the existing session table (open turn, else most
  recent live session); display selection = most recent valid report.
- New feed emission on change; `expressiveness` as a hidden `AppConfig`
  float field, parsed and clamped like `hostGuidance` is parsed today.
- Retire from the brain path: `AffectEngine` (decay, mood, saturation,
  queue, nudges), cue selection, D35 beat resolution in `sessions/`.
  Root §3 states, priorities, and liveness stay untouched.

## I4 — Surfaces: MCP, hooks, plugins — complete

- Server: add `feel` (schema, 2s rate cap, ack); remove `emote`,
  `list_performances`, `map_cue`, `save_expression`,
  `update_expression`; reshape `status()`; keep `list_parameters` and
  `preview_expression`. Protocol stays 2. New `instructions` copy per
  SPEC §8.
- Event route: optional `context` in the `POST /v1/events` response;
  forwarder waits for it on `UserPromptSubmit` only (inside the 500ms
  budget) and prints `hookSpecificOutput.additionalContext`; checkpoint
  copy per SPEC §10.
- Host guidance: swap `emote` for `feel` in the rule file and forwarder
  constant (byte-identical pair, existing test).
- Plugins: retire the `calibrate-lar` skill (its cue workflow died with
  `map_cue`); update plugin descriptions and READMEs; keep both manifests at
  `0.1.0` with no pre-launch compatibility path.

## I5 — Deletion sweep and dev tooling — complete

- Delete now-dead code: `cues.ts`, cue compositor paths in `compose.ts`,
  `synthReplay`/preset machinery tied to `E`/`M`, stale tests.
- Scenario player: event vocabulary swaps `emote` for `feel`; re-author
  the four goldens as feel-call scripts (`SCENARIO_CUES` retires);
  replay determinism (seeded rng, tick grid) is preserved.
- Dev panel: replace cue/A-B comparison controls with semantic V/A/C,
  operational-state, and expressiveness preview; display channel/wiring
  output plus live MCP→feel→feed→renderer tracing. Delete the second
  stage and comparison-only preset.

## I6 — Root artifact edits — complete

- Apply SPEC §15's delta table to root SPEC §§2–9.
- PRINCIPLES: replace P8 per the approved supersession map; PRINCIPLES
  teeth reference 013's acceptance instead of D28.
- DECISIONS: retire/annotate D07, D09, D25 (cue semantics), D26/D34
  reframe, D28, D35 per the map; ROADMAP marks the slice.

## G1 — Continuous assessment — closed as terminal gate

- Closed by maintainer direction on 2026-08-03: model behavior and
  human-visible rig quality require continuous reassessment, so one run
  cannot permanently seal them.
- SPEC §14 remains the repeatable matrix after material model, guidance,
  anchor, or wiring changes; findings feed M2b tuning, never the wire.
- This closure records no pass for the unrun real-model/viewer matrix
  (D36).

## Notes and risks

- The forwarder's response-wait on `UserPromptSubmit` treats the 500ms
  budget as a soft target, not a gate (maintainer direction 2026-08-02):
  no hard in-script cutoff lands with I4, harness-side hook timeouts are
  the outer bound, and measurement plus optimization happen in beta,
  after implementation.
- The scenario/dev-panel surface is the largest cue-coupled area outside
  the engine; I5 may grow. Golden re-authoring is deliberately last so
  live behavior never waits on tooling.
- Same-harness concurrency, Lar binding, and hibernation stay out
  (013-D8/future `0xx-lar-harness-binding`); nothing in I1–I6 may pre-build
  for them.
- The calibration workflow (wiring mapper, anchor authoring,
  channel/tuple preview, write tools, guidance) is deferred to its own
  slice (013-D11); hand-authored JSON against SPEC §13 is the interim
  path, and nothing in I1–I6 may pre-build for it either.
