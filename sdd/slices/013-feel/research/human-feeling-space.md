# Representing human feeling and expression with three values

First-principles affective-psychology research for slice 013, 2026-08-02. This
note concerns human felt experience and perceived expression; it does not
assume the current Lares freeform pipeline.

## Conclusion

Use three values as a **compact first-person reporting and control space**, not
as a complete ontology of emotion:

1. **Valence** — unpleasant to pleasant.
2. **Activation** — deactivated/still to activated/energized.
3. **Felt control** — controlled/overwhelmed to able to influence what happens
   next.

This is the human-grounded version of Pleasure-Arousal-Dominance (PAD), with
two wording changes. *Activation* avoids the everyday ambiguity of *arousal*.
*Felt control* avoids confusing PAD dominance with social rank, aggression, or
who caused an event. `agency` is too broad unless it is defined exactly as felt
capacity to affect the situation.

Valence and activation have the strongest and broadest support. Control is a
useful third discriminator, but it is less reliable and more sensitive to the
question asked. Three values compress affect well enough to drive a character;
they cannot by themselves preserve cause, target, certainty, responsibility,
novelty, social meaning, or a named emotion.

## What each value represents

| Value | Low end | High end | Important exclusion |
|---|---|---|---|
| Valence | unpleasant, distressed | pleasant, satisfied | not whether the task objectively succeeded |
| Activation | sleepy, still, subdued | energized, tense, excited | not emotion importance or duration |
| Felt control | powerless, overwhelmed, acted upon | capable, influential, in control | not dominance over another person or causal responsibility |

The third value adds real discrimination. Negative, activated states can feel
powerful and approach-oriented, as in anger, or powerless and avoidant, as in
fear or anxiety. Russell and Mehrabian used this argument for
dominance-submissiveness: two studies with 200 and 300 participants found that
pleasure, arousal, and dominance accounted for almost all reliable variance in
the tested verbal emotion scales and term ratings
([Russell & Mehrabian 1977](https://doi.org/10.1016/0092-6566(77)90037-X)).
That supports a compact description of reported emotion language; it does not
prove that human emotion literally has only three components.

## Where the three dimensions came from

PAD grew from the semantic-differential tradition, which repeatedly recovered
evaluation, potency, and activity from people's judgments of meaning. Applied
to feeling, these became pleasure/valence, dominance/control, and
arousal/activation. Russell and Mehrabian's 1977 experiments are the direct
empirical statement of the resulting three-factor model
([paper](https://doi.org/10.1016/0092-6566(77)90037-X)).

Bradley and Lang's Self-Assessment Manikin (SAM) showed that people can report
their affective response with one pictorial judgment per PAD dimension. SAM
agreed strongly with an 18-rating semantic differential for pleasure and
arousal. Dominance diverged between the instruments, which the authors
interpreted as SAM better tracking the person's response to the stimulus
([Bradley & Lang 1994](https://doi.org/10.1016/0005-7916(94)90063-9)). This
exposes a referent problem: a powerful stimulus can make the observer feel
powerless. A reporting interface must ask about **my felt control**, never the
power or dominance of the event.

## Felt experience is richer than three values

The evidence does not establish three as the uniquely correct dimensionality.
Fontaine and colleagues evaluated 144 features spanning appraisal, physiology,
motor expression, action tendency, subjective experience, and regulation. In
three languages, emotion-word meaning required four dimensions:
evaluation-pleasantness, potency-control, activation-arousal, and
**unpredictability**
([Fontaine et al. 2007](https://doi.org/10.1111/j.1467-9280.2007.02024.x)). A
three-value state therefore collapses surprise/novelty and other distinctions.
That is acceptable for a control signal only if context and change over time
remain available elsewhere. It also reinforces why `agency` is too broad:
control is only one appraisal among several, not a synonym for responsibility,
certainty, or novelty. Treat the space as a coordinate system, not a cube whose
every point is equally natural or whose coordinates have universal thresholds.

## Felt experience is not observed expression

A self-report answers **what I feel**. A face, voice, or posture supports an
observer's inference about **what someone else may feel**. The mapping is
many-to-many and context-dependent.

### Face

Facial behavior carries both dimensional and categorical information. In
enacted expressions, facial behavior contributed to detecting emotion
categories and to judgments of valence, arousal, dominance, and
unpredictability
([Scherer et al. 2015](https://doi.org/10.1037/a0039416)). Dimensions do not
replace recognizable expression families; both forms of information coexist.

Repeatability is not a universal face-to-feeling decoder. At peak emotional
intensity, participants distinguished positive from negative real-life scenes
from isolated bodies but not isolated faces; swapping bodies shifted the
perceived valence of the same faces
([Aviezer, Trope, & Todorov 2012](https://doi.org/10.1126/science.1224313)).
Dynamic facial representations and intensity cues also differed between the
Western and East Asian groups tested by Jack and colleagues
([Jack et al. 2012](https://doi.org/10.1073/pnas.1200155109)).

### Voice and body

In acted vocal expressions, listeners produced distinct activation, valence,
and potency profiles for anger, disgust, fear, happiness, and sadness. Student
and expert mean ratings correlated at .90 for activation, .81 for valence, and
.92 for potency. Acoustic cues predicted activation and potency better than
valence, showing that the dimensions are perceivable but not equally recoverable
from one channel
([Laukka, Juslin, & Bresin 2005](https://doi.org/10.1080/02699930441000445)).

Body expression is richer than a direct valence/activation mapping. A study of
10 actors portraying 12 emotions found that potency and attentional activity
helped differentiate bodily expression beyond valence and arousal. Most
emotions used multiple movement patterns; posture and action often reflected
appraisal and action readiness, with high control/power associated with such
cues as forward inclination and communicative emphasis rather than one
universal pose
([Dael, Mortillaro, & Scherer 2012](https://doi.org/10.1037/a0025737)).

## Consequences for an expressive desktop character

The following are product inferences from the human evidence:

- Accept **first-person valence, activation, and felt control** as the sparse
  input. Do not infer them from the agent's prose or expose raw animation knobs.
- Keep cause, target, operational status, and history outside the vector. The
  same point can mean different things in different situations.
- Use change as information. Relief, disappointment, startle, and recovery are
  trajectories, not stable coordinates; the previous vector is enough to derive
  direction and speed without another model call.
- If surprise must be expressed distinctly, derive or supply a bounded novelty
  signal from context rather than pretending V-A-C contains Fontaine's missing
  unpredictability dimension.
- Map the state across channels: face, gaze, posture, movement energy, timing,
  and optional voice. No single face parameter should be treated as an axis.
- Let each character implement the mapping conservatively. The axes can be
  shared while amplitude, channel choice, timing, and pose remain character-
  specific.
- Test whether people perceive intended regions and transitions, including the
  target cultures. Do not require exact emotion-label agreement; check the
  coarser questions the interface actually promises: pleasant or unpleasant,
  activated or subdued, in control or overwhelmed.

The cheap contract is therefore three reported values plus deterministic
history-aware performance. Adding emotion labels, a fourth value, or richer
appraisal should wait for a demonstrated expressive failure that the existing
context and trajectories cannot resolve.
