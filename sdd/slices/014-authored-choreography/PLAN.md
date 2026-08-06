# Slice 014 — Authored choreography · PLAN

**Artifact:** Implementation plan · **Slice:** 014-authored-choreography ·
**Status:** Complete; G1 passed · **Date:** 2026-08-05

Implement one Haru-first vertical path. Each phase ends at an independently
verifiable gate; no periodic scheduler, new semantic input, or authoring UI is
pre-built.

## I1 — Character contract and pure planner — complete

- Add the `renderers.live2d.choreography` types and parser to the existing
  manifest module; registered `{group,index}` entries only.
- Validate references against the model's existing registered-motion inventory
  in the same candidate/managed-package paths used by current validation.
- Pass the parsed block through bootstrap and transactional character switch.
- Add a pure phrase planner reusing slice 013's `m`, projected corner weights,
  and corner keys; cover all 125 legal tuples in one table-driven test.
- Remove production app-config influence from `expressiveness`; keep only the
  explicit dev preview path at `k != 1`.

**Gate:** schema failures are loud and transactional; exact/half corner rays,
ambiguous directions, neutral, missing mappings, and modulation formulas pass
without Electron.

## I2 — Deep managed-motion runtime — complete

- Extend the existing `IRuntime` motion seam with one managed-play operation
  and cancellation; do not expose pixi motion-manager objects to the stage.
- In `Live2DRuntime`, graduate only the E5-proven mechanics: disable random
  authored idle when choreography is configured, scale motion time and
  displacement, retain feel-owned facial overrides, preserve authored Part
  curves, force managed playback to one asset-duration cycle even when the
  source loops, and settle actual body values over 700 ms.
- Use the loaded motion's duration plus the fixed 250 ms grace as the finish
  watchdog. Contain load/start/stop failures, warn once per bad reference, and
  reset Parts to model defaults on every non-normal exit.
- Keep ordinary `playMotion()` behavior for explicit physical preview and for
  characters without choreography.
- Add the smallest runtime test that fails if ownership order, interruption, or
  finish settlement regresses.

**Gate:** a registered A-pose and B-pose motion can start, interrupt, complete,
and settle with no stale manager state or parameter snap; a looping motion and
a suppressed finish event still stop once; physics/pose still run after primary
writes.

Deterministic runtime coverage passes. I4 production captures cleared the
remaining physical question: Parts persisted through normal completion and
reset correctly across replacement and operational interruption.

## I3 — Stage lifecycle — complete

- Integrate the pure planner at the current feel→stage seam. The stage owns one
  trigger key and one pending 1200 ms timer—no queue and no periodic clock.
- Cancel/supersede correctly on tuple replacement, preview change, character
  transaction, reset, and teardown. Exact duplicate tuples remain inert.
- Make prepare visibly inert; commit/rollback schedule only a non-null latch
  outside a loud overlay, and let overlay clear perform the single deferred
  schedule.
- Make `awaiting_input`/`error` cancel choreography and prevent start; schedule
  the unchanged latch once when the loud overlay clears.
- Make scenario/manual preview use the same path without mutating the latch.

**Gate:** fake-clock tests prove one start per change, none per duplicate or
elapsed interval, correct overlay priority, and rollback-safe character state.

## I4 — Haru and production evidence — complete

- Add the accepted E5 mapping and `Idle[1]` fallback to Haru's character
  package.
- Capture all sixteen full/half conditions through the production path, not the
  experiment-only branch, plus mid-motion replacement and operational-overlay
  interruption.
- Generate the gitignored local `evidence/index.html` under this slice, with
  its helper code, clips, traces, and stills kept below `evidence/`. Put
  production captures beside linked frozen E5 references and keep identities
  masked until each verdict is recorded.
- Exercise one corner through the loopback `feel()` path and one three-minute
  latched hold.

**Gate:** deterministic traces establish bounded ordering and exact settlement;
the evidence page is ready for the maintainer quality comparison.

## I5 — Replace the rejected experiment and reconcile contracts — complete

- Delete the E1 production-side dev seam: `synth/body.ts`, its tests, the body
  generator branch in the affect driver, the runtime idle toggle, and its panel
  controls. Preserve only the Markdown experiment reports and research as
  committed historical evidence; experiment harnesses and generated evidence
  remain local and gitignored.
- Update root D08/D25/D31, root SPEC §§7–9, and slice-013 D5/D9/D10 wording to
  the accepted authored-basis contract. Do not alter `feel()` or the P6 feed.
- Confirm every former “binding is slice 014” reference points to future
  `0xx-lar-harness-binding`.
- Run `pnpm test`, `pnpm build`, `git diff --check`, and a fresh-reader review
  across SPEC/DECISIONS/PLAN.

**Gate:** only one production body path remains; root and slice contracts agree;
all deterministic checks pass.

## G1 — E5-quality production acceptance — complete

At 400 logical px, the maintainer compares the I4 production matrix against
the accepted E5 row and records:

| verdict | required result |
|---|---|
| all eight full corners | at least E5 naturalness and expressiveness |
| every half pair | same direction, visibly intermediate commitment |
| high/low activation | ordered without weakening quiet full corners |
| A/B pose transitions | no pop, forearm hinge, or stale pose |
| phrase completion | returns to the current latch, never neutral |
| operational interruption | `awaiting_input`/`error` wins, then feel returns |
| three-minute hold | no repeat phrase and no semantic drift |

**Maintainer verdict — pass.** At 400 logical px, all sixteen masked
production-versus-E5 full/half comparisons were judged equivalent. The
maintainer accepted the current animations as good enough and requested no
further optimization. Production-only viewing plus the I4 traces found no
blocking pop, isolated-forearm hinge, stale pose, neutral return, replay, or
semantic drift; slice 014 therefore meets the E5 quality floor.

The masked decisions, reveal, and signed verdict remain local in
`evidence/record.md`; the final verdict above is their committed slice record.

G1 closed slice 014 after the deterministic gates and visual comparison passed.
Any later failure stays bounded to composition or character content; it does
not reopen the semantic contract.

## Sequencing notes

- I1 → I2 → I3 is dependency order. I4 follows the first complete vertical
  path; I5 deletes the rejected path only after replacement evidence exists.
- Existing unrelated worktree changes are preserved. The implementation must
  identify which E1 experiment edits it is replacing rather than blanket-reset
  `src/`.
- `0xx-lar-harness-binding`, same-harness concurrency, calibration UI, loose
  motion mapping, and new Haru content remain deferred.
