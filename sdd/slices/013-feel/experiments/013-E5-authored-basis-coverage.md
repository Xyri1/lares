# 013-E5 — Can an annotated Haru motion basis cover all eight VAC corners?

**Artifact:** Experiment report · **Slice:** 013-feel · **Status:** Passed;
accepted as slice 014's visual baseline · **Date:** 2026-08-05

E4 proved one authored motion tolerates bounded tempo/displacement modulation.
This experiment asks the coverage question from
[natural-full-body-choreography.md §9](../research/natural-full-body-choreography.md):

> Can a small, explicitly annotated Haru motion basis make all eight VAC
> corners look natural, distinct, and fully committed at normal Lar size,
> while half-magnitude samples remain recognizably intermediate?

Everything here is dev-only harness and evidence work. It changes no
production file, no SPEC/DECISIONS contract, no Haru asset, and adds no
dependency. Motion group names appear below as **asset identities only**; the
corner assignment comes from the human-read physical annotation in §2, never
from a filename (D25/013-D5 intact).

## 1. Semantic invariant

The existing normalized tuple and Chebyshev magnitude are unchanged:

```text
m = max(|v|, |a|, |c|)
```

- full corner: wire `(±2,±2,±2)` → `m=1` — maximum character-safe expressive
  **commitment** in that direction;
- half sample, same ray: `(±1,±1,±1)` → `m=0.5` — same direction,
  intermediate commitment.

Commitment is not motion energy. A low-activation full corner may use a
decisive pose, long holds, and little movement; activation controls energy,
magnitude controls commitment. No expressiveness `k` is used anywhere in the
stimulus (`k=1` throughout); the half samples come only from the tuple.

## 2. Phase 1 — physical annotation of the candidate basis

Twelve candidates (the six families from the research note) were annotated
from three sources: the frozen atlas contact sheets
(`evidence/motion-atlas/`), the frozen per-frame runtime traces
(`evidence/traces/haru-motion-*.jsonl`), and the `.motion3.json` curves
themselves. Numbers are per-group **normalized path length per second**
(each parameter scaled by its own rig range — the E4 metric); *still* is the
fraction of frames with near-zero head/torso/arm-A travel (hold behavior);
*init* is which region departs first after onset.

| Motion | dur | arms | head | torso | arm | face | still | init | annotation (visible qualities only) |
|---|---:|---|---:|---:|---:|---:|---:|---|---|
| `Idle[0]` | 10.0 s | A | 0.28 | 0.17 | 0.00 | 0.46 | 0.27 | face | quiet sway; slow **downward head drift** (headY 3→−16, settles −5); arms never move; no expansion change |
| `Idle[1]` | 10.0 s | A | 0.22 | 0.18 | 0.00 | 0.64 | 0.27 | face | quietest baseline; head stays near level (−6..+5); arms never move |
| `Idle[2]` | 10.0 s | A | 0.33 | 0.15 | 0.00 | 0.95 | 0.35 | face | broadest of the idles: gentle sway and tilt with a closed-eye-smile accent; arms never move |
| `Tap[0]` | 2.53 s | A | 0.55 | 0.31 | 0.45 | 1.20 | 0.49 | arm | **arm-led plant**: hands sweep to hips (arm-A mean −0.78, settles −1), chin level-to-down (headY ≤ 0), contained head travel, ~half the phrase is the planted hold; expanded and direct |
| `Tap[3]` | 2.70 s | A | 0.97 | 0.65 | 0.43 | 1.41 | 0.47 | arm | same akimbo family with much stronger head/torso phrasing and a **big vertical lift** (headY −13..+30, bodyY ±3); settles into the planted expansion, chin recovering down |
| `Tap[1]` | 3.13 s | B | 0.53 | 0.42 | 0.28 | 0.89 | 0.53 | face/arm | **soft inward clasp at the chest**; slow, gentle head dip (−8..0), high hold fraction; contracted but relaxed, no drive forward |
| `Flick3[0]` | 1.97 s | B | 0.73 | 0.70 | 0.54 | 1.25 | 0.45 | arm | **quick contracted clasp**: shortest phrase, largest head swings of the B set (headY −25..+15), torso dip (bodyY −7..+1); agitated, interrupted quality |
| `Shake[0]` | 2.03 s | B | 0.25 | 0.17 | 0.46 | 3.87 | 0.73 | arm/face | clasp with almost all energy in the **face**, body nearly still; imploring quality |
| `Flick[2]` | 2.93 s | B | 0.75 | 0.63 | 0.28 | 1.17 | 0.51 | arm | **hand at chin/cheek, other arm crossed**: guarded but organized; slight withdraw (bodyY ≤ 0); settles head-down (−13) with a deep frown |
| `Tap[4]` | 2.03 s | B | 0.62 | 0.19 | 0.29 | 3.73 | 0.58 | head/arm | hand-to-chin thought pose, torso nearly quiet; face-led; near-duplicate of `Flick[2]` with less body |
| `FlickLeft[1]` | 2.57 s | B | 0.51 | 0.18 | 0.27 | 2.71 | 0.63 | arm | **one hand raised**, other arm crossed; strongest asymmetric silhouette; settles lifted (headY +18) with a bright mouth |
| `Shake[1]` | 3.73 s | A | 1.43 | 1.05 | 0.46 | 6.42 | 0.26 | face/head | **broad open whole-body phrase**: largest travel everywhere, loose swings, lift (headY −14..+20, bodyY −2..+6); no planted end pose (arm-A drifts to +1); E4-tested modulation range |

Structural facts that bound the design:

- every gesture initiates arm-first or near-simultaneously within ~0.2 s —
  the authored bundles never stagger regions the way E1's oscillators did;
- the A-arm gestures (`Tap[0]`, `Tap[3]`) **settle into** the hands-on-hips
  pose and Haru's pose system keeps a finished B-gesture's end silhouette
  (clasp, hand-at-chin) visible after the phrase — end poses persist, which
  the stimulus uses deliberately (§4);
- the idles contain zero arm travel, so they can only be quiet baselines;
- safe modulation is E4-proven **only for `Shake[1]`** (0.7–1.2×
  displacement, 0.85–1.15× tempo). E5 applies a narrower slice of that same
  envelope to the whole basis as the hypothesis under test — the human gate
  judges whether it held.

## 3. Phase 2 — corner assignment

Assignment is by the annotated physical qualities against each corner's
performance direction (research §5 hypotheses): valence → lifted/lowered and
open/closed organization, activation → motion energy and hold length,
control → direct/organized vs contracted/interrupted form.

| Corner | wire | assigned | physical rationale |
|---|---|---|---|
| `+++` | (2,2,2) | `Tap[3]` | expanded + lifted + direct, arm-carried, strongest lift; settles into planted expansion |
| `++-` | (2,2,−2) | `Shake[1]` | maximum loose whole-body energy, open but **unplanted** — energy without the organized plant that reads as control |
| `+-+` | (2,−2,2) | `Idle[2]` — **coverage gap** | composed upright quiet with a soft smile accent; see gap note below |
| `+--` | (2,−2,−2) | `Tap[1]` | soft inward clasp, slow, yielding warmth; longest gentle phrase |
| `-++` | (−2,2,2) | `Tap[0]` | direct arm-led plant with a level/down chin and contained travel — force organized, not scattered |
| `-+-` | (−2,2,−2) | `Flick3[0]` | quickest, contracted inward clasp with the largest head swings and a torso dip — agitated, interrupted |
| `--+` | (−2,−2,2) | `Flick[2]` | braced deliberation: guarded crossed arm + hand at chin, slow, settles head-down and grave |
| `---` | (−2,−2,−2) | `Idle[0]` — **coverage gap** | minimal movement with a slow downward head drift; see gap note below |

**Coverage gaps (recorded, not forced):** Haru has **no authored
composed-calm gesture and no authored slump/withdrawal gesture**. For `+-+`
and `---` the basis can only supply a quiet-baseline phrase; the corner's
commitment is carried by the persistent posture and face (which is
legitimate for low-activation corners — commitment ≠ energy) but no authored
body gesture states it. If the viewing gate finds these two corners
under-committed or insufficiently distinct, the remedy is **authoring new
phrases for Haru**, not stretching an unrelated stock motion.

Unused candidates, kept out to hold the basis small: `Idle[1]` (subset of
`Idle[0]`/`Idle[2]`), `Tap[4]` (near-duplicate of `Flick[2]`), `Shake[0]`
(its distinguishing energy is facial, and the feel target owns the face —
the useful part would be discarded), `FlickLeft[1]` (settles lifted/bright;
no corner needs the raised-hand silhouette this round).

Matched pairs the gate must separate: `+++`/`-++` share the akimbo family —
they differ by authored lift and head/torso phrasing plus the corner face;
`+++`/`++-` separate plant vs loose; `-++`/`-+-` separate plant vs clasp.

## 4. Frozen stimulus

Sixteen clips, `basis-<corner>[-half]`, at the normative 400 logical px Lar,
30 fps, seed 42. Each clip: the corner's persistent pose from t=0 (the synth
snaps to the eased target exactly as the shipped pipeline would show it),
phrase onset at t=1.2 s, then settle and hold to the end.

Frozen renderer-local constants — all inside the E4-tested envelope, and
deliberately *not* a proposed production formula:

| quantity | rule | full | half |
|---|---|---|---|
| displacement from rig defaults | `0.5 + 0.5·m` | 1.0 (authored, untouched) | 0.75 |
| playback tempo | `1 + 0.15·a` (normalized a) | 0.85 / 1.15 | 0.925 / 1.075 |

Parameter ownership during a clip (the `feelFace` split in
`harness/page.html`):

- **before and after the phrase** the latched feel target owns everything it
  owns in production: the six §2 facial channels, `headPitch`, `lean`,
  breath, blink, sway;
- **while the phrase plays** the authored motion owns the body — every
  head/torso/arm/breath curve, phase relation, A/B Part switch, fade, and
  the physics they excite are the motion's own; the feel target keeps
  writing only the face (production's persistent-appraisal seam; also what
  keeps same-motion corners distinct). The motion's facial curves are the
  one authored element this overrides — recorded as a stimulus decision;
- **when the phrase ends** the persistent posture eases back over the §6
  700 ms, so the Lar settles into the still-latched target, never neutral.
  Haru's pose system keeps the gesture's end silhouette (planted hips,
  clasp, hand-at-chin) as the held organization — authored end poses double
  as the corner's persistent arm organization;
- the two **baseline corners** instead keep the full shipped hold over their
  pinned authored idle for the whole clip — exactly the production
  composition (feel writes face + posture + sway over `Idle`), with the same
  bounded modulation.

No general scheduler, no motion engine, no schema: one table
(`BASIS`), one ownership flag, one settle ease, all inside the existing
harness page.

## 5. Measured ordering (mechanical, not a naturalness claim)

From `evidence/traces/basis-*.jsonl` (post-modulation runtime values, every
parameter normalized by its own rig range):

**Commitment orders correctly at every corner.** Mean absolute displacement
from rig default, all body ids / all feel-owned face ids:

| corner | body full | body half | face full | face half |
|---|---:|---:|---:|---:|
| `+++` | 2.07 | 0.92 | 2.04 | 1.63 |
| `++-` | 1.27 | 0.68 | 2.07 | 1.64 |
| `+-+` | 0.56 | 0.44 | 1.68 | 1.45 |
| `+--` | 1.56 | 0.73 | 1.67 | 1.44 |
| `-++` | 2.29 | 0.98 | 2.81 | 2.01 |
| `-+-` | 1.87 | 0.74 | 2.84 | 2.02 |
| `--+` | 1.91 | 0.86 | 2.82 | 2.01 |
| `---` | 1.03 | 0.69 | 2.28 | 1.74 |

**Motion energy follows activation, not magnitude.** Body path length per
second is full > half at all four high-activation corners; at the four
low-activation corners full ≲ half (full plays slower *and* deeper — e.g.
`---` 0.21 vs 0.28/s). That inversion is the invariant working as designed:
magnitude raised commitment while activation kept energy down.

**Settle is exact.** Each full clip's final frames hold the corner's own
posture target (`PARAM_ANGLE_Y` = 20·headPitch, `PARAM_BODY_ANGLE_Y` =
10·lean, to capture precision) — no drift toward rig neutral.

**The face stays feel-owned through the phrase.** In `basis--+-`,
`PARAM_MOUTH_FORM` holds the corner's −0.56 for every frame of a phrase
whose authored curve is +1.

**Replay is byte-stable.** Repeated captures from the same tree produce
byte-identical traces for all sixteen conditions (SHA-1 compared across two
runs per condition). One nondeterminism source was found and fixed on the
way: the Pixi adapter preloads Idle-group motions at model init while the
manager's idle group still names `Idle`, racing the harness's per-spec reset
to `''` — whichever side loaded the file first baked its fade default into
the cached motion (2000 ms idle vs 500 ms non-idle), so the idle-baseline
conditions' fade-in raced wall clock. The harness now pins the two fade
defaults equal before the model loads. Frozen hashes:

```text
6c7c44d7e76f581c9cdc0333420b25c852794d39  basis-+++.jsonl
166152335502b1a200f96cbb44afbea753f5057a  basis-+++-half.jsonl
919d922e6c579f087d8093ec8ce7e9110db24f5c  basis-++-.jsonl
4e3b4e51d43bd88e8842cb795dcef4b225619b07  basis-++--half.jsonl
3da4c01690acdb353c93307f7ad0aa93d98bed46  basis-+-+.jsonl
bb03e34578d2581fccac34872277842ec6edacce  basis-+-+-half.jsonl
894eb0dc2704613de6c8e4d47c6e70fe854c46ef  basis-+--.jsonl
e9565519beb4ccd87a08f2de4620a73ba9c340f8  basis-+---half.jsonl
0af20b517546f068e26ad91c3c96f3b53e55e2bc  basis--++.jsonl
b870ebc0004c08bf89140bd2b15f0c35b8c56a90  basis--++-half.jsonl
9bc0a2763d800df84ebf2658b3fb1b1258c959b1  basis--+-.jsonl
246ba4875890451918be9ccd1312e4b85e96428c  basis--+--half.jsonl
53a42b95e9b72ac434a24ab3ee8cc7d3e2bbb0fb  basis---+.jsonl
402c1838edc786885871ec951287a8770da271c3  basis---+-half.jsonl
929167cd851759c6c7d1635ac6ce3617a50cb29f  basis----.jsonl
b5d60a2abc110b4433569095ad81a97412fcac21  basis-----half.jsonl
```

## 6. Reproduce and view

```sh
ONLY='basis-+++,basis-+++-half,basis-++-,basis-++--half,basis-+-+,basis-+-+-half,basis-+--,basis-+---half,basis--++,basis--++-half,basis--+-,basis--+--half,basis---+,basis---+-half,basis----,basis-----half' \
  node sdd/slices/013-feel/experiments/harness/capture.mjs
```

```sh
cd sdd/slices/013-feel/experiments
python3 -m http.server 8934 --bind 127.0.0.1
```

Open `http://127.0.0.1:8934/evidence/index.html` — the E5 section is first:
eight full/half pairs in corner order.

## 7. Maintainer gate — passed

Judge by ordinary playback at normal size, per research §9:

| verdict | maintainer answer |
|---|---|
| complete E5 set | pass — the maintainer accepted E5's naturalness and expressiveness as the minimum production quality on 2026-08-05 |
| full versus half commitment | pass as part of the accepted set |
| activation and matched-corner distinctions | pass as part of the accepted set |
| isolated-forearm, metronomic, or pose-pop artifacts | absent at the accepted quality bar |
| settlement into the latched target | pass as part of the accepted set |
| `+-+` and `---` quiet-baseline coverage | accepted for this implementation; new authored phrases remain optional character-content improvement |

The pass promotes the authored basis into slice 014. Production timing may
differ, but its visible naturalness and expressiveness may not regress below
this page. The two recorded content gaps remain honest limitations even though
their quiet-baseline presentations passed.
