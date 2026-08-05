# 013-E3 — Body-motion visibility gate: the motion-proof phrase

**Artifact:** Experiment report · **Slice:** 013-feel · **Status:** Awaiting
maintainer visual verdict · **Date:** 2026-08-04

Blocking problem from E1/E2: the generator's parameters numerically traverse,
but at the product's normative 400 px size the rendered body reads as
effectively static. This gate exists to prove — by ordinary viewing, not
traces — that a generator-produced performance can visibly move, before any
E2 human semantic matrix runs. Nothing here changes `feel(V,A,C)`, adds an
axis, edits the root SPEC, or promotes any experimental channel; everything
is dev-only.

---

## 1. What changed and why

**Diagnosis** (from E1's traces plus E2's calibration): the generator's arm-A
writers oscillate at `gain 0.14 · amp 0.6 · weight 0.5 ≈ ±0.04` rig units of
a 2.0-unit range — invisible — while the E2 calibration proves arm-A's
rest → hand-on-hip sweep is *the most legible cue on the rig*. Most of the
arm signal was static posture bias (`expansion`), not movement; head/torso
oscillation is slow and subtle; torso lean is off-limits (latched semantic
posture). Raw traversal was never evidence of visible animation.

**The smallest generator-level correction:** an **authored motion phrase** —
a deterministic onset → hold → recovery envelope, added to the existing
generator in `src/renderer/src/synth/body.ts`
as pure character data on the existing grammar (`HARU_BODY.phrase`):

- **Envelope**: smoothstep attack 450 ms → hold 2200 ms (with a 0.75 Hz
  secondary "pump" oscillation) → smoothstep release 700 ms. Not a perpetual
  sine, not a posture change: a phrase with perceptible onset, movement, and
  recovery.
- **Blend**: each phrase writer names an **absolute** authored rig pose; the
  envelope convexly blends the writer's normal output toward it
  (`value += (pose + pump − value) · env`). Since the base output is in-range
  by E1's construction and every authored `|value| + pump` is in-range, the
  convex blend **cannot leave Haru's calibrated rig range**, at any corner,
  by construction.
- **Coordination** (all five ids are existing E1 writers — no new parameter
  is touched):

  | id | authored pose | pump | lag | role |
  |---|---|---|---|---|
  | `PARAM_ARM_L_A` / `PARAM_ARM_R_A` | −0.85 | ±0.13 | 0 | hands sweep from rest (≈0.15) into the calibrated hand-on-hip subrange and back — the dynamic arm-A movement |
  | `PARAM_BODY_ANGLE_X` | 4.5 | ±1.2 | 60 ms | torso weight-shift as the hands plant |
  | `PARAM_ANGLE_X` | 6 | ±1.5 | 140 ms | head turns, trailing the torso |
  | `PARAM_ANGLE_Z` | −11 | ±2.5 | 140 ms | head tilts, twin-tails swing — the follow-through |

- **Trigger**: a new dev-only `phrase(tMs)` method beside the existing
  `accent(tMs)`. Nothing in production calls it; the capture harness fires it
  once per spec (`spec.phrase.atMs`), exactly like the accent hook.
- `PARAM_ANGLE_Y` and `PARAM_BODY_ANGLE_Y` remain untouched — the latched
  semantic posture is never overwritten (verified byte-identical to the
  control in the trace diff below).

Harness changes, all reuse: `page.html` gains the phrase hook, the
`motion-proof` spec, and a `spec.stillAt` passthrough; `main.cjs`/`page.html`
gain an `ONLY=<name>` filter that re-captures named conditions in place and
merges `summary.json` instead of wiping all of `evidence/`; `viewer.html`
gains the motion-proof section. No second harness, no new dependency.

## 2. The generated clip

**`evidence/clips/motion-proof.webm`** — 150 frames, 5 s at 30 fps, normative
400 logical px Lar (root SPEC §7), seed 42, body-only (`withNeutralFace`
holds all six facial channels at the authored neutral, so the face cannot
rescue the result). Neutral latch `(0,0,0)`; the phrase fires once at
t = 0.8 s. Six stills (`evidence/stills/motion-proof-{0..5}.png`) bracket
baseline / attack / hold / hold / release / recovered.

**Control:** the pre-existing `evidence/clips/bodyonly-neutral.webm`,
untouched and reused as-is.

## 3. Measured traversal (from `evidence/traces/motion-proof.jsonl`)

Against the control's first 150 frames:

| id | min | max | span | path length | control span | control path |
|---|---|---|---|---|---|---|
| `PARAM_ARM_L_A` | −0.98 | 0.19 | **1.17** (59% of the 2.0 range) | **3.07** | 0.06 | 0.07 |
| `PARAM_ARM_R_A` | −0.98 | 0.19 | **1.17** | **3.03** | 0.08 | 0.08 |
| `PARAM_ANGLE_Z` | −13.50 | 2.39 | 15.88 | 45.65 | 2.70 | 2.88 |
| `PARAM_ANGLE_X` | −3.89 | 7.50 | 11.39 | 28.12 | 7.79 | 14.93 |
| `PARAM_BODY_ANGLE_X` | −2.10 | 5.70 | 7.80 | 19.08 | 4.20 | 7.09 |

Arm-A traversal is ~44× the control's and **dynamic**: it departs, holds with
visible pumping, and returns (final frames byte-equal to the no-phrase
sequence). The trace diff against `bodyonly-neutral` shows **exactly the five
phrase ids** differing, only during frames 25–128 (0.83–4.27 s); every facial
form id, breath, blink, `PARAM_ANGLE_Y`, and `PARAM_BODY_ANGLE_Y` value is
byte-identical to the control. Determinism: the harness generated the
sequence twice and compared before recording — `deterministic=true`.

**Preflight against the acceptance bar** (my own read of the stills at
native size, recorded here as preflight, not verdict): still 2 vs still 0 is
a whole-silhouette change — arms-at-sides to hands-on-hips with flared
elbows, shifted torso, tilted head — and the clip spends 3.4 of its 5
seconds in large motion. This is categorically unlike every E1 clip.

## 4. Deterministic test results

One focused check added to
`src/renderer/src/synth/body.test.ts`
(`013-E3 motion-proof phrase`), asserting in one run: byte-identical replay
(determinism); arm-A max > 0.05 and min < −0.7 with exact post-phrase
recovery to the no-phrase sequence (meaningful *dynamic* traversal of the
calibrated hip subrange, not posture); head-roll path > 2× and torso-yaw
path > 1.5× the phrase-less baseline (head/torso participation); every frame
writes only the grammar's body ids (no facial channel can be touched, so a
neutral face stays neutral); and every value in range on all nine corner
profiles with the phrase firing.

```
npx vitest run src/renderer/src/synth/body.test.ts \
               src/renderer/src/stage/affect.bodyExperiment.test.ts   # 22 passed
pnpm test                                                             # 357 passed, 3 skipped
pnpm build                                                            # clean
```

## 5. Reproduce and view

Regenerate only this gate's evidence (in place, ~40 s; the rest of
`evidence/` is untouched):

```
ONLY=motion-proof node sdd/slices/013-feel/experiments/harness/capture.mjs
```

View (motion-proof is the first section, phrase left, control right):

```
cd sdd/slices/013-feel/experiments
python3 -m http.server 8934 --bind 127.0.0.1
```

→ **http://127.0.0.1:8934/evidence/index.html** (opening
`evidence/index.html` directly via `file://` also works in Chrome).

## 6. Status — Awaiting maintainer visual verdict

The acceptance criterion is the maintainer's, not this report's: *at normal
size, on one ordinary playback, the body is unmistakably moving — without
inspecting traces, comparing stills, slowing playback, or replaying.* No
visibility claim is made here beyond the preflight note above.

Out of scope, unchanged: the E2 human semantic matrix (not run), the
`feel(V,A,C)` contract, SPEC §2/§6/§13, the character package format, and
every promotion decision listed in 013-E1 §8. The phrase, like the accent,
is unauthorized transition behaviour and stays dev-only behind the harness.
