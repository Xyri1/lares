# Mapping `feel(V, A, C)` into body movement

> **Historical note:** this pre-atlas hypothesis correctly keeps `[V,A,C]` but
> assumes continuous channels can carry the body performance. The later
> [natural choreography synthesis](./natural-full-body-choreography.md) replaces
> that execution assumption after inspecting Live2D's authored-motion layers
> and Haru's pose variants. Keep this note as the evidence trail, not as the
> current animation recommendation.

Research note for slice 013, 2026-08-04. This asks whether the current
valence–activation–felt-control report can drive expressive body movement, not
whether three values completely describe emotion.

## Conclusion

**Keep `[V, A, C]`. It is sufficient to test a useful, legible body-performance
mapping; there is no evidence-based need to add a model-reported axis yet.**

Expand and calibrate the **renderer-neutral motion qualities** before expanding
the semantic tuple. The current contract already derives posture and continuous
movement channels from whole corner poses; body animation is a richer output of
the same appraisal, not necessarily a richer appraisal input.

The three values should not each control one body parameter. They should select
and blend **whole body-performance profiles**, as the current nine-anchor design
already does. Activation has the clearest relation to movement speed, amplitude,
and energy. Felt control helps distinguish forceful approach from constrained
withdrawal at the same negative valence and high activation. Valence contributes
to posture and movement form, but is not a reliable approach/avoidance switch by
itself. The remaining qualities—smoothness, directness, expansiveness, and which
of head, torso, and arms carry the expression—are deterministic outputs of the
three-way interaction and character authorship, not additional affect inputs.

Separate **what the state means** from **what makes its arrival noticeable**. A
brief onset accent can be a mechanical response to an actual target change. It
does not require a novelty value from the model. A distinct claim such as “this
was unexpected,” however, is semantic and is not recoverable from `[V, A, C]`;
under [P2/P4/P8](../../../PRINCIPLES.md), it would need an explicit first-person
report if the product later proves it must express that meaning.

## Evidence

### Three values are a compact affect input, not a complete ontology

Russell and Mehrabian found pleasure, arousal, and dominance sufficient to
account for almost all reliable variance in the verbal emotion scales and term
ratings they tested across studies of 200 and 300 participants
([original study](https://doi.org/10.1016/0092-6566(77)90037-X)). This supports a
small reporting space. It does not imply a unique body pose for every point.

Body-expression studies support using all three kinds of information. In 120
acted portrayals spanning 12 emotions, Dael, Mortillaro, and Scherer found body
patterns differentiated by valence, activation, potency/control, and attentional
activity; most emotions used multiple patterns rather than one prototype
([original study](https://doi.org/10.1037/a0025737)). These results support
`[V, A, C]` as inputs to whole-body authorship, not three universal linear gains.

### Activation is the strongest direct motion-quality input

Point-light arm movements produced a perceptual space whose first dimension
tracked activation and was highly correlated with movement kinematics; perceived
pleasantness depended more on the phase relations among limb segments
([Pollick et al. 2001](https://doi.org/10.1016/S0010-0277(01)00147-0)). In
induced-emotion gait, joy and anger were fastest and sadness slowest; several
postural differences remained after accounting for gait speed
([Gross, Crane, & Fredrickson 2012](https://doi.org/10.1016/j.humov.2011.05.001)).
Exaggerating whole-body movement generally increased recognition and perceived
intensity in dynamic displays, though the recognition benefit did not hold for
every emotion
([Atkinson et al. 2004](https://doi.org/10.1068/p5096)).

Product inference: activation can safely provide the primary monotone drive for
tempo, movement frequency, and amplitude. It cannot provide the entire body
performance; equal-speed states remain distinguishable through posture and joint
coordination.

### Control disambiguates direction; valence alone does not

Dael et al. found high-control/high-power attack portrayals separated from
low-control withdrawal portrayals. Hot anger used communicative arm emphasis and
forward body inclination, while panic fear and anxiety tended toward withdrawal;
the authors explicitly noted that their resulting dimension was **not** a simple
approach dimension, because elated joy used vertical arm and knee movement rather
than forward movement
([original study](https://doi.org/10.1037/a0025737)).

Product inference: approach/avoidance must come from authored interactions. At
negative, activated points, higher control can bias toward forward, direct,
expansive action and lower control toward retraction, contraction, or backward
lean. Positive valence must not automatically mean forward motion, nor negative
valence backward motion.

### V/A/C has already driven synthesized body motion, with important limits

Claret, Venture, and Basañez implemented a direct continuous mapping from PAD to
jerkiness, activity, and gaze in a Pepper robot while preserving a higher-priority
functional motion. In their 30-person viewing study, activity correlated with
perceived arousal (`r = .43`); jerkiness correlated with none of the three
reported dimensions; gaze correlated with dominance weakly overall (`r = .22`),
more strongly at low activity (`r = .48`), and not at high activity (`r = .01`).
The robot's appearance also biased viewers toward low dominance
([original synthesis study](https://doi.org/10.1007/s12369-016-0387-2)). A
separate generation study successfully regenerated sadness, happiness, and anger
from one hand movement, but perception changed significantly when the same motion
was displayed on anthropomorphic versus non-anthropomorphic structures
([Samadani et al. 2013](https://doi.org/10.1007/s12369-012-0169-4)).

This is direct evidence that three affect values can drive body animation. It is
also evidence against a universal one-axis/one-quality map: motion features
interact perceptually, some proposed qualities may add nothing, and the body's
design changes the result. Lares should therefore keep shared axis directions but
author and test the actual profile per Lar (P5).

### Posture and dynamics both matter

Roether et al. found that limb flexion and head inclination separated emotions
with similar speed, and artificial walkers containing only the extracted critical
posture and dynamic features produced perceptual effects comparable to natural
emotional walkers
([original study](https://doi.org/10.1167/9.6.15)). De Meijer independently
manipulated trunk and arm movement, vertical and sagittal direction, force,
velocity, and directness across 96 acted clips; different emotion attributions
depended on different combinations and weights of those features
([original study](https://doi.org/10.1007/BF00990296)).

Smoothness/jerk should therefore remain a weak authored hypothesis, not a new
semantic input or universal rule such as “negative means jerky.” Claret's failed
jerkiness result is especially relevant: a theoretically plausible motion quality
can disappear when viewers see it on the actual body.

### Live2D is not the limiting layer

Cubism permits runtime parameter values to be set or added every update; its
standard parameter recommendations include three body-angle axes, while actual
IDs and ranges remain model-authored. The official update loop also demonstrates
applying motion, then custom parameter writers, then the final model update
([parameter operations](https://docs.live2d.com/en/cubism-sdk-manual/parameters/),
[standard parameters](https://docs.live2d.com/en/cubism-editor-manual/standard-parameter-list/)).
That is enough to drive continuous head, torso, arm, posture, and motion-quality
parameters where a Lar's rig exposes them. The semantic question is what Lares
derives; the adapter question is which controls each Lar can physically bind.

## Mapping hypotheses for Lares

These are calibration hypotheses to test, not contract changes.

| Input or interaction | Body-performance hypothesis | Avoid |
|---|---|---|
| Higher `A` | faster tempo, larger movement amplitude, more frequent torso/arm activity, deeper/faster breath | selecting an emotion-specific gesture from `A` alone |
| Lower `A` | smaller, slower, more settled movement; longer holds | total stillness, which makes a latched pose look dead |
| Higher `C` | more erect/expanded posture, clearer directional movement, less retraction | equating felt control with aggression or social rank |
| Lower `C` | contraction, guarded arms, backward/shrinking lean, less direct movement | making every low-control state cower identically |
| Higher `V` | more lifted/open organization where the character supports it | treating valence as a forward/back switch |
| Lower `V` | more lowered/closed organization where legible | encoding all unpleasant states as sadness |
| `V− A+ C+` | forward torso, emphatic/direct arm action, firm head orientation | sharing the `V− A+ C−` profile |
| `V− A+ C−` | retraction/contraction, guarded limbs, unstable or interrupted accents | deriving “panic” from event history |
| `V+ A+ C+` | vertical lift, expanded torso/arms, brisk broad movement | reusing the negative high-control attack profile |
| `V+ A− C+` | upright/open, slow and smooth, low-amplitude settling | confusing calm control with neutral inactivity |

The current [nine-anchor blend](../SPEC.md#3-anchor-poses) already supplies the
minimum place to author these interactions. Extend each anchor's body portion
rather than expanding the model-facing vector. If the current output vector is
the constraint, test renderer-neutral additions there first:

- **posture:** torso rotation, arm openness/retraction (head pitch and lean exist);
- **direction/shape:** forward/backward, vertical lift/drop, expansion/contraction;
- **dynamics:** movement rate, amplitude/extent, hold ratio, smoothness/impulse;
- **distribution:** how much head, torso, and arms contribute;
- **character style:** per-Lar gains, ranges, preferred body parts, and idle rhythm.

Lares already has `headPitch`, `lean`, `swayAmplitude`, breath-rate/depth, and
blink-rate outputs ([SPEC §2](../SPEC.md#2-performance-channels)). Haru currently
wires head pitch and torso lean and gives sway a fixed period
([character package](../../../../characters/haru/lar.character.json)). That makes
output coverage and calibration the next question before semantic dimensionality.

The semantic target can remain memoryless. Procedural breath, sway, and a bounded
body cycle may continue around that target exactly as blink and breathing do now.
Do not assign `[V, A, C]` directly to named `.motion3.json` clips: clip choice
would reintroduce an emotion vocabulary and make intermediate tuples discontinuous.

## Novelty and attention are separate questions

Fontaine et al. found a fourth **unpredictability** dimension after
evaluation/pleasantness, potency/control, and activation/arousal when modeling
emotion-word meaning across three languages. It accounted for 6% of variance in
their four-component solution and particularly separated novelty/expectedness and
surprise-related behavior
([original study](https://doi.org/10.1111/j.1467-9280.2007.02024.x)). Dael et al.
also recovered an attentional-activity dimension in acted bodily expression. Thus
`[V, A, C]` cannot uniquely encode surprise, uncertainty, or orienting.

That gap does **not** imply a fourth value is needed to make Lares more visible.
Motion **onset** attracts visual attention even when continuous motion does not
([Abrams & Christ 2003](https://doi.org/10.1111/1467-9280.01458)). A short,
character-authored body accent on an actual target change can therefore be tested
as transition mechanics. It should carry only “the displayed state changed,” not
“the agent was surprised,” and repeating an identical tuple should not create a
new semantic performance. This is separate from the persistent V/A/C-derived
motion field that remains visible around the latched target.

This would extend the current fixed-transition rule in
[SPEC §6](../SPEC.md#6-transition), so it requires an explicit product decision
before implementation. If Lares later needs to communicate genuine
unexpectedness, P2/P4 mean it cannot infer that from tool events or tuple distance;
the agent must report it. Add a fourth model-facing dimension only after viewing
tests show a repeated, actionable confusion that body profiles and a nonsemantic
onset accent cannot solve.

## Small human-viewing test matrix

Run randomized A/B clips at normal Lar size. Mask labels and ask only the coarse
question promised by the relevant axis; named-emotion agreement is not the gate.

| Test | Pair or condition | Question | What failure means |
|---|---|---|---|
| Activation | `(0,-2,0)` vs `(0,2,0)` | Which is more energized? | retune tempo/amplitude before adding inputs |
| Control interaction | `(-2,2,-2)` vs `(-2,2,2)` | Which looks more able to act on the situation? | strengthen posture/direction/arm contrast |
| Valence | `(-2,0,0)` vs `(2,0,0)` | Which looks more pleasant? | body alone may be weak; combine it with the existing face |
| Corner coverage | all eight corners, pairwise within equal `A` | pleasant/unpleasant and in-control/overwhelmed? | revise corner body profiles where the confusion clusters |
| Attention | current ease vs one brief onset body accent during a peripheral desktop task | Did you notice a change within one second? | tune onset motion; this is not evidence for another affect axis |
| Portability | repeat the first three tests on Haru and one differently rigged Lar | Are axis directions preserved? | fix character calibration, not the shared report contract |

Use several viewers and inspect the confusion pattern rather than trusting one
demonstration. The cited evidence is mostly acted human motion, gait, dance, or
simple visual-attention displays—not small Live2D desktop characters—so product
acceptance still requires this direct viewing test.
