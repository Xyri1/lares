# Live2D movement capability envelope

Research note for slice 013, 2026-08-04. Scope: establish from official
Live2D Cubism documentation what a model *can* move before inspecting any
particular Lar. Haru is intentionally excluded.

## Conclusion

**Live2D has no universal skeleton and no fixed anatomical degrees of
freedom.** It is a parameter-driven 2D deformation system. A creator may make
any illustrated region move by assigning authored keyforms to ArtMeshes,
warp deformers, rotation deformers, or opacity. At runtime, an
application drives the exported scalar parameters and part opacities; the
model turns those values into the authored deformation.

The official standard parameter list recommends reusable controls for face,
head, body, arms, hands, shoulders, hair, breath, bust, and whole-model
translation. Those names and ranges are conventions, not required controls.
Therefore Live2D documentation can define the platform's movement *mechanisms*
and candidate control families, but only a model inspection can establish the
actual movable parts, independent controls, visual range, and safe expressive
envelope of a specific Lar.

## 1. What physically changes

| Cubism object or system | Authorable change | Runtime control |
|---|---|---|
| ArtMesh | individual mesh vertices may be moved to deform an illustration layer | indirect, through parameters and their keyforms |
| warp deformer | bends or warps one or many child objects; can also change scale and opacity | indirect, through parameters |
| rotation deformer | rotates and scales child objects without the shrinkage produced by large linearly interpolated mesh rotations | indirect, through parameters |
| parameter | interpolates between model-authored keyforms; range, default, ID, and meaning are author-defined | set, add, or weight a scalar value before model update |
| Part | groups model objects and provides coarse visibility/opacity control | set part opacity directly or through pose handling |
| motion | time-varying curves over parameters and part-selection values | start, stop, loop, prioritize, interrupt, and fade |
| expression | a time-invariant relative parameter layer | add, multiply, or overwrite per parameter, with fade |
| pose | selects and crossfades mutually exclusive Part drawings | normally follows motion-written virtual values |
| physics | maps changes in input parameters through authored pendulums into output parameters | evaluate after primary movement; behavior remains model-specific |

An ArtMesh is an illustration layer with a polygon mesh. Moving its vertices
creates expression and movement
([About ArtMeshes](https://docs.live2d.com/en/cubism-editor-manual/concept-of-artmesh/)).
Deformers let a creator move groups of vertices together: warp deformers bend
their contents, while rotation deformers rotate and scale them
([About Deformers](https://docs.live2d.com/en/cubism-editor-manual/deformer/),
[Warp Deformer](https://docs.live2d.com/en/cubism-editor-manual/making-and-placement-of-warp-deformer/),
[Rotation Deformer](https://docs.live2d.com/en/cubism-editor-manual/making-and-rotation-of-rotationdeformer/)).

This means "which body part can move?" has no format-level anatomical answer.
Head, torso, arms, legs, clothing, hair, or an accessory can move if the model
contains suitable separated art and authored deformation. Conversely, a
plausible parameter name does not manufacture missing artwork, deformers, or
keyforms.

## 2. What a parameter means

A parameter represents one creator-defined movement and interpolates between
the keyforms assigned to it. Motions are produced by combining these
parameters. The creator chooses each parameter's ID, description, minimum,
default, and maximum; Live2D recommends standard IDs only when a project has no
other rules
([About Parameters](https://docs.live2d.com/en/cubism-editor-manual/parameter/),
[Add/Delete Keys](https://docs.live2d.com/en/cubism-editor-manual/edit-parameters/)).

Therefore one exported scalar is not necessarily one anatomical joint:

- one parameter may coordinate many ArtMeshes and deformers;
- one body region may depend on several parameters;
- two parameters may interact through objects that have keyforms for both;
- a parameter may switch a drawing or expression form rather than rotate
  anything;
- the numerical span says nothing by itself about visible displacement.

At runtime, Cubism exposes parameter values and Part opacity, then recalculates
the model's vertices during the model update
([Parameter Operation](https://docs.live2d.com/en/cubism-sdk-manual/parameters/)).
Thus the exported parameter inventory is the runtime control surface, while the
mesh/deformer hierarchy is the hidden mechanism that gives each value its
visual meaning.

## 3. Official candidate movement families

The standard list exists to make model and motion reuse easier. It recommends
the following movement families; starred entries in the official table are
optional
([Standard Parameter List](https://docs.live2d.com/en/cubism-editor-manual/standard-parameter-list/)):

| Family | Recommended controls | Typical recommended span | Guarantee? |
|---|---|---:|---|
| face orientation | head angle X/Y/Z | `-30..30` | no |
| eyes and gaze | eye open/smile/form, eyeball X/Y/form | commonly `-1..1` or `0..1` | no |
| brows and mouth | brow positions/forms, mouth form/open | model-dependent standard spans | no |
| cheek | blush/cheek amount | `0..1` | no |
| torso | body angle X/Y/Z | `-10..10` | no |
| arms | left/right arm A and optional B | suggested `-30..30`; larger or smaller allowed | optional |
| hands | left/right hand deformation | `-10..10` | optional |
| shoulders | shrug/shoulder Y | `-10..10` | optional |
| breathing | breath phase | `0..1` | no |
| hair | front/side/back sway and optional fluff | `-1..1` | no |
| bust | X/Y secondary movement | `-1..1` | optional |
| whole model | base translation X/Y | `-10..10` | optional |

The same official page defines recommended groups for body, arms, hands, legs,
hair, and other regions. Group existence is organizational metadata, not proof
that a model contains a corresponding parameter or deformation. Even the
recommended numeric spans may be widened or narrowed to match a rig.

The practical upper bound is therefore broad: Cubism can represent face,
head, torso, bilateral limbs, hands, hair, clothing, accessories, breathing,
and whole-model movement. The practical lower bound is zero for any control the
creator did not author.

## 4. Time, replacement drawings, and secondary motion

### Authored motion

`.motion3.json` carries time-varying parameter curves and can coordinate many
controls into one performance. Motion playback supports fade, loop,
interruption, and application-defined priority
([About Motion](https://docs.live2d.com/en/cubism-sdk-manual/motion/)). This is
where anticipation, offset timing, holds, overshoot, recovery, and coordinated
part changes can be authored; those qualities are not implied by the parameter
inventory.

### Expression

`.exp3.json` is not time-varying choreography. It applies parameter values
relative to the current state through Add, Multiply, or Overwrite and may fade
between settings. Multiply can preserve an underlying waveform such as blink;
Overwrite suppresses it
([About Expression Motion](https://docs.live2d.com/en/cubism-sdk-manual/expression/)).

### Pose and Part variants

Pose allows mutually exclusive drawings to be selected and crossfaded. This
supports changes that deformation alone cannot provide—for example, separate
drawings for different arm configurations. The drawings must already be
separated and keyed; runtime pose logic cannot create an unillustrated limb
configuration
([About Pose](https://docs.live2d.com/en/cubism-sdk-manual/pose/),
[Create Motion with Pose Switching](https://docs.live2d.com/4.2/en/cubism-editor-manual/change-pose/)).

### Physics

Physics maps model-authored input parameters into output parameters through
pendulum settings. Official examples use head or torso inputs to sway hair,
skirts, or accessories; arm parameters may drive accessories attached to an
arm. Inputs, outputs, influence, delay, mobility, acceleration, scale, and FPS
belong to the model
([About Physics](https://docs.live2d.com/en/cubism-editor-manual/physics-operation/),
[How to Set Up Physics](https://docs.live2d.com/en/cubism-editor-manual/physical-operation-setting/)).
Physics supplies follow-through and settling, not the primary pose or gesture.

## 5. Composition is part of the capability

The official sample update applies the main motion, saves that state, then
applies blink, expression, look/drag additions, breath, physics, lip sync, and
pose before the final model update
([Parameter Operation](https://docs.live2d.com/en/cubism-sdk-manual/parameters/)).
An application may choose its policy, but overlapping writers are observable:
an expression can suppress blink, physics can overwrite a primary writer, and
two motion managers that write the same parameter become order-dependent.

Consequently, a capability inventory must record not only which values exist
but also who normally owns them:

- **primary authored controls:** posture and gesture parameters;
- **persistent overlays:** expression parameters;
- **procedural controls:** blink, gaze, breath, or lip sync;
- **derived controls:** physics outputs;
- **variant controls:** pose/Part selection;
- **temporal ownership:** which motion may temporarily override which layer.

## 6. Haru-independent capability matrix

| Question | Answer available from Live2D documentation |
|---|---|
| Can the face, head, torso, arms, hands, legs, hair, clothes, or accessories move? | Yes, if the creator separated and rigged them. None is guaranteed. |
| Is movement skeletal? | No. Runtime values drive authored 2D mesh deformation, deformer transforms, and Part visibility. |
| How many degrees of freedom exist? | As many independently useful parameters and pose variants as the model author created; parameter count is only an upper-bound proxy. |
| What is each control's range? | The model exports numeric minimum/default/maximum; visual and safe range still require inspection. |
| Can one control move several regions? | Yes. Parameters may coordinate multiple ArtMeshes/deformers. |
| Can one region have several controls? | Yes. Objects may participate in multiple parameterized keyform sets. |
| Can the runtime synthesize a missing hand or arm pose? | No. It can only combine deformation and variants already authored into the model. |
| Can a model perform continuous full-body choreography? | Yes, through time-varying parameter/Part curves, provided the rig exposes the necessary authored controls. |
| Are standard IDs portable DOFs? | They are recommendations that improve reuse, not format guarantees. |
| Are parameter extremes automatically natural or expressive? | No. Numerical extrema are author-defined shapes; naturalness depends on the model, curve coordination, and composition order. |

## 7. Required handoff to a specific Lar

The platform evidence determines what must be inspected later. A Lar-specific
atlas needs:

1. every parameter ID, minimum, default, maximum, and mapped object family;
2. a visual sweep that labels the actual effect and usable range;
3. Part groups and pose variants, including which drawings are mutually
   exclusive;
4. expression recipes, blend modes, fades, and overlapping writers;
5. every motion's parameter/Part coverage, timing, pose dependencies, and
   visible choreography;
6. physics inputs, outputs, and authored response qualities;
7. parameter ownership and conflicts across motion, expression, procedural
   writers, pose, and physics.

Only after that atlas exists can a choreography design state which controls a
particular Lar can use and how strongly it may use them.
