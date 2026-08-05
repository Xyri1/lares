# 013-E1 — Can `feel(V, A, C)` condition a full-body generator?

**Artifact:** Experiment report · **Slice:** 013-feel · **Status:** Complete,
deterministic results only · **Date:** 2026-08-04

Bounded, reversible experiment. It changes no contract: `feel()`'s arguments,
scale, latch semantics and session behaviour are untouched, there is no fourth
affect axis, no new dependency, no inference, no model-authored animation, and
no V/A/C→named-clip mapping. Everything new is dev-only and inert until a dev
panel toggle switches it on. Root PRD/SPEC/PRINCIPLES/DECISIONS are unedited.

---

## 1. Hypothesis

The narrow claim under test — *not* that `[V, A, C]` uniquely contains a
complete animation:

```
[V, A, C]
    → body-performance profile
    + character-authored motion grammar
    + time, phase, and physics
    → complete frame-by-frame Live2D output
```

"Complete" means a coherent continuous performance across head, torso and the
available arms, with posture and movement dynamics — not semantic gestures
(waving, shrugging, pointing, celebrating).

**Result: supported, deterministically.** Human legibility is untested and
remains the open gate (§6).

---

## 2. What Haru actually offers, and what the shipped pipeline masks

Measured, not assumed: the rig inventory comes from `haru.moc3` through the
Cubism Core; the authored-motion columns come from parsing the `.motion3.json`
curves; the shipped-wiring column comes from an actual captured frame. Full
table in [`evidence/analysis.md`](./evidence/analysis.md) §1.

Three facts decided the design:

1. **The shipped feel wiring writes 13 rig ids, of which exactly one moving id
   is below the neck** — `PARAM_BODY_ANGLE_X`, driven by the fixed-period sway
   writer. `PARAM_ANGLE_Y` and `PARAM_BODY_ANGLE_Y` carry static posture.
   Everything else is face.
2. **`pixi-live2d-display` auto-plays a random motion from the model's `Idle`
   group whenever nothing else is playing** (`cubism4.js:4274`), so every id
   Lares does not override is driven by Haru's own authored loop —
   semantically unrelated to the tuple, and randomly selected. Verified
   running: the `Idle` group moves head yaw/pitch/roll, torso yaw/roll, eyes
   and mouth form.
3. **Haru's arms, chest and torso-pitch are dead in the shipped product.**
   `PARAM_ARM_L_A`, `PARAM_ARM_R_A`, `PARAM_ARM_*_B` and `PARAM_BUST_Y` are
   authored only in the tap/flick motion groups, which Lares never triggers,
   and are bound by no wiring entry. Probe measured their span across three
   minutes of authored idle: exactly `0`.

So at the two most settled corners (`content`, `dejected`) the shipped pipeline
writes a **constant** value to every body id it owns — measured body traversal
`0.00` units/s (`evidence/analysis.md` §2). What a user sees moving there is
entirely Haru's authored idle loop.

The arm parameter turned out to be the most valuable control and needed
measuring rather than guessing: `PARAM_ARM_*_A` runs −1..1 with rig default
0.5, where **−1 is hands-on-hips, 0 is elbows away from the body, +1 is tucked
in** — so expansion maps onto it with a *negative* gain around an authored rest
of 0.15. The `_B` parameters drive the alternative arm part set, which
`haru.pose3.json` leaves hidden; they are unusable without also writing part
opacities, so the experiment ignores them.

---

## 3. The implemented generator

Two halves, both data-shaped, in one new dev-only module
`src/renderer/src/synth/body.ts`.

### 3a. Body-performance profile — renderer-neutral

Five channels, of which only four are new authoring:

| channel | −1 | +1 | new? |
|---|---|---|---|
| `extent` | small, settled | large | **no** — reads the shipped `swayAmplitude` |
| `tempo` | slow, long holds | quick, driven | yes |
| `expansion` | contracted, guarded | expanded, open | yes |
| `armEngage` | arms hang out of it | arms carry the performance | yes |
| `torsoDrive` | head leads the movement | torso leads the movement | yes |

Posture is *not* re-invented: head pitch and torso lean stay the shipped
`headPitch` / `lean` channels through the shipped static wiring. `extent` is
the shipped `swayAmplitude` channel re-read, spliced in by `bodyAnchorsFrom()`
so a character that retunes its idle sway retunes the generator with it.

The profile comes from the **same nine-anchor blend the face uses**. `feel.ts`'s
`computeTarget` was generalised into `blendAnchors(p, anchors, channels, k)`
and now calls it with `CHANNELS`; the experiment calls it with
`BODY_CHANNELS`. Production behaviour is unchanged (all 49 test files pass),
and every SPEC §4 property therefore holds on the body channels for free:
anchor exactness, convexity, exact linearity in magnitude, Chebyshev full
strength, and interaction by authorship. **V, A and C select and blend whole
authored performances; none of them drives a rig parameter on its own.**

Nine authored body anchors seeded from
[`research/body-movement-mapping.md`](../research/body-movement-mapping.md)'s
hypothesis table. The deliberate control-disambiguation pair:

| corner | tempo | expansion | armEngage | torsoDrive |
|---|---|---|---|---|
| `-++` determined push | +0.5 | +0.3 | +0.6 | **+0.8** (torso-led) |
| `-+-` panic | +1.0 | **−0.9** | +0.3 | **−0.7** (head-led) |

### 3b. Character-authored motion grammar — the renderer half

Seven procedural writers, pure data (`HARU_BODY`), the block that would live in
`renderers.live2d.performance` if this graduated:

| writer | id | part | role |
|---|---|---|---|
| torso yaw | `PARAM_BODY_ANGLE_X` | torso | sway (takes over the fixed-period writer) |
| torso roll | `PARAM_BODY_ANGLE_Z` | torso | half rate, so torso is not one metronome |
| head yaw | `PARAM_ANGLE_X` | head | same rate as the torso, trailing it — **head follow** |
| head roll | `PARAM_ANGLE_Z` | head | rate 0.37, incommensurate, so head and torso drift |
| arms | `PARAM_ARM_L_A` / `PARAM_ARM_R_A` | arm | `expansion` is posture (bias), `armEngage` is the movement |
| chest | `PARAM_BUST_Y` | torso | `expansion` lifts it; the existing breath writer rides on top |

Per frame:

```
hz     = baseHz · (0.45 + 0.9·u(tempo))          phase accumulates, so a tempo
phase += dt·hz                                    change bends the wave
amp    = 0.2 + 0.8·u(extent)                     floors at 0.2 — a latch is
weight = { head: ½−½·torsoDrive,                  never a frozen frame (§6)
           torso: ½+½·torsoDrive,
           arm:  ½+½·armEngage }
value  = center + bias·expansion + breathGain·breath
       + gain·amp·weight[part]·sin(2π(phase·rate − lag + φ + seededJitter))
       + accentGain·accent(t)
```

The profile itself eases through the **same** SPEC §6 critically damped
`easeStep` the pose uses. Seeded jitter (one draw per writer at construction)
is mechanical renderer state, exactly like today's sway phase. Haru's physics
turns the four angle writers into hair motion for free — that is the "physics"
term of the hypothesis, at zero cost.

`center ± (|bias| + |breath| + gain + 0.75·|accent|)` fits inside every rig
range by construction, so the generator never leans on the runtime clamp —
the same discipline as the §4 blend's convexity property. A test asserts it.

### 3c. Change-onset accent — dev-only, kept separate

A fixed-shape, fixed-size impulse `exp(−t/260ms)·sin(2π·3.2Hz·t)` on head yaw
and torso roll, fired when the *displayed target changes*. It reads nothing off
the profile — a test proves the impulse is bit-identical at `(2,2,2)` and
`(−2,−2,−2)`. It can therefore say only "the displayed target changed", never
"the agent was surprised". **SPEC §6 does not authorize this transition
behaviour, so it stays behind its own dev toggle and is not proposed here.**

### What was deliberately not built

- **Smoothness, asymmetry, impulsiveness.** The brief marks them hypotheses;
  the prototype did not demonstrate a need, so they are absent. The L/R arm
  phase split is authored grammar, not an affect-driven asymmetry.
- **Vertical lift/drop.** Marked optional, and Haru exposes no translate
  parameter — it would have failed the "materially affects a real control"
  check. Elated vertical lift is approximated by expansion + head pitch.
- **Scenario-replay integration.** Live path only. Determinism is proven on a
  fixed frame grid in tests and in the capture harness instead.

---

## 4. Changed files and verification

| file | change |
|---|---|
| `src/renderer/src/feel/feel.ts` | `computeTarget` split into `blendAnchors(p, anchors, channels, k)` + a one-line `computeTarget`. No behaviour change. |
| `src/renderer/src/synth/body.ts` | **new** — profile, anchors, Haru grammar, generator, onset accent, `withNeutralFace` |
| `src/renderer/src/synth/body.test.ts` | **new** — 17 checks |
| `src/renderer/src/stage/affect.ts` | dev seam: `setBodyExperiment()`, `bodyTrace()`, effective-tuple tracking, one `else if` branch in `present()` |
| `src/renderer/src/stage/affect.bodyExperiment.test.ts` | **new** — 4 checks that the seam is inert off and additive on |
| `src/renderer/src/stage/panel.ts` | **new dev-panel section**: body generator on/off, body-only, onset accent, fixed seed, live profile + generated-parameter trace |
| `src/renderer/src/runtime/live2d.ts` | `setAuthoredIdleMotion(enabled)` — the only way to see the pipeline's own output |
| `sdd/slices/013-feel/experiments/harness/` | **new** — capture harness (`capture.mjs`, `main.cjs`, `page.html`, `entry.ts`, `viewer.html`, `analyse.py`) |

Corner selection reuses the panel's existing nine anchor buttons and the
existing `previewPose` bypass; no new scenario or preview machinery.

```bash
pnpm test                                                   # 49 files, 356 passed, 3 skipped
pnpm build                                                  # typecheck + production build
npx vitest run src/renderer/src/synth/body.test.ts \
               src/renderer/src/stage/affect.bodyExperiment.test.ts

node sdd/slices/013-feel/experiments/harness/capture.mjs    # ~5 min, writes evidence/
python3 sdd/slices/013-feel/experiments/harness/analyse.py \
  > sdd/slices/013-feel/experiments/evidence/analysis.md
```

All commands above were run; results in §5. `pnpm dev` was boot-smoked (the app
starts, reports its 33-parameter inventory, no new error); the panel's toggles
themselves were **not** click-tested — that is part of the open human pass.

---

## 5. Deterministic results

Evidence lives under `sdd/slices/013-feel/experiments/evidence/` and is
**untracked and regenerable**; nothing here was committed.

- **[`evidence/index.html`](./evidence/index.html)** — the viewer. Open it and
  the required comparison pairs are laid out side by side as looping clips.
- `evidence/clips/*.webm` — 42 conditions at the normative **400 logical px**
  Lar height (root SPEC §7), 30 fps, generator seed 42, 40 px margin so sway
  cannot clip. Rendered at resolution 1.
- `evidence/stills/*.png` — four stills per condition, for reading without a
  video player.
- `evidence/traces/*.jsonl` — every rig value of every frame.
- `evidence/summary.json`, `evidence/analysis.md` — machine record and tables.

### Determinism

**42 of 42 conditions replay byte-identically** (each condition's parameter
sequence is generated twice and compared before recording; `Math.random` is
stubbed with the seeded PRNG so even the authored-idle baseline replays).
Unit-level: same seed and inputs → byte-identical frames; different seed →
different phases.

### Range, continuity, monotonicity, neutrality

- Finite and inside the rig range on all nine anchors, with the accent firing
  and the deepest breath applied — no clamping needed.
- No discontinuity: across a neutral → panic step with an accent, per-frame
  motion stays under a ceiling far below a jump on every id.
- Intermediate stays intermediate: ±1 lands exactly halfway between neutral and
  ±2 on every body channel (inherited from §4's projection).
- Neutral stays neutral: `feel(0,0,0)` returns the authored neutral profile
  exactly, all zeros.

### Each quality materially moves a real Haru control

| quality | measured effect |
|---|---|
| `extent` | >3× the head-yaw traversal from −1 to +1 |
| `tempo` | >2× the torso traversal at equal extent |
| `expansion` | arm parameter mean moves >0.8 of its authored travel |
| `armEngage` | >4× arm traversal, head/torso traversal unchanged to 1e-6 |
| `torsoDrive` | head and torso traversal swap which one dominates |

### The three named comparisons

| comparison | shipped body | 013-E1 generator |
|---|---|---|
| `(0,-2,0)` vs `(0,2,0)` | 0.56 → 7.47 units/s | **1.32 → 11.08 units/s (8.4×)** |
| `(-2,2,-2)` vs `(-2,2,2)` | 7.91 vs 6.13 units/s, *same* body organisation | arm mean **+0.775 (tucked)** vs **−0.054 (open)**; head-yaw span **20.15 vs 1.96**; torso-yaw span **1.92 vs 9.47** — opposite organisation at identical V and A |
| `(-2,0,0)` vs `(2,0,0)` | 3.70 vs 4.32 units/s | 4.76 vs 5.08 units/s — **near-identical quantity**, opposite arm posture (+0.423 vs −0.245) |

The valence row is the research note's prediction landing exactly: valence
shows up as *form*, not as *amount of movement*. On the body alone it is
therefore the weakest of the three axes, and the face is expected to carry it.

### Latch aliveness

Three minutes held at grim resolve `(-2,-2,2)`: every generated id keeps
moving, and the mean over a late 30 s window sits within 0.2 rig units of an
early one on ±30/±10 ranges — no freeze, no drift toward neutral (013-S7).
One calibration observation: at that corner the arms traverse 0.58 units in
three minutes (span 0.023) — effectively static. Legible as stillness, or too
dead? A viewing question, not a measurement one.

### Onset accent

Peak divergence 2.64 rig units on head yaw; the two traces reconverge to under
0.05 within 900 ms of the change. Fixed shape, provably tuple-independent.

---

## 6. Still open — the human-viewing matrix

**Nothing below has been run. No legibility claim in this report is supported
by a viewer.** Parameter traces show separation, which is a necessary and not a
sufficient condition. Run randomised, label-masked, forced-choice at 400 px,
several viewers, and read the confusion pattern rather than any single
demonstration.

| test | clips | question |
|---|---|---|
| Activation | `bodyonly-activation-{low,high}` | Which is more energized? |
| Control interaction | `bodyonly--+-` vs `bodyonly--++` | Which looks more able to act on the situation? |
| Valence | `bodyonly-valence-{low,high}` | Which looks more pleasant? |
| Corner coverage | all eight `bodyonly-*`, pairwise within equal `A` | pleasant/unpleasant, in-control/overwhelmed? |
| Face + body | the same, `body-*` | does the face rescue what the body misses? |
| Shipped baseline | `shipped-*` | can a viewer tell these apart at all? |
| Attention | `onset-ease` vs `onset-accent`, watched peripherally during a real desktop task | Did you notice a change within one second? |
| Portability (P5) | the first three, repeated on a second, differently rigged Lar | are axis directions preserved? |

Two collisions to watch for specifically, both visible in the stills:

- `+++` triumphant and `-++` determined both read as "open, upright, engaged"
  when still; they separate in motion (tempo, torso-vs-head) and by the face.
  If viewers confuse them **with the face on**, that is a calibration finding.
- `+--` content and `---` dejected share the extent floor (both
  `swayAmplitude = −1`); they are separated only by expansion, tempo and
  posture.

Also unverified: the dev panel's own toggles (boot-smoked only), and behaviour
on any Lar other than Haru.

---

## 7. Failure attribution

The hypothesis did not fail. The *shipped* body's illegibility does, and it
attributes as follows:

1. **Insufficient output motion vocabulary — the dominant cause.** SPEC §2 has
   twelve channels, of which the body's share reaches exactly one moving rig
   parameter on Haru. Four added qualities (`tempo`, `expansion`, `armEngage`,
   `torsoDrive`) plus a procedural basis were enough to produce measurable,
   opposite body organisations at identical `V` and `A`. The gap was on the
   **output** side of the same appraisal.
2. **Weak rig calibration — a real, separate contributor.** Haru's arms, chest
   and torso roll were bound by nothing at all; her `Idle` group never moves
   them; her arm parameter is asymmetric around its rig default in a way no
   guessed gain would have found. This is per-Lar authoring work (P5), not a
   contract problem.
3. **Motion-generator design — not implicated, but not exonerated either.** The
   simplest thing that could work (phase-accumulating multi-rate oscillators,
   part weights, one bias term) already separates every named pair
   quantitatively. Whether it *reads* is §6's question.
4. **Genuinely missing semantic input — not demonstrated.** No two actionable
   meanings were found that require different body performances while remaining
   indistinguishable under the same `[V, A, C]`. The one meaning the tuple
   provably cannot carry is "this was unexpected" — and the experiment shows
   the *attention* need behind it is met by a nonsemantic onset accent, which
   requires no report from the model. Under P2/P4/P8 a genuine unexpectedness
   claim would still need a first-person report, but nothing here demonstrates
   the product needs to express it.

---

## 8. Recommendation

> **Keep `[V, A, C]` and improve the generator.**

Expand the renderer-neutral output vocabulary and the per-Lar calibration; do
not expand the affect tuple, and do not add an action/event channel. The
justification bar — two actionable meanings that need different body
performances while remaining indistinguishable under the same tuple — was not
met by any pair tested. Animation having many output variables is not a reason
to add a semantic dimension.

Two things this experiment does **not** license, and which need their own
decisions before any of it ships:

- Promoting the body channels into SPEC §2 and the character package format
  (§13) — a contract change.
- The change-onset accent — it extends SPEC §6's fixed-transition rule and
  needs an explicit product decision first.

And one thing that is worth doing regardless of what happens to this
experiment: **the shipped app leaves Haru's arms, chest and torso roll bound to
nothing while her random authored idle loop drives her head.** That is true
today, with or without a body generator.
