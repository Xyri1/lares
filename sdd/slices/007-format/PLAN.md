# Slice 007 — Format · PLAN

Execution notes; disposable after the gate closes.

---

## 1. Foundations (pure, vitest)

Extend `src/main/characters/`: manifest schema for path-form
expression references and `authored/` entries; the validation library
function (007-D7) with its report shape; the exp3 parser
(Add/Multiply/Overwrite against model defaults, cdi3 display-name
resolution — A5's hand-computed fixtures). Loader: replace hardcoded
`hiyori` with the directory scan (zero/one/many — A4).

## 2. Import script

`scripts/import-character.mjs` (`pnpm run import --`), sharing the manifest/
validation module with main (pure TS already). Directory scan ∪
index, dedupe, verbatim CJK keys, package-relative paths, null
coords, report + closing hint. `--check` flag. Synthetic fixtures
committed for A1 (VTube-shaped: loose CJK exp3s, empty index) and A2
(SDK-shaped: indexed motions, no exp3). IceGirl is never committed.

## 3. Apply path + preview channel

Brain-side exp3 load → slider batch → existing pipeline;
`authoring:preview`/`authoring:revert` over the §8 feed (already
spec'd, unimplemented); body applies via `setParams`/`playMotion`
with affect blending and idle drift suspended for the held preview.
Hold/replace/revert/60s-timeout state machine lives brain-side.

## 4. MCP tools

`list_parameters`, `preview_expression`, `save_expression`,
`update_expression` beside the existing three in `server/server.ts`
(007-D5 semantics; collision/unknown refusals; ≤50 authored cap).
Manifest writes read-modify-write with atomic rename — same
discipline as the 005 settings writers. A6 against a real MCP client
over loopback.

## 5. Docs

`docs/character-format.md` per slice SPEC §6: schema reference,
walkthrough, mapping-flow prompt block (calibrate-with-discard,
optional renaming, conversational accept), synthetic example, Hiyori
caveat. Root README pointer.

## 6. The gate (A7, eyes on)

Drop IceGirl into `characters/icegirl/runtime/`, fresh agent session,
docs only, the maintainer observing: import → calibrate (discard the
accessory toggles: cat ears, crown, wings, outfit…) → author ≥1 gap
expression (e.g. "weary" — her set has nothing low-arousal) → running
Lar. On pass, mark M4 closed in ROADMAP with close-out notes here.

**Close-out (maintainer, live).** M4 closes on an owner-accepted
outcome verdict. In a separate checkout, a fresh
Claude Opus 5 session imported commercial IceGirl: 23 cues harvested;
13 bundled expressions mapped conversationally; 7 non-emotive
accessory toggles discarded; 3 motions deliberately left null; 2
accepted gap expressions (`calm`, `weary`) authored; final `--check`
returned `ok: true` with 15 calibrated cues and no errors; the Lar
rendered the previews live.

The protocol was contaminated and is not recorded as a pristine
docs-only pass. The stranger read source to work around Hiyori winning
alphabetical selection, an MCP client that bound tools before Lares
started, and discard/rename lacking tool support; its questions also
seeded most cue readings. The maintainer accepted the demonstrated product
outcome as sufficient to close M4.

**Post-M5a regression pass.** Re-run the cold documented workflow once
D33 managed import/switching, packaged startup, and D32 calibration
surfacing settle. Recheck docs-only isolation, active-character
selection, MCP availability/reconnect, discard/rename persistence,
affect-plane coverage and intentionally-null terminal state, licence
metadata, `--check` ordering, motion mapping guidance, and authored
Overwrite/blink behavior.

## Standing risks

- **CJK paths through `lares://`:** asset URLs must round-trip
  non-ASCII paths (encode/decode at the protocol handler); test with
  a CJK fixture before the gate.
- **IceGirl's empty EyeBlink/LipSync groups:** standard blink
  modulation may find no params — import report should note missing
  idle-modulation hooks; body copes (blink simply doesn't modulate).
  Not gate-blocking.
- **Preview vs idle drift:** suspending idle modulation for a held
  preview touches body `synth/` — keep the suspension scoped to
  previewed params only, so the character keeps breathing.
- **Blend "Add" baselines:** additive values against non-default
  current sliders can double-apply if the preview path composes with
  live affect output — the exact-render channel must start from model
  defaults, not current pose.
- **Motion preview length:** motions play once and end; the hold
  semantic applies to expressions only — preview of a motion is
  fire-and-observe. Say so in the tool description.
