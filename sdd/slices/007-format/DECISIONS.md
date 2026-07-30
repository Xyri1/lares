# Slice 007 — Format · DECISIONS

Slice-scoped forks settled at the slice grilling. The
initiation-consent design (pull-only calibration, tray dot + armed
mode at M5a) was promoted to root D32 by the maintainer. D08/D09/D25 all
stand unamended; root SPEC §2/§5 received the additive refinements
recorded here.

---

**007-D1 — Import is a dev script; the app only validates-and-loads.**
*Chosen:* `pnpm run import --` — setup-time, testable against fixtures,
output inspectable before the app touches it (`pnpm import` is pnpm's
built-in lockfile command); the app's launch job
stays validate-and-load, failing loudly (P7). Character selection is
a directory scan — one package expected (the maintainer runs one model at a
time), warn-and-pick-first on multiple, loud error on zero. The M4
stranger is a source-clone user; user-level character locations are
M5a's problem. *Rejected:* in-app auto-generation on load (a write
path inside the app for no gain, first-launch behavior dependent on
disk state); a selection mechanism (no second user exists).
*Status:* decided by the maintainer.

**007-D2 — Harvest by directory scan; the model index is advisory.**
*Chosen:* recursive scan for `.exp3.json`/`.motion3.json`, unioned
with index entries, deduped; cue keys are the artist's names verbatim
(CJK included — agents read them natively, so renaming is optional
polish, never workflow); cue entries reference files by
package-relative path and never copy slider values (the manifest is a
mapping layer, per the maintainer). Motions are harvested alongside
expressions — they are half a typical model's expressive wealth; the
calibration flow's discard step handles non-emotive ones. *Evidence:*
IceGirl (VTube Studio convention) indexes zero of her 21 expressions
and 3 motions; Hiyori indexes motions only. *Rejected:* trusting
`FileReferences`; name-translation at import; expressions-only
harvest. *Status:* decided by the maintainer.

**007-D3 — Null affect coords are legal and emote-able.** *Chosen:*
import yields an immediately expressive character: null-coord cues
play via `emote(cue)` with a zero nudge; only the engine's autonomous
affect-distance selection ignores them. Calibration upgrades
"agent-drivable" to "self-animating." `list_cues` marks uncalibrated
cues; `status()` carries the count as inert data. Assignment is
agent-by-eye through the authoring loop (preview on the live
character, propose, user accepts) with hand-edited JSON as the
documented fallback. *Rejected:* name-heuristic coord tables
(worthless on `F01`/`m01`, wrong on a rigger's "smile"; IceGirl's
semantic legend lives in a readme, not the data); import failing on
unmapped cues (auto-import could then never produce a loadable
package). *Status:* decided by the maintainer.

**007-D4 — One brain-side exp3 apply path; artist files read-only.**
*Chosen:* Lares parses exp3 itself (Add/Multiply/Overwrite against
model defaults, display names via cdi3) and applies through the
existing slider pipeline — one path for bundled and authored alike,
forced by reality: pixi-live2d-display loads expressions from the
model index, and IceGirl-class models index nothing, so the "native"
path would load zero of her expressions. Authored expressions are
real `.exp3.json` files under `authored/` following the ecosystem
convention (the maintainer's ruling, overruling the inline-params
simplification), loaded by the same parser — no model-index patching,
no artist-file edits, ever. *Rejected:* patching `model3.json` to
register authored files (editing the artist's file, breaks on model
updates); inline-params-only authored cues (breaks convention).
*Status:* decided by the maintainer.

**007-D5 — Tool surface: four narrow tools, dedicated preview
channel.** *Chosen:* `list_parameters`, `preview_expression`
(the §8 `authoring:preview` channel — exact, no affect blending,
hold until replaced/reverted/60s timeout; also previews existing
cues incl. motions), `save_expression` (create; refuses collisions),
`update_expression` (update; coords for any cue, sliders for
authored only, refuses unknowns — the Save/Save-As pair, named by
the maintainer). Create-vs-update as separate tools because optional-param
polymorphism flipping semantics is what agents fumble; both share
the manifest-patch code. *Rejected:* reusing `emote` freeform as the
preview (routes through blending/queue/decay — imprecise for
calibration); one dual-mode save tool; root SPEC's earlier 5s
auto-revert and in-app pending-acceptance sketch (superseded,
root SPEC amended). *Status:* decided by the maintainer.

**007-D6 — User-accept is conversational.** *Chosen:* the flow text
mandates preview → ask → save; enforcement is the collision refusal
plus the user watching their own desktop. A rogue save writes one
deletable file — recoverable, sole-user scope. If D29's consent-UX
revisit ships UI at M5b, acceptance UI can ride along. *Rejected:*
in-app acceptance dialog (ceremony; its only customer is a
hypothetical untrusted agent). *Status:* decided by the maintainer.

**007-D7 — Validation is a library function with three callers.**
*Chosen:* pure function in `src/main/characters/` (schema, reference
resolution, ranges, exp3 parseability, report); callers: import
script (always), `--check` (report-only), app at load (loud). M5a's
real import flow becomes a fourth caller for free — the requested
fold-in is free because the logic never lived in a script.
*Rejected:* a separate `pnpm validate` script (second entry point,
drift). *Status:* decided by the maintainer.

**007-D8 — Docs example is synthetic; IceGirl stays local.**
*Chosen:* `docs/character-format.md` carries an inline synthetic
worked example of the happy path; Hiyori is documented as the
atypical all-raw-params reference (she bundles no exp3, so she
demonstrates the escape hatch); IceGirl — purchased commercial
license — is gate material only, never committed (D19 discipline).
The mapping-flow prompt block in the same doc is M4's skill
delivery. *Rejected:* Hiyori as the primary example (misleading);
committing IceGirl (redistribution). *Status:* decided
by the maintainer.
