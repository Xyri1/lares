# 013-E4 — Can bounded activation modulation preserve an authored Live2D motion?

**Artifact:** Experiment report · **Slice:** 013-feel · **Status:** Naturalness
passed; activation verdict pending · **Date:** 2026-08-04

E3 proved that a procedural parameter phrase can make Haru move, but the result
looked mechanical. The official Haru motion added beside it showed the missing
constraint: a Live2D performance is a coordinated, character-authored bundle of
curves, not a generic collection of independently useful joints.

This experiment asks one narrower question:

> Can Lares vary the activation of one official motion without destroying the
> motion's authored naturalness and expressiveness?

This is dev-only prototype evidence. It does not change `feel(V,A,C)`, the
character format, D25/013-D5, or production playback. It does not establish a
full V/A/C body mapping or make motion names an emotion vocabulary.

## 1. Frozen stimulus

All three clips play the same bundled Haru asset through
pixi-live2d-display's motion manager:

- model group/index: `Shake[1]`
- physical asset: `motion/haru_normal_08.motion3.json`
- capture: 5 seconds at 30 fps, motion onset at 600 ms
- presentation: normative 400 logical px Lar, native 380×480 evidence video
- sound: disabled; the cleared Haru package intentionally excludes voice files

Only two renderer-local quantities differ:

| condition | activation sample | playback time | displacement from each rig default |
|---|---:|---:|---:|
| `official-haru-motion-low` | −1 | 0.85× | 0.7× |
| `official-haru-motion` | 0 reference | 1× | 1× — untouched |
| `official-haru-motion-high` | +1 | 1.15× | 1.2×, clamped to the rig range |

The modifiers are frozen experiment constants, not a proposed production
formula. Every authored curve, phase relation, asymmetry, facial/body coupling,
and physics response remains owned by the motion and rig. Intensity is applied
after the motion manager writes a frame by scaling each parameter's displacement
from its rig-authored default; tempo scales the fixed update delta.

## 2. Evidence

The first row of [`evidence/index.html`](./evidence/index.html) shows low,
untouched, and high side by side at native capture width:

- `evidence/clips/official-haru-motion-low.webm`
- `evidence/clips/official-haru-motion.webm`
- `evidence/clips/official-haru-motion-high.webm`

Actual runtime parameter values after each rendered frame are frozen under
`evidence/traces/` with the same basenames.

The traces establish the intended mechanical ordering. Values below are total
path length per group, with each parameter normalized by its own rig range:

| group | low | untouched | high | ordered? |
|---|---:|---:|---:|---|
| visible arm A | 1.732 | 2.092 | 2.433 | yes |
| torso angles | 3.575 | 4.772 | 6.205 | yes |
| head angles | 4.637 | 6.469 | 8.435 | yes |

These numbers prove only that the bounded modifier changes motion quantity in
the intended direction. They do not prove that the motion still looks natural
or that a person reads the ordering as activation.

## 3. Reproduce

Regenerate only these three clips and traces:

```sh
ONLY=official-haru-motion-low,official-haru-motion,official-haru-motion-high \
  node sdd/slices/013-feel/experiments/harness/capture.mjs
```

The capture was run twice from the same working tree. All three trace SHA-1
hashes were identical across runs:

```text
5e2fd33dc7bc85adbe6a127b32e7486769fdb617  official-haru-motion-low.jsonl
dc637c221a5c3f11710c263293a34ca339af63da  official-haru-motion.jsonl
9363dcb9ea07505c51a4268be7c0ba48fcb40401  official-haru-motion-high.jsonl
```

Serve and view:

```sh
cd sdd/slices/013-feel/experiments
python3 -m http.server 8934 --bind 127.0.0.1
```

Open `http://127.0.0.1:8934/evidence/index.html` and watch only the first row.

## 4. Maintainer gate

Give two independent verdicts after ordinary playback:

1. **Naturalness:** do low, untouched, and high all retain the official
   animation's natural, expressive quality, without the generated phrase's
   mechanical forearm-hinge feeling?
2. **Activation:** does the movement read in the order low < untouched < high?

| verdict | pending answer |
|---|---|
| all three remain natural | pass — maintainer confirmed 2026-08-04 |
| activation order is readable | pending |

Only a double pass supports the next hypothesis: character-authored motions can
serve as the Live2D renderer's physical performance basis while V/A/C supplies
bounded qualities rather than joint trajectories. A failure does not justify
tuning the old procedural phrase; it identifies which modifier or authoring
assumption needs the next isolated test.
