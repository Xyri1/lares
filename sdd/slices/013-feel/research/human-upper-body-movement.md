# Human upper-body movement under valence, activation, and control

Focused research note for slice 013, 2026-08-04. Scope: real human head,
torso, arm, and hand behavior first; acted/posed movement second; robot and
avatar synthesis only as a separate transfer check. This note audits hypotheses
for Haru but changes no contract or code.

## Conclusion

**Keep `[V, A, C]`. Expand and test the body-performance outputs before adding
another model-reported dimension.**

The evidence is asymmetric and, in authentic movement, mostly subtle:

- **Activation has the strongest repeated candidate motor correlate:** induced
  anger/joy are often faster and larger than sadness, but a broad authentic
  standing/walking study failed to recover this as a reliable single-parameter
  rule
  ([Gross et al. 2012](https://doi.org/10.1016/j.humov.2011.05.001),
  [Riemer et al. 2023](https://doi.org/10.1371/journal.pone.0290564)).
- **Valence is not a single kinematic dial.** It is carried by coordinated form,
  timing, posture, and limb relationships that distinguish, for example, anger
  from joy at similarly high activation
  ([Gross et al. 2010](https://doi.org/10.1007/s10919-010-0094-x)).
- **Felt control is useful but least directly established.** Acted appraisal
  studies associate higher control/power with forward, emphatic action and lower
  control with withdrawal or retraction, but few studies directly manipulate a
  person's felt control and measure upper-body kinematics
  ([Dael et al. 2012](https://doi.org/10.1037/a0025737)).

Therefore the current three inputs are adequate for a first body animation
space, but the mapping must be authored as interacting whole performances. A
universal rule such as `V -> head pitch`, `A -> speed`, `C -> lean` is not
supported. Activation can be the primary monotone driver; valence and control
should reshape the whole profile through the existing corner anchors.

## Evidence confidence

| Proposed relation | Confidence | Best evidence | Qualification |
|---|---|---|---|
| `A` -> movement speed/rate | moderate | [felt/induced knocking and gait](https://doi.org/10.1016/j.humov.2011.05.001) | [authentic broad-parameter results were mostly null](https://doi.org/10.1371/journal.pone.0290564) |
| `A` -> amplitude/activity | moderate | [induced upper-body kinematics](https://doi.org/10.1007/s10919-010-0094-x) | task changes the visible form; high activity can mask subtler cues |
| `V` -> coordinated movement quality | moderate | [anger and joy differ despite both being activated](https://doi.org/10.1007/s10919-010-0094-x) | [positive–negative head differences did not differ from neutral](https://doi.org/10.1038/s41598-021-86841-8) |
| `C` -> approach/withdrawal organization | low–moderate | [acted appraisal patterns](https://doi.org/10.1037/a0025737) and [rated arm dynamics](https://doi.org/10.1068/p7364) | not a direct felt-control manipulation |
| positive -> head up/upright | low | [joy/pride examples](https://doi.org/10.1007/s10919-010-0094-x) | anger can also extend the torso; contentment can be kinematically unmarked |
| negative -> collapse/guarding | low–moderate | [sadness/anxiety examples](https://doi.org/10.1016/j.humov.2011.05.001) | does not generalize to controlled anger |
| jerk/smoothness -> `V` or `C` | low/conflicted | [direction- and segment-dependent gait effects](https://doi.org/10.1016/j.jbiomech.2016.10.044) | do not make it a universal axis rule |
| self-touch -> negative/low control | unsupported | [state-anxiety correlation](https://doi.org/10.1007/s10919-022-00402-9), but [strong task/language confounds](https://doi.org/10.1016/0277-9536%2885%2990193-5) | reject as a semantic shortcut |
| symmetry/directness -> a specific VAC axis | low | [mainly acted manipulations](https://doi.org/10.1007/BF00990296) | retain only as a calibration hypothesis |

## Authentic and task-embedded human movement

The most important constraint is a null-heavy authentic study. Twenty-four
participants watched films intended to induce happiness, relaxation, fear,
sadness, or neutrality, then stood and walked without acting the state while
motion capture and a force plate measured 229 parameters. Only seven parameters
showed significant effects. Six were standing postural-control variability
measures—center-of-pressure sway, shoulder/back angles, and left/right
wrist-to-hip distance—and they separated neutral from one or more emotional
conditions, **not the emotional conditions from each other**. The seventh was a
gender-moderated walking-leg result with no overall main effect
([Riemer et al. 2023](https://doi.org/10.1371/journal.pone.0290564)).

A 25-feature decision tree classified the five conditions at 45.8% accuracy
against 20% chance, while happy precision was 29% and neutral recall 20%. The
same paper reports that many effects from acted studies did not recur and
attributes part of the gap to authentic movement being less exaggerated. The
product implication is strict: a **collection** of small, coordinated cues may
work, but no reviewed result licenses a conspicuous one-joint emotional rule
([Riemer et al. 2023](https://doi.org/10.1371/journal.pone.0290564)).

Large-scale unobtrusive head tracking gives a similarly qualified valence
result. Across five laboratory emotion-manipulation datasets totaling 931
seated participants, positive stimuli produced more forward lean and more head
movement than negative stimuli. Neither positive nor negative differed from the
neutral condition, however, and the authors describe prior approach/freezing
findings as mixed. Direction and amount of movement should therefore remain
separate profile qualities, and valence should not be a hard forward/backward
switch
([Behnke, Bianchi-Berthouze, & Kaczmarek 2021](https://doi.org/10.1038/s41598-021-86841-8)).

Genuine affect during a serious game was also context-specific. Seventy
undergraduates repeatedly rated enjoyment, boredom, and frustration while a
Kinect captured seated head and upper-torso behavior; complete repeated body
data were available for 32. Enjoyment covaried with a leftward head yaw,
boredom with head-roll activity, and frustration with rightward head yaw and a
torso position closer to the screen. The researchers excluded arm features
because mouse and keyboard use made them instrumental rather than emotional
([Riemer et al. 2017](https://doi.org/10.3389/fpsyg.2017.01303)). These
lateral signs should not become Lares semantics: they show that genuine cues
can be task-bound and that ordinary computer use contaminates arm/hand evidence.

Self-touch is likewise unsafe as “guarding” or low control. In 127 people,
conversational self-touch frequency correlated with state anxiety, but the
design was correlational and the relationship did not recur in the study's
cognitive tasks
([Pang, Canarslan, & Chu 2022](https://doi.org/10.1007/s10919-022-00402-9)).
In a medical-interview study of 28 physicians and patients, self-touch also
tracked information processing and speech production
([Harrigan 1985](https://doi.org/10.1016/0277-9536%2885%2990193-5)). An
experiment comparing leech and canary passages found no significant increase
for the presumed anxiety stimulus, but did find more self-touch while answering
questions than while listening
([Heaven & McBrayer 2000](https://doi.org/10.2466/pms.2000.90.1.338)). Lares
should not animate self-touch as an affect label even if a future rig can do it.

## Felt or induced human movement

The strongest upper-body study used autobiographical recall while six drama
students performed the same knocking task, then kept track of what actors
reported feeling, what viewers recognized, Effort-Shape judgments, and motion
capture. Actors reported feeling the target emotion in 92% of trials, although
multiple feelings often co-occurred and many felt states were not recognized by
viewers
([Gross, Crane, & Fredrickson 2010](https://doi.org/10.1007/s10919-010-0094-x)).

Its measured upper-body differences were concrete:

- anger had the largest elbow range, greatest elbow-extension velocity, highest
  raised arm, and greatest share of time actually knocking;
- sadness had the longest total movement time, smallest elbow range and
  velocity, and least relative knocking time;
- anxiety had short movement time and constrained torso range;
- joy and pride shared an extended-neck, chin-up posture; joy also had the
  highest knocking rate and balanced peak elbow flexion/extension velocities;
- contentment had no distinguishing measured kinematic feature.

The perceived trials exaggerated the relevant differences: recognized anger
had more shoulder flexion, torso extension, elbow amplitude, and extension
velocity; recognized anxiety had less torso range; recognized sadness had longer
duration and smaller elbow/torso ranges. Angry and joyful movement were both
high-activation yet had different Effort-Shape profiles, which is direct evidence
that activation alone cannot carry valence
([same study](https://doi.org/10.1007/s10919-010-0094-x)).

An induced-emotion gait study of 16 people found joy and anger fastest and
sadness slowest. Some larger hip, shoulder, elbow, pelvis, and trunk motion could
be explained by speed, but sadness-related neck/thoracic flexion and joy-related
trunk extension and shoulder depression remained independent of gait speed
([Gross, Crane, & Fredrickson 2012](https://doi.org/10.1016/j.humov.2011.05.001)).
This supports separating **dynamic activity** from **postural form**.

Smoothness is not stable enough for a direct VAC rule. In another induced gait
study, anger and joy were smoother than sadness in several vertical body segments
and some joints, but effects varied by direction and joint
([Kang & Gross 2016](https://doi.org/10.1016/j.jbiomech.2016.10.044)). A
different body and task could reverse or erase that cue; smoothness should be
tested as part of an authored profile, not assumed to mean pleasantness.

Naturalistic evidence is thinner but directionally compatible. Non-acted
postures captured while people played a body-controlled video game supported
above-chance observer judgments of affective labels and dimensional levels, and
models based on low-level posture descriptions generalized at approximately the
human agreement baseline
([Kleinsmith, Bianchi-Berthouze, & Steed 2011](https://doi.org/10.1109/TSMCB.2010.2103557)).
This shows that subtle, non-posed posture contains affective information; it does
not establish a universal joint-to-axis map.

## Acted, posed, and dance evidence

These studies are valuable for candidate cues because they amplify expression,
but their mappings should be treated as calibration hypotheses rather than
measurements of spontaneous felt movement.

In 120 portrayals by ten professional actors, body behavior varied through head
orientation, straight versus leaning posture, forward/back movement, arm
retraction, arm symmetry, repetitive vertical arm action, illustrative gesture,
and touching. The discriminant dimensions were related to activation,
power/control, a pleasantness–potency combination, and attentional activity
([Dael, Mortillaro, & Scherer 2012](https://doi.org/10.1037/a0025737)).

The most relevant interaction was not reducible to valence: hot anger combined
forward body inclination with frequent emphasizing gestures, while panic fear
and anxiety used withdrawal patterns. The authors interpreted this separation as
high control/power and attack versus low control/power and withdrawal. Yet
positive elated joy did **not** use forward approach; it used repetitive vertical,
symmetrical arm movement. Self-touch was also not negative-specific: it appeared
in amusement and in mixed patterns. Most emotions used several overlapping body
patterns rather than one prototype
([same study](https://doi.org/10.1037/a0025737)).

A follow-up using the same acted corpus isolated arm dynamics more directly.
Forty-three viewers rated 120 face-blurred, muted portrayals on arm-movement
amount, speed, force, fluency, size, and height. Arousal and potency/control had
large effects across all six ratings: arousal most cleanly increased movement
amount and speed, while potency's effects on force and size grew at high arousal.
Valence effects were modest and interaction-dependent. This is the clearest
candidate support for `tempo`, `armEngage`, and an `A × C` expansion contrast,
but it remains perception of acted gestures rather than objective spontaneous
kinematics
([Dael, Goudbeek, & Scherer 2013](https://doi.org/10.1068/p7364)).

De Meijer independently varied seven properties—trunk stretch/bow, arm
open/close, vertical and forward/back direction, force, velocity, and
directness—in 96 clips judged by 85 viewers. Emotion attributions depended on
different combinations and weights of those features, producing broader
rejection/acceptance, withdrawal/approach, and preparation/defeatedness factors
([de Meijer 1989](https://doi.org/10.1007/BF00990296)). This supports whole-profile
authorship, but it does not identify those factors with Lares's three axes.

Point-light arm actions provide a useful coordination result: perceived
activation tracked kinematics even when the movement was phase-scrambled, while
pleasantness depended more on phase relationships among limb segments
([Pollick et al. 2001](https://doi.org/10.1016/S0010-0277%2801%2900147-0)).
Dynamic whole-body portrayals were generally recognized better than static ones,
and exaggeration raised perceived intensity, though recognition did not improve
for every emotion
([Atkinson et al. 2004](https://doi.org/10.1068/p5096)). More movement can make
a Lar more noticeable without necessarily making every axis more legible.

## Variation and conflicts

The mapping is not person- or culture-free. Gross et al. found substantial actor
effects and unequal recognizability even after using the same task and elicitation
method. Dael et al. found that clusters were not dominated by a single actor, but
also reported extensive overlap and several behavior patterns per emotion
([Gross et al. 2010](https://doi.org/10.1007/s10919-010-0094-x),
[Dael et al. 2012](https://doi.org/10.1037/a0025737)). Shared axis direction is
plausible; exact amplitudes, preferred joints, and timing are character identity.

In a real-body cross-cultural study, American and Japanese viewers agreed well on
Japanese actors' sadness, fear, and anger movements, while joy and surprise
showed cultural components
([Sogon & Masutani 1989](https://doi.org/10.2466/pr0.1989.65.1.35)). A separate
three-culture avatar-posture study also found both commonalities and cultural
differences in recognition and intensity judgments
([Kleinsmith, De Silva, & Bianchi-Berthouze 2006](https://doi.org/10.1016/j.intcom.2006.04.003)).
Neither study justifies culture-specific defaults today, but both rule out treating
one calibration session as a universal decoder.

Robot synthesis is a transfer check, not human-movement evidence. A Pepper study
mapped PAD into activity, jerkiness, and gaze: activity correlated with perceived
arousal (`r=.43`), jerkiness with none of the three dimensions, and gaze with
dominance only weakly overall (`r=.22`) and mainly at low activity (`r=.48`;
`r=.01` at high activity). Pepper's design also biased dominance judgments
([Claret, Venture, & Basañez 2017](https://doi.org/10.1007/s12369-016-0387-2)).
This is a warning that strong motion can mask head/gaze cues and that the same
semantic target must be calibrated to the actual body.

## Audit of current Lares hypotheses

The shortest next design move is therefore to keep `[V, A, C]` and improve the
renderer-neutral outputs. Keep the existing semantic posture in `headPitch`
and `lean`; test small additions such as overall movement rate,
expansion/contraction, and arm participation before considering another
semantic input. Do **not** automatically reuse `swayAmplitude` as generic
expressive extent: the authentic study's significant sway-like results were
postural-control variability, and threat can reduce movement rather than enlarge
it
([Riemer et al. 2023](https://doi.org/10.1371/journal.pone.0290564),
[Behnke et al. 2021](https://doi.org/10.1038/s41598-021-86841-8)). Directness,
smoothness, symmetry, and hold ratio should remain unsealed calibration
variables until Haru viewing demonstrates that they add legibility.

### Audit of the implemented 013-E1 generator

The experimental generator is a concrete set of hypotheses, not merely a
generic body-animation proposal
([implementation](../../../../src/renderer/src/synth/body.ts),
[experiment report](../experiments/013-E1-body-generator.md)):

| Implemented quality or grammar | IRL audit |
|---|---|
| `tempo` broadly increases with `A` | **Most defensible.** Induced anger/joy were faster than sadness, but authentic movement was much less separable; keep the direction and calibrate the gain ([Gross et al. 2012](https://doi.org/10.1016/j.humov.2011.05.001), [Riemer et al. 2023](https://doi.org/10.1371/journal.pone.0290564)). |
| `armEngage` broadly increases with `A` | **Reasonable display hypothesis, weak natural evidence.** Induced/acted studies support more arm action in activated portrayals, while the genuine computer-task study had to discard arms as task-contaminated ([Gross et al. 2010](https://doi.org/10.1007/s10919-010-0094-x), [Dael et al. 2013](https://doi.org/10.1068/p7364), [Riemer et al. 2017](https://doi.org/10.3389/fpsyg.2017.01303)). |
| `expansion` is authored from the V×A×C corner | **Plausible as an interaction, not as a direct axis.** Acted arm ratings found potency effects on force and size were amplified by arousal, but authentic studies do not establish a universal expansion rule ([Dael et al. 2012](https://doi.org/10.1037/a0025737), [Dael et al. 2013](https://doi.org/10.1068/p7364), [Gross et al. 2010](https://doi.org/10.1007/s10919-010-0094-x)). |
| `extent` copies each anchor's `swayAmplitude` | **Conflated.** Expressive gesture extent and balance/postural sway are different observables; high arousal may produce broad action, freezing, or postural-control changes. Split them experimentally before sealing this reuse ([Riemer et al. 2023](https://doi.org/10.1371/journal.pone.0290564), [Behnke et al. 2021](https://doi.org/10.1038/s41598-021-86841-8)). |
| `torsoDrive` allocates movement between head and torso | **Unsupported but testable.** The reviewed studies show both regions matter, but none establishes a stable “head-led versus torso-led” VAC dimension. Treat it as Haru styling, not human-derived semantics. |
| procedural head/torso yaw and roll sinusoids | **Character motion grammar only.** Genuine gaming associations used lateral head signs that were context-specific, not cyclic affect rules ([Riemer et al. 2017](https://doi.org/10.3389/fpsyg.2017.01303)). |
| opposite-phase left/right arm sinusoids | **Character motion grammar only.** No reviewed authentic study supports that coordination pattern as a VAC mapping; test it for liveliness and distraction, not affect validity. |
| static `headPitch` and `lean` remain separate from oscillation | **Correct separation.** Induced work distinguishes posture effects from speed-mediated dynamics ([Gross et al. 2012](https://doi.org/10.1016/j.humov.2011.05.001)). |

This leaves two layers with different truth claims: VAC-conditioned profile
qualities may carry coarse appraisal, while waveform, phase, lag, and preferred
body parts are the Lar's authored performance grammar. The latter can make Haru
visible without pretending that humans naturally oscillate that way.

## What Haru can express now

Haru's inventory exposes head X/Y/Z, body X/Y/Z, four left/right arm parameters,
bust movement, and breath. The current performance wiring uses only head Y for
`headPitch`, body Y for `lean`, body X for fixed-period sway, and breath; head
X/Z, body Z, every arm parameter, and bust are not semantic performance bindings
([Haru package](../../../../characters/haru/lar.character.json),
[Haru inventory](../../../../characters/haru/runtime/haru.cdi3.json)).

The 013-E1 probe found that Haru's random `Idle` group moves head yaw/pitch/roll
and torso yaw/roll, while arms, bust, and torso pitch remain constant. Arm and
bust curves exist in tap/flick groups that Lares does not trigger in the shipped
path, so those controls are **rig-capable but behaviorally dead today**
([013-E1 report](../experiments/013-E1-body-generator.md#2-what-haru-actually-offers-and-what-the-shipped-pipeline-masks)).

Consequences:

- head pitch/yaw/roll and three-axis torso organization are physically testable;
- bilateral arm participation and symmetry are testable, but the measured
  `PARAM_ARM_*_A` sweep is not a pure openness axis: `−1` is hands-on-hips,
  `0` puts elbows away from the body, and `+1` tucks them in. The hidden `_B`
  part set also requires opacity handling. The generator's negative expansion
  gain therefore moves through mixed assertive/open/tucked poses and must not be
  labelled “openness” without viewing
  ([013-E1 report](../experiments/013-E1-body-generator.md#2-what-haru-actually-offers-and-what-the-shipped-pipeline-masks));
- Haru has no separately named wrist, hand, or finger controls, so hand openness,
  guarding, and self-touch cannot be promised from the inventory;
- kinematic rate, amplitude, holds, and coordination can be produced by how the
  available parameters are driven, but visual legibility remains a human test.

Do not infer semantic direction from parameter names or copy an authored motion
as an emotion. First label the actual visual range of each head/body/arm control;
then author a renderer-neutral profile that uses only confirmed motions.

## Minimal next human-viewing experiment

1. **Calibrate the rig first.** Record slow sweeps of head X/Y/Z, body X/Y/Z, and
   the four arm parameters in the existing raw-rig diagnostics. Mark only what is
   visibly reliable at normal Lar size: direction, useful range, symmetry, and
   collisions.
2. **Make three randomized A/B pairs with the face held constant:**
   - activation: same pose, low versus high body rate/amplitude;
   - control interaction: at negative/high activation, forward/expanded/emphatic
     versus retracted/contracted/guarded;
   - valence interaction: at matched activation and control, two coordinated
     head/torso/arm profiles, not merely head-up versus head-down.
3. **Use 12 viewers and ask only one forced choice per pair:** more energized,
   more able to act on the situation, or more pleasant. Also collect “no visible
   difference” and confidence. Show clips at normal desktop size and randomize
   order. Treat `10/12` choosing the intended direction as the pilot gate for
   each pair, not as proof of population-wide validity.
4. **Then restore the existing face** on the winning body profiles and confirm
   that the body strengthens rather than contradicts the whole Lar.

If activation passes and valence/control fail, revise the body profiles and
their renderer-neutral qualities first. Expand `[V, A, C]` only if repeated
tests expose a stable, actionable distinction that cannot be represented by the
three-way anchors; the current human motor evidence does not identify such a
missing dimension.

## Remaining unknowns

- Direct causal evidence from **felt control** to upper-body kinematics is sparse.
- Most detailed studies use actors, constrained tasks, gait, or amplified
  portrayals rather than quiet desktop-work affect.
- Head yaw/roll, arm guarding, symmetry, directness, acceleration/jerk, and hold
  timing lack a stable dimensional mapping across authentic tasks.
- Culture evidence concerns emotion recognition, not a cross-cultural VAC motor
  function.
- No reviewed study tests a small, continuously visible Live2D character in
  peripheral desktop vision; Lares acceptance must come from the viewing
  experiment above.
