# Deriving natural full-body choreography from `[V,A,C]`

Research synthesis for slice 013, 2026-08-04. This combines the Live2D
capability envelope, stylized body-language evidence, documented Live2D
performance practice, and the Haru capability atlas. It recommends the next
design direction but does not amend the accepted SPEC or production engine.

## Decision-ready conclusion

**Keep `[V,A,C]`. Replace the assumption that three values can generate joint
trajectories with a character-authored performance basis that those values
select and modulate.**

Three semantic values cannot uniquely determine every head, torso, arm, gaze,
face, timing, easing, anticipation, overshoot, hold, and physics curve in a
complete animation. They do not need to. `[V,A,C]` describes the appraisal;
character authorship supplies the acting.

The research establishes this split:

| Layer | Owns |
|---|---|
| `[V,A,C]` | semantic direction and strength of the current appraisal |
| pure character mapping | persistent pose organization and physical performance qualities |
| character-authored basis | complete silhouettes, arm/hand drawings, timing, coordination, anticipation, overshoot, settle, and holds |
| Live2D adapter | playback, bounded modulation, pose switching, expression composition, physics, and drawing |

This is possible without expanding the model-facing tuple. The missing
information is not another emotion coordinate; it is authored animation data
and character-local knowledge of how that data can be used safely.

## 1. What the four research gates established

### Live2D capability

[Live2D has no universal skeleton](./live2d-movement-capability.md). A model can
move any separated and rigged region through parameterized mesh/deformer
keyforms, alternate Parts, authored motion curves, and physics. Standard body,
arm, hand, and shoulder controls are conventions rather than guaranteed joints.
A runtime cannot synthesize a hand pose or body drawing the creator did not
author.

### Stylized emotional body language

[Natural stylized performance](./stylized-emotional-body-language.md) is read
as an organized whole pose plus a timed phrase. Emotional direction depends on
silhouette, expansion/contraction, approach/withdrawal, vertical organization,
head-torso-arm relationships, and phase. Activation most directly affects
motion energy. Holds, stillness, asymmetry, and selective exaggeration are
expressive resources rather than defects.

### Live2D performance practice

[The documented Live2D stack](./live2d-emotional-performance-practices.md)
layers a continuous baseline, static expression recipes, time-varying authored
motions, alternate Part drawings, and physics. Naturalness is authored in the
curves and their composition. The runtime normally chooses, prioritizes, fades,
and combines performance assets; it does not infer an entire animation from a
few rig values.

### Haru's actual envelope

[Haru's atlas](./haru-capability-atlas.md) shows 33 continuous parameters, two
mutually exclusive arm drawings per side, eight static facial recipes, 23
coordinated motions, and head/body-driven hair physics. The richer gestures use
Part B for clasped hands, crossed arms, hand-to-face/chest, and a raised hand.
The earlier generator saw only Arm A and therefore sampled a small fraction of
the model's authored body vocabulary.

## 2. The invariant for maximum emotion

Let normalized input be `p=(v,a,c)` and keep the existing Chebyshev magnitude:

```text
m(p) = max(|v|, |a|, |c|)
```

The product invariant should be:

> `m=1` produces the maximum character-safe expressive commitment in the
> selected semantic direction.

At a cube corner, all three axes are exact and the corresponding performance
anchor is fully committed. As the current SPEC already requires, any single
axis at wire value `±2` also reaches the shell and must not be diluted toward
neutral.

“Maximum commitment” is deliberately different from “maximum motion energy”:

- `(high commitment, high A)` may use the character's strongest safe tempo,
  extent, frequency, and accent;
- `(high commitment, low A)` may use a decisive settled pose, minimal travel,
  long holds, and slow secondary response;
- every state should maximize the diagnostic relationship for its direction,
  not drive every rig parameter to an endpoint.

This clarifies a conflict with the current expressiveness multiplier. If the
invariant becomes normative, the shipped character envelope at `k=1` must be
the full intended performance. `k` may remain a development calibration tool,
but a production value below 1 would intentionally violate “max input gives max
commitment,” while values above 1 can distort the authored pose through
non-uniform clipping. D10/SPEC §4 therefore need explicit reconciliation before
implementation.

## 3. The smallest choreography model that can work

The current nine-anchor mapping is useful but incomplete because each anchor is
only an instantaneous scalar pose. Natural body animation needs a
**performance anchor** with two parts:

1. a persistent pose organization that remains visible while the feel latch is
   active;
2. one or more complete character-authored phrases compatible with that pose.

The phrase is the smallest unit that preserves naturalness. It owns:

- its starting and settling silhouette;
- which body region leads and which follows;
- head, torso, arm, gaze, and facial phase relationships;
- any A/B Part switch and its compatible hand drawing;
- preparation, accent, braking or overshoot, settle, and readable hold;
- the excitation that drives character-authored physics.

`[V,A,C]` should never write these trajectories directly. The pure mapping
still computes the current semantic direction and persistent physical
qualities. The character then chooses a compatible authored phrase and the
adapter performs it.

## 4. Runtime behavior for a latched feeling

One-shot motion and persistent appraisal have different lifetimes. A correct
runtime must not finish a phrase and reveal the rig's semantic default while
the old feel remains latched.

The minimum loop is:

1. ease to the target's persistent pose organization;
2. hold long enough for the pose to read;
3. play a compatible authored phrase when the mechanical schedule calls for
   movement;
4. settle back into the same target organization, not neutral;
5. continue breath, blink, small idle response, and physics around that target.

The schedule may use time and current playback state because those are
mechanical renderer concerns. It must not reinterpret elapsed time as a change
in feeling. Identical tuples still have identical semantic targets; renderer
state only determines where the body currently is while executing that target.

## 5. How the axes influence a phrase

These are design hypotheses supported strongly enough for the next experiment,
not universal human laws:

| Source | Primary effect on the performance |
|---|---|
| magnitude `m` | commitment to the selected diagnostic pose/phrase; neutral-to-full envelope |
| activation `A` | tempo, movement quantity, extent, phrase frequency, force, and hold length |
| valence `V` | part of lifted/lowered, open/closed, and facial organization; never a universal forward/back rule |
| felt control `C` | part of direct/retracted, organized/interrupted, expanded/guarded form; not social dominance or aggression |
| `V×A×C` interaction | the complete authored whole-body organization and which parts carry it |

The old independent-oscillator design failed because it assigned motion to
channels without supplying a coherent phrase. The replacement should preserve
activation's influence by bounded retiming and displacement only after a
specific authored motion proves that range natural. E4 establishes one such
naturalness range for `Shake[1]`; it does not establish a universal multiplier.

## 6. Interpolation and pose topology

Scalar anchor poses can be trilinearly blended. Arbitrary motion clips cannot.
Haru's library contains different durations, phase structures, and A/B arm
topologies, so averaging corresponding parameter curves would mix unrelated
moments and incompatible drawings.

Use these rules:

- continuously blend persistent scalar pose qualities as today;
- continuously modulate a phrase only inside a visually tested safe range;
- blend full phrases only when they were authored as a phase-aligned family
  with the same Part topology;
- otherwise select one complete basis phrase deterministically and use its
  authored fade/pose transition;
- let physics run after the primary motion so follow-through remains coherent.

This may make phrase selection discrete. That is acceptable if the persistent
pose remains continuous and selection boundaries are visually stable. The
renderer may finish or fade the active phrase before switching; that is
mechanical continuity, not semantic history.

## 7. What Haru can contribute now

Haru's stock library is not a finished affect space, but it supplies candidate
physical basis material and reference choreography:

| Candidate physical family | Haru examples | Why useful |
|---|---|---|
| quiet baseline | `Idle[0..2]` | low arm activity, authored head/body timing |
| expanded/hands-on-hips | `Tap[0]`, `Tap[3]` | strong Arm A silhouette and whole-body organization |
| clasped/contracted | `Tap[1]`, `Flick3[0]`, `Shake[0]` | Arm B hand relationship unavailable to scalar A controls |
| hand-to-face/inward | `Flick[2]`, `Tap[4]` | specific asymmetrical, inward organization |
| raised-hand/asymmetrical | `FlickLeft[1]` | highly legible alternate silhouette |
| broad open phrase | `Shake[1]` | strongest coordinated head/torso/arm/face travel; bounded E4 evidence exists |

The table is deliberately physical. It does not assign these assets to emotion
names or VAC corners. A human author must first annotate their visible
qualities, compatibility, end pose, and safe modulation range.

Haru's files alone do not cover a guaranteed continuous eight-corner
performance system. Some can be reused intact, some may only be timing and
coordination references, and missing anchor families may require newly authored
motions. That is a character-content task, not a reason to add semantic axes.

## 8. Contract implications

The recommendation conflicts with two current assumptions and should not be
silently implemented:

1. D5 rejects treating supplied motion assets as the affect space. The new
   design still rejects filenames as semantics, but proposes that explicitly
   annotated, character-authored phrases may form the physical basis beneath a
   renderer-neutral target. D5 must distinguish those two cases.
2. D9/SPEC §§2–6 define anchors entirely as scalar channel vectors and one
   uniform ease. They need a performance-phrase extension if full-body
   choreography becomes part of the slice rather than a later character
   capability.

D25 remains compatible if asset discovery stays semantically neutral and only
an explicit human-authored character mapping assigns physical assets to a
performance basis. Automatic inference from filenames, hotkeys, or bundled
expression labels remains prohibited.

No production engine change should precede this reconciliation. The research
has identified the missing content and contract; tuning the old oscillators
would only optimize the rejected execution model.

## 9. Next experiment: authored-basis coverage

The next experiment should answer one question:

> Can a small, explicitly annotated Haru phrase basis make all eight VAC
> corners read as fully committed, distinct, and natural at 400 px?

Do not build a general scheduler first. Prepare the smallest evidence set:

1. annotate the six physical families above for energy, expansion/contraction,
   approach/withdrawal, vertical organization, directness/retraction, body-part
   distribution, Part topology, start/end pose, and safe modulation;
2. select one complete phrase or “missing—must author” result for each corner;
3. pair it with the existing corner face and persistent pose;
4. render the eight corners at `m=1`, plus one half-magnitude radial sample per
   corner;
5. have viewers judge only naturalness, full-vs-half commitment, and the
   promised V/A/C contrasts—not named emotions.

Pass requires:

- every full corner looks maximally character-safe and more committed than its
  half sample;
- high activation reads more energized than low activation without making
  low-activation corners look weak;
- matched-valence/high-activation control pairs remain distinguishable;
- no clip has the earlier isolated-forearm, metronomic, or pose-pop artifact;
- a completed phrase settles into the still-latched target rather than neutral.

If a corner has no suitable Haru phrase, record the coverage gap and author one.
Do not force an unrelated stock motion into the map merely to make the matrix
complete.
