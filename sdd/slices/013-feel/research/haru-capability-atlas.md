# Haru capability atlas

Research note for slice 013, 2026-08-04. Scope: inspect the bundled Haru rig,
expressions, motions, pose variants, and physics after establishing the general
Live2D capability envelope and stylized-motion principles. This is a physical
inventory, not an emotion mapping.

## Conclusion

**Haru is capable of coordinated head, torso, face, and arm performance. The
earlier forearm-hinge result was a generator limitation, not the rig's complete
expressive limit.**

Haru has two different arm systems on each side:

- **Arm A** is one visible, continuously deformable drawing. Its range moves
  from hand-on-hip through a relaxed hanging arm to an inward-tucked arm.
- **Arm B** is an alternate drawing selected through Part opacity. Bundled
  motions use it for qualitatively different silhouettes including crossed or
  clasped arms, a hand at the face/chin, a hand at the chest, and a raised hand.

A raw sweep of `PARAM_ARM_*_B` appears inert while Part B is hidden. It becomes
visible only when the pose system switches the mutually exclusive A/B Parts.
The E1 generator drove Arm A values but did not carry authored Part switching,
so it could never reach most of Haru's hand and arm vocabulary.

Haru's 23 bundled motions demonstrate a second constraint: naturalness comes
from the complete authored phrase. Every file coordinates all 33 parameters
and four arm-Part opacity curves. Head, torso, gaze, facial form, arm topology,
timing, and hair response travel together. Extracting a few independently
useful curves loses the relationships that make the original motion natural.

## Method and evidence

The atlas combines direct asset inspection with deterministic captures at the
normative 400 logical px Lar height:

- [channel filmstrips](../experiments/evidence/channel-atlas/) sweep each
  exposed facial, gaze, posture, arm, breath, and hair parameter from its
  rig-authored minimum through its default to its maximum;
- [motion contact sheets](../experiments/evidence/motion-atlas/) show six
  uniformly spaced frames from every bundled motion;
- [expression stills](../experiments/evidence/stills/) apply each bundled
  expression recipe to the rig defaults;
- [motion clips](../experiments/evidence/clips/) and
  [runtime traces](../experiments/evidence/traces/) preserve all 23 official
  motions frame by frame;
- `haru.cdi3.json`, `haru.model3.json`, `haru.pose3.json`,
  `haru.physics3.json`, all `.exp3.json`, and all `.motion3.json` files were
  inspected directly.

Captures restore both parameter defaults and Part opacities before each case.
This matters: without the Part reset, one motion's alternate arms can leak into
the next capture and create a false rig reading.

## 1. Continuous control surface

Haru exposes 33 parameters and 26 Parts. The table records visible behavior,
not meaning inferred from an ID.

| Physical family | Controls and authored range | Observed effect at 400 px | Normal owner |
|---|---|---|---|
| head | angle X/Y/Z, each `-30..30` | yaw and pitch are subtle; roll is clearer because the hair silhouette changes | baseline or motion; physics input |
| torso | body X/Y/Z, each `-10..10` | X/Z shift the upper-body line; Y gives the clearest approach/withdrawal read | baseline or motion; physics input |
| Arm A | left/right `-1..1`, default `0.5` | hand-on-hip at `-1`, hanging near `0`, increasingly tucked inward toward `1`; strongest static body control | motion or bounded posture writer when A Part is visible |
| Arm B | left/right `-1..5`, default `0` | no visible effect while B Part is hidden; changes an alternate authored arm/hand drawing after pose selection | motion together with pose |
| eye opening | left/right `0..2`, default `1` | closed through normal to wide | blink, expression, or motion |
| eye smile | left/right `0..1` | subtle alone; clear when coordinated with eye closure | expression or motion |
| eye form | `-1..1` | sharp/narrow through neutral to soft/round | expression or motion |
| pupil form | `-1..0` | visible pupil/form change, used by surprise | expression or motion |
| gaze | eye-ball X/Y, each `-1..1` | clear bilateral gaze direction | baseline or motion |
| brows | bilateral Y/X/angle/form, each `-1..1` | position, spacing, slope, and curvature; readable as a coordinated pair | expression or motion |
| mouth | form `-1..1` with default `1`; open `0..1` | frown-to-smile form and closed-to-open mouth | expression, motion, or lip sync |
| blush | `PARAM_TERE`, `0..1` | clear cheek color | expression |
| breath | `0..1` | subtle chest and garment expansion | procedural baseline or motion |
| bust | `-1..1` | not visibly useful in the isolated sweep at this framing | motion, if used |
| hair | front/back, each `-1..1` | clear lateral deformation | physics output; direct only for diagnosis |

Numerical extrema are not a naturalness guarantee. Arm A's endpoints are valid
authored shapes, but many complete silhouettes exist only in Arm B artwork.
Likewise, a subtle single parameter can become legible through coordinated
motion, silhouette change, or secondary hair response.

## 2. Bundled expression recipes

All eight `.exp3.json` files are static additive facial recipes. They contain
no body controls, no Part switching, and no time-varying choreography. Their
asset names are listed only as file identities; they are not adopted as Lares
emotion semantics.

| File | Non-zero additive recipe | Physical read in the capture |
|---|---|---|
| `Normal` | none | rig-authored neutral/default face |
| `Angry` | eye form `-1`; brow angles/forms `-0.5`; mouth form `-2` | sharpened eyes, sloped/formed brows, deep frown |
| `Blushing` | eyes open `-0.1`; eye form `+0.3`; brow angles `+0.25`; brow forms about `-0.45`; mouth `-0.5`; blush `+1` | strong cheek blush with softened/narrowed eyes and small downturned mouth |
| `Sad` | eyes open `-0.1`; eye form `+1`; brow angles `+0.3`; brow forms `-0.5`; mouth `-1.5` | soft/drooped eye-brow organization and downturned mouth |
| `Smile` | eyes open `-1`; eye smile `+1`; brow Y `+0.3`; brow form `+0.2` | strong closed-eye smile |
| `Surprised` | eyes open `+1`; pupil form `-1`; brow Y `+0.3`; brow form `+0.5`; mouth `-1.21` | wide eyes, changed pupils, raised arched brows, startled face |
| `f01` | mouth `-1` | mild mouth-only frown |
| `f02` | eyes open `-0.2`; brow form `-0.5`; mouth `-2` | narrowed eyes with stern or displeased facial organization |

The expressions are useful evidence of creator-approved facial combinations.
They do not solve body language, and their labels cannot be treated as a
portable affect dictionary.

## 3. Bundled motion repertoire

Every motion contains 37 curves: Haru's 33 parameters plus four arm-Part
opacity curves. “A,” “B,” and “mixed” below identify the visible arm drawings,
not an emotional category.

| Motion | Duration | Arm drawing | Dominant visible choreography |
|---|---:|---|---|
| `Idle[0]` | 10.00 s | A | subtle open-eyed head/body sway; arms remain at sides |
| `Idle[1]` | 10.00 s | A | subtle head, body, gaze, and face phrase; arms remain quiet |
| `Idle[2]` | 10.00 s | A | broader head/body sway and tilt with a closed-eye smile accent |
| `Flick[0]` | 2.63 s | A | small head/face/blink phrase with little torso and no arm travel |
| `Flick[1]` | 3.00 s | B | crossed-arm silhouette with closed-eye head movement |
| `Flick[2]` | 2.93 s | B | hand at chin/cheek, other arm crossed, with head/body lean |
| `Tap[0]` | 2.53 s | A | hands-on-hips silhouette with coordinated head/torso expansion |
| `Tap[1]` | 3.13 s | B | hands clasped at the chest with a closed-eye smile |
| `Tap[2]` | 1.43 s | mixed | asymmetric hand-to-chest/extended-arm pose with head/body tilt |
| `Tap[3]` | 2.70 s | A | hands on hips with stronger head/torso and facial phrasing |
| `Tap[4]` | 2.03 s | B | hand-to-chin/thought pose with the other arm crossed |
| `Tap[5]` | 2.40 s | B | crossed/hand-near-chest organization; face-led phrase |
| `FlickRight[0]` | 4.23 s | B | hand-to-chest/crossed silhouette with head and face movement |
| `FlickRight[1]` | 2.77 s | A | arms down with closed-eye smile/laugh phrase |
| `FlickRight[2]` | 2.13 s | A | arms down, open mouth, and subtle head/body response |
| `Flick3[0]` | 1.97 s | B | clasped hands coordinated with head and torso |
| `Flick3[1]` | 1.67 s | A | arms down, open-mouth closed-eye smile, light whole-body motion |
| `Flick3[2]` | 1.57 s | A | arms down, closed eyes and head tilt, light whole-body motion |
| `FlickLeft[0]` | 3.27 s | A | coordinated head/body/face phrase with arms down |
| `FlickLeft[1]` | 2.57 s | B | one hand raised, other arm crossed; strongest asymmetric silhouette |
| `FlickLeft[2]` | 4.23 s | B | crossed/hand-to-chest pose with a face-led laugh phrase |
| `Shake[0]` | 2.03 s | B | clasped hands, face-led action, modest body travel |
| `Shake[1]` | 3.73 s | A | largest coordinated open head/torso/arm/face performance |

The motion groups are interaction labels from the sample application, not
performance metadata. `Tap`, `Flick`, and `Shake` do not tell Lares what the
body organization means or where it belongs in `[V,A,C]`.

Three useful structural facts emerge:

1. the idle set preserves the A arm drawing and contains no meaningful arm
   travel, so idle alone cannot provide Haru's complete expressive vocabulary;
2. the short one-shot motions carry the richer body and hand silhouettes;
3. some phrases share a broad pose family, but the library is not phase-aligned
   or topology-aligned for arbitrary continuous blending.

## 4. Pose and physics

`haru.pose3.json` defines two mutually exclusive groups:

- `PARTS_01_ARM_R_A_001` / `PARTS_01_ARM_R_B_001`;
- `PARTS_01_ARM_L_A_001` / `PARTS_01_ARM_L_B_001`.

Motions write virtual values for all four Parts and the pose stage crossfades
the appropriate drawing. Hands are part of those authored drawings. Haru does
not expose independent wrist or finger controls, so runtime math cannot invent
a new hand gesture between A and B.

`haru.physics3.json` has two groups. Both take head X/Z at weight 60 and body
X/Z at weight 40; one outputs front-hair sway and the other back-hair sway.
Physics therefore follows primary head/torso action and helps it settle. It
does not create the posture or gesture.

## 5. What this establishes for synthesis

The Haru atlas rejects four earlier assumptions:

- **“The rig only has forearm movement.”** False. The visible limitation came
  from using Arm A without Haru's alternate Part drawings.
- **“A parameter vector is a complete body pose.”** False. Part topology and
  coordinated curves are part of the performance state.
- **“The official motions can simply be named as emotions.”** Unsupported.
  They are physical performances with sample interaction names.
- **“Maximum expression means every parameter at its numeric extreme.”**
  False. Haru's strongest natural examples use selected authored silhouettes,
  coordinated timing, quiet supporting parts, and physics—not uniform maxima.

E4 adds one bounded result: the maintainer confirmed that `Shake[1]` remained
natural at experimental displacement factors `0.7`, `1.0`, and `1.2` with
matched playback factors `0.85`, `1.0`, and `1.15`. Whether viewers perceive
those three clips in activation order remains untested. This supports cautious
modulation of an authored phrase; it does not yet validate a complete VAC
mapping.

The next design must therefore treat Haru's authored poses and phrases as a
character-local physical basis. `[V,A,C]` may select and modulate that basis,
but it cannot reconstruct its choreography from the raw scalar rig alone.
