# Stylized emotional body language under a limited 2D rig

Research note for slice 013, 2026-08-04. Scope: how an anime-style or Live2D
character can communicate affect through posture and motion when its body is a
model-specific set of 2D deformations rather than a complete skeleton. Sources
are limited to official Live2D material, original research, and first-person
animator or director material. This note does not inspect any particular Lar and
changes no contract or decision.

## Conclusion

**A limited rig does not need to reproduce every human joint to produce natural,
expressive body language. It needs a small number of character-authored poses
and phrases whose silhouette, whole-body organization, timing, and secondary
response agree.**

The evidence supports six practical conclusions:

1. **Pose carries emotional direction.** The head, torso, and arms must form one
   readable organization—lifted or lowered, expanded or contracted, advancing
   or withdrawing—not a collection of independently meaningful joint values.
2. **Coordination carries naturalness and part of emotional form.** Moving only
   the head looks robotic; moving head and torso in lockstep also looks robotic.
   Authored phase relationships, lags, and distribution across body parts are
   part of the performance.
3. **A phrase needs temporal shape.** Anticipation or preparation, a clear main
   action, braking or overshoot, and settling are more useful than continuous
   oscillation for a visible emotional gesture. Holds provide contrast; they are
   not automatically deadness.
4. **Activation primarily changes motion energy.** Speed, amount, force, and
   extent repeatedly track perceived activation. Pleasantness and control rely
   more on posture, direction, coordination, and phase relationships.
5. **Exaggeration is selective, not global.** Clearer or larger motion can raise
   perceived intensity and sometimes recognition, but not for every emotion.
   The author must exaggerate the diagnostic pose or phrase, not every available
   parameter.
6. **Character style remains authored.** The same emotional commitment may be
   expressed through broad whole-body action, restrained weight shifts, a head
   tilt, or a hand movement. No reviewed source defines a universal anime or
   Live2D emotion-to-motion table.

For Lares, this means maximum `[V,A,C]` magnitude should mean **maximum
character-safe expressive commitment to the reported appraisal**, not maximum
motion speed, amplitude, or activity. A maximally calm state can be fully
committed while using a strong settled pose, long holds, and very little motion.

## Evidence boundary

The source types answer different questions:

- Live2D's official material documents what experienced Cubism authors are told
  to coordinate and how the toolchain represents timing, curves, deformers,
  alternate parts, and physics.
- Animation research and first-person production material describe how stylized
  poses and timing make intention readable.
- Perception studies test what viewers recover from posture and motion, but most
  use humans, point lights, avatars, or robots rather than small Live2D models.

The sections labeled **Established** report those sources. Sections labeled
**Lares inference** translate them into hypotheses for a later animation design;
they are not claims made by the sources.

## 1. Read the whole pose before individual controls

### Established

The line of action is a cartooning abstraction of the body's principal shape.
Guay, Cani, and Ronfard formalized it as a posing control after observing that a
single aesthetic line can capture and amplify a character's dynamism or
elegance. Their method also supports secondary lines for limbs. The contribution
is not evidence for one emotional curve; it is evidence that an expressive pose
can be organized and edited as a whole before individual joints
([Guay, Cani, & Ronfard 2013](https://doi.org/10.1145/2508363.2508397)).

Walt Disney Animation describes the corresponding production test as strong
poses and facial expressions that show how a character thinks and feels, with
timing, weight, and overlapping action supplying personality. Its non-speaking
Mini Maui example must communicate thought through pantomime using the entire
body
([Disney Animation, Hand-Drawn Animation](https://disneyanimation.com/process/hand-drawn-animation/)).

Live2D's body tutorial embodies the same whole-shape concern in a 2D deformer
system. It creates face tilt, hair sway, arm movement, body tilt, and vertical
movement through nested warp and rotation deformers. The official example says
body tilt should follow an arc rather than translate sideways and, for one
character type, recommends showing a shift in center of gravity
([Live2D, Adding Body Movement](https://docs.live2d.com/en/cubism-editor-tutorials/deformer/)).

In a first-person production example from anime direction, Naoko Yamada explains
that movements of hands, feet, and eyes each carry emotion in *A Silent Voice*;
she combines them with framing and other cinematic devices rather than treating
the face as the only expressive surface
([Yamada interview](https://www.heyuguys.com/naoko-yamada-a-silent-voice-interview/)).

Body-perception research agrees that posture is not mere decoration. Roether and
colleagues separated emotional gait into speed plus emotion-specific postural
and dynamic features, then found viewers relied on both kinds of information
([Roether et al. 2009](https://doi.org/10.1167/9.6.15)). Dael, Mortillaro, and
Scherer's acted corpus likewise found patterns across head orientation, torso
posture and direction, arm placement and symmetry, and gesture activity rather
than one posture for each emotion
([Dael, Mortillaro, & Scherer 2012](https://doi.org/10.1037/a0025737)).

### Lares inference

A renderer-neutral body profile should describe **whole-pose relationships**:
line or overall organization, expansion/contraction, forward/back orientation,
vertical lift/drop, arm placement, and head-to-torso relation. The Live2D
adapter may realize that profile through one scalar, several parameters, or an
alternate drawing. Parameter count is not expressive completeness.

At normal display size, a candidate pose should first pass as a silhouette or
large shape. Fine deformation is valuable only after that principal read works.

## 2. Head, torso, and arms must be coordinated—but not synchronized

### Established

Live2D's official motion-quality guide is unusually direct:

- face movement without corresponding body X/Z movement looks robotic;
- face and body moving at exactly the same time still look robotic;
- a face may lead and the body follow, or a body turn may redirect the face;
- when speech begins, face, body, and arms should begin as one coordinated act;
- large and small moving parts should be balanced rather than given equal motion.

These are authoring recommendations, not runtime algorithms
([Live2D, Motion Quality Improvement Tips](https://docs.live2d.com/en/cubism-editor-tutorials/motion-hint/)).

Pollick and colleagues provide a perceptual reason not to reduce the result to
amplitude. In point-light arm actions, the activation dimension survived phase
scrambling and correlated with kinematics, while the pleasantness dimension did
not survive scrambling; it depended more on phase relationships among limb
segments
([Pollick et al. 2001](https://doi.org/10.1016/S0010-0277(01)00147-0)).

### Lares inference

The minimum useful choreography unit is a **coordination pattern**, not a
parameter waveform. It should declare:

- which region initiates the action;
- which regions support it immediately;
- which region follows with inertia;
- which elements oppose, mirror, or remain quiet;
- which secondary elements continue after the main body settles.

Asymmetry can improve silhouette or suggest direction, but the reviewed evidence
does not license a universal rule such as “negative is asymmetric.” Symmetry,
arm retraction, direction, and repetition appear as interacting pattern
features in the acted corpus. They should be authored per performance and
character, not derived independently from one affect axis.

## 3. Anticipation, overshoot, and follow-through create a phrase

### Established

Lasseter's account of traditional 2D animation principles describes
anticipation as preparation that makes the following action readable, and
follow-through and overlapping action as different parts continuing or settling
at different rates. Slow-in/slow-out and arcs shape how force, weight, and intent
are perceived. These principles came from hand-drawn animation and were shown
to remain necessary when the production medium changed
([Lasseter 1987](https://doi.org/10.1145/37402.37407)).

Disney Animation's current production description names timing, clear staging,
anticipation, follow-through, and secondary action together as tools for both
subtle and broad emotional performance
([Disney Animation, Animation](https://disneyanimation.com/process/animation/)).

Live2D gives the same advice in Cubism terms. A moving arm should either brake
as it approaches its destination or travel slightly past it, return, and settle;
instant stopping looks unnatural. Face/body timing should be offset with inertia
in mind
([Live2D, Motion Quality Improvement Tips](https://docs.live2d.com/en/cubism-editor-tutorials/motion-hint/)).

Cubism also provides two authored mechanisms that make a limited 2D rig look
richer than its numeric parameter count:

- Pose can fade between mutually exclusive drawings such as alternate hands,
  allowing a motion to change silhouette instead of stretching one drawing
  beyond its useful range
  ([Live2D, Pose](https://docs.live2d.com/en/cubism-sdk-manual/pose/)).
- Physics turns primary face/body inputs into delayed hair, clothing, ribbon,
  or other secondary response
  ([Live2D, Physics](https://docs.live2d.com/en/cubism-editor-manual/physics-operation/)).

### Lares inference

A body gesture should normally be represented as a finite phrase:

1. **hold/read** — expose the current organization;
2. **anticipate** — a small preparation or weight shift when the action needs it;
3. **act** — the clearest silhouette and largest diagnostic change;
4. **overshoot/brake** — preserve weight and avoid an instantaneous stop;
5. **settle** — allow lagging parts and physics to finish before returning to
   the persistent pose.

Not every phrase needs a conspicuous anticipation. A small ambient change may
begin directly, while a large arm or torso action needs preparation. The useful
invariant is proportionality: more consequential motion needs enough temporal
structure to remain readable and natural.

## 4. Timing and holds are expressive variables

### Established

Cubism's Graph Editor gives artists independent curves for each parameter. Its
smooth interpolation accelerates and decelerates between keys; linear, step,
inverse-step, and editable Bezier curves provide different temporal shapes
([Live2D, Graph Editor](https://docs.live2d.com/en/cubism-editor-manual/grapheditor/)).
The Animation tutorial also supports changing spacing for all or part of a
motion, separately changing speed and amplitude, and saving repeated keyframe
phrases as templates
([Live2D, Creating Animations](https://docs.live2d.com/en/cubism-editor-tutorials/animator/)).

The motion-quality guide explicitly recommends stillness while waiting followed
by motion clear enough to see. This makes the hold part of the motion design,
not an absence of animation
([Live2D, Motion Quality Improvement Tips](https://docs.live2d.com/en/cubism-editor-tutorials/motion-hint/)).

Timing alone can change interpretation even when the geometric path is fixed.
Zhou and colleagues varied speed, pauses, and speed-change patterns on one robot
arm path. Viewers inferred differences in confidence and naturalness; pauses
affected most tested judgments, and repeated speed changes reduced perceived
naturalness. This is a robot manipulation result, not an anime emotion map, but
it isolates timing from pose
([Zhou et al. 2017](https://doi.org/10.1145/2909824.3020221)).

### Lares inference

Low activation should not mean “scale a high-activation clip toward zero.” It
can use longer readable holds, slower preparation and recovery, smaller but
deliberate changes, and fewer phrases. High activation can shorten holds and
increase rate or extent, but arbitrary pauses and speed fluctuations may read as
hesitation or mechanical noise rather than emotion.

The same geometric phrase may tolerate bounded retiming, but timing is not a
semantically empty multiplier. Its tested range must preserve anticipation,
contact, overshoot, and settling relationships.

## 5. Exaggerate the diagnostic signal, not everything

### Established

In whole-body portrayals with covered faces, Atkinson and colleagues compared
static and dynamic displays at three exaggeration levels. Exaggerating movement
raised perceived emotional intensity and often improved recognition, especially
for dynamic point-light displays, but the recognition improvement did not hold
for sadness. Dynamic displays were generally more informative than peak stills
([Atkinson et al. 2004](https://doi.org/10.1068/p5096)).

Live2D's authoring advice similarly says motion should be clear enough to see,
while character style determines how broadly the body moves. Its examples
contrast sturdy, restrained movement with large whole-body movement and more
frequent head tilt; these are style examples, not gender rules for Lares
([Live2D, Motion Quality Improvement Tips](https://docs.live2d.com/en/cubism-editor-tutorials/motion-hint/)).

### Lares inference

Exaggeration should amplify a **diagnostic relationship**—for example a clearer
forward body organization, stronger contraction, more decisive arm placement,
or a longer anticipatory hold. Uniformly multiplying every rig displacement can
damage silhouette, create collisions, overdrive physics, and falsely turn
emotional commitment into motion energy.

A character-safe maximum is therefore a visual envelope, not necessarily every
parameter's numeric limit.

## 6. Activation is motion energy; emotional direction is organized form

### Established

Three results converge:

- In point-light arm actions, perceived activation correlated strongly with
  kinematics, while pleasantness depended more on inter-segment phase
  relationships
  ([Pollick et al. 2001](https://doi.org/10.1016/S0010-0277(01)00147-0)).
- In face-blurred acted portrayals, arousal strongly affected rated arm-movement
  amount and speed. Potency/control affected force and size especially at high
  arousal, while valence effects were smaller and interaction-dependent
  ([Dael, Goudbeek, & Scherer 2013](https://doi.org/10.1068/p7364)).
- Emotional gait remained distinguishable through flexion/posture and dynamic
  relationships after accounting for speed, so equal energy did not imply equal
  emotional direction
  ([Roether et al. 2009](https://doi.org/10.1167/9.6.15)).

The acted-body study also separated high-control forward/emphatic organization
from lower-control withdrawal patterns while finding overlapping rather than
one-to-one emotion poses
([Dael, Mortillaro, & Scherer 2012](https://doi.org/10.1037/a0025737)).

### Lares inference

The cleanest first hypothesis is:

| Concern | Primary body effect |
|---|---|
| activation | motion rate, amount, force/extent, phrase frequency, hold length |
| valence | lifted/lowered and open/closed organization, plus character-specific phase and gesture form |
| felt control | advancing/withdrawing organization, expansion/contraction, directness and commitment of action |
| character identity | preferred body parts, asymmetry, restraint/exaggeration, lag, idle rhythm and safe limits |

This is not a one-axis/one-parameter map. Valence and control reshape a complete
profile, and activation modulates its energy without selecting its meaning.
The studies' potency, dominance, or actor-appraisal dimensions are not identical
to Lares's first-person felt-control report; using `C` for these physical
qualities remains a product hypothesis that must pass viewing tests.

## 7. A bounded grammar to carry into synthesis

The evidence supports evaluating a small authored grammar before inventing more
semantic inputs or procedural joints:

| Layer | What must be authored | What may be modulated |
|---|---|---|
| pose organization | silhouette/line, head-to-torso relation, arm placement, expansion and direction | bounded commitment from neutral to the character-safe pose |
| phrase | hold, anticipation, main action, overshoot/brake, recovery | tempo, extent and occurrence within a tested envelope |
| coordination | leader, supporters, lags, opposition/symmetry, quiet parts | small timing and participation weights that preserve ordering |
| alternate drawings | hand/arm or other silhouette variants and their valid transitions | selection only when declared by the character's physical basis |
| secondary response | physics inputs, weights, delay and settling | character-safe strength, ordinarily after primary motion |

Two constraints follow:

1. A low-motion pose can be maximally expressive. Semantic commitment and motion
   energy must remain separate quantities.
2. A motion basis can be character-authored without making its filename an
   emotion label. The semantic layer can request a renderer-neutral profile;
   character data can decide which physical pose and phrase realize it.

## Remaining unknowns

- The reviewed primary sources do not establish a universal anime-specific body
  code distinct from broader stylized animation and human body perception.
- Most perception experiments show large bodies centrally, not a small desktop
  companion in peripheral vision.
- The evidence supports phase, posture, and timing as important, but does not
  give safe numeric modulation ranges for an arbitrary Live2D rig.
- Asymmetry is a useful authored feature, not a validated direct mapping from
  valence, activation, or control.
- Expression/pose readability and natural motion quality must still be tested on
  each character's actual physical controls and bundled assets.

The next research step should therefore inventory one character only after its
body parameters, alternate parts, motions, expressions, and physics can be
interpreted through this grammar.
