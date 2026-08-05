# Live2D emotional-performance practices

Research note for slice 013, 2026-08-04. Scope: how the official Cubism
toolchain, VTube Studio, and Lares's installed `pixi-live2d-display` 0.4.0
compose tracking, expressions, authored motions, pose switching, and physics.
This note separates documented behavior from product inference and changes no
Lares decision or contract.

## Conclusion

**Established Live2D practice is a layered, character-authored performance
system—not procedural emotion synthesis from a few rig parameters.**

The documented stack is broadly:

1. continuous input or an idle motion supplies the live baseline;
2. an `.exp3.json` layer changes a small set of expression parameters;
3. a `.motion3.json` supplies time-varying, coordinated choreography;
4. `.pose3.json` switches mutually exclusive drawings such as alternate arms;
5. `.physics3.json` adds authored secondary response to the resulting movement;
6. runtime triggers, priorities, fades, and update order decide which source
   controls a parameter at a given moment.

VTube Studio makes this operational pattern explicit: face tracking drives the
baseline; creators assign expression and animation assets to hotkeys; one-time
animations temporarily outrank tracking; expressions outrank animations; and
physics is applied last. Control returns smoothly to the next active provider
when the higher layer ends
([VTS interaction order](https://github.com/DenchiSoft/VTubeStudio/wiki/Interaction-between-Animations%2C-Tracking%2C-Physics%2C-etc.)).

The official material defines no valence/activation/control mapping, no
cross-character emotion vocabulary, and no algorithm that derives natural
gesture choreography from three affect values. Any such mapping remains a
Lares product decision. The sources do establish that the natural timing,
coordination, part changes, and secondary movement seen in an official motion
are primarily character-authored assets that the runtime selects and combines.

## What is documented and what is inferred

The sections labeled **Established** summarize first-party behavior or advice.
Sections labeled **Inference** draw a product implication from those facts; they
are not claims made by Live2D or VTube Studio.

## 1. Continuous tracking is the performance baseline

**Established.** VTube Studio maps continuous face, mouse, audio, or other
input parameters to arbitrary Live2D output parameters. Each mapping has input
and output ranges, optional range limiting, and smoothing; automatic breath and
blink can operate without tracking input. Standard Live2D names allow automatic
setup, but VTS warns that custom IDs or ranges require manual setup and that even
automatic setup may need model-specific tuning
([VTS model settings](https://github.com/DenchiSoft/VTubeStudio/wiki/VTS-Model-Settings)).

This base layer is not sovereign. In VTS, a parameter's documented provider
order from low to high is default value, idle animation, face tracking,
one-time animation, expression, then physics. A higher provider overwrites only
while active, and handoff back to the lower provider is faded
([VTS interaction order](https://github.com/DenchiSoft/VTubeStudio/wiki/Interaction-between-Animations%2C-Tracking%2C-Physics%2C-etc.)).
The Cubism SDK similarly makes calculation order part of application behavior:
its sample applies the main motion, saves that state, then applies blink,
expression, look/drag additions, breath, physics, lip-sync, and pose before the
model update
([Cubism parameter operation](https://docs.live2d.com/en/cubism-sdk-manual/parameters/)).

**Inference.** A continuous state such as `[V,A,C]` can occupy the same
architectural role as tracking—a persistent baseline or a set of bounded
modifiers—without being expected to author a complete gesture frame by frame.
This is an analogy to the documented layering model, not a documented Cubism
affect feature.

## 2. `.exp3.json` is a static expression layer

**Established.** Cubism expression motion sets parameter values relative to the
current state. Unlike `.motion3.json`, it has no time-varying values and cannot
change Parts. Each included parameter uses one of three calculation modes:

- `Add` adds a value and is the default when no mode is specified;
- `Multiply` scales the current value, preserving an underlying waveform;
- `Overwrite` ignores the prior value and replaces it.

Cubism's own eye example shows the consequence: `Multiply` preserves blinking,
while `Overwrite` suppresses it. The SDK recommends a separate expression
motion manager so a facial expression can operate with the normal motion
([Cubism expression motion](https://docs.live2d.com/en/cubism-sdk-manual/expression/)).

The authoring guidance is deliberately narrow. Expression scenes should key
only parameters related to facial expression; face angle, hair swing, gaze, and
normally mouth-open parameters should remain at their standard values because
motion, tracking, blinking, or lip-sync may also drive them. For non-default eye
openness, Live2D recommends `Multiply` so blinking remains natural
([creating facial expressions](https://docs.live2d.com/en/cubism-editor-manual/create-facial-expressions/),
[expression settings and export](https://docs.live2d.com/en/cubism-editor-manual/setting-and-exporting-facial-expressions/)).
An expression has a fade used when changing from the current expression to the
new setting; the Viewer default is 500 ms
([expression settings and export](https://docs.live2d.com/en/cubism-editor-manual/setting-and-exporting-facial-expressions/)).

VTube Studio exposes the same modes but adds runtime stacking rules. Among
overwrite expressions touching the same parameter, the last activated hotkey
wins; additive and multiplicative expressions remain simultaneously active,
with multiplication applied before addition
([VTS expressions](https://github.com/DenchiSoft/VTubeStudio/wiki/Expressions-%28a.k.a.-Stickers-or-Emotes%29)).

**Inference.** `.exp3` is suited to a persistent facial bias layered over
blinking, lip-sync, or motion. It is not a body-performance generator and cannot
supply anticipation, timing, recovery, or pose-part switching.

## 3. `.motion3.json` contains authored choreography

**Established.** `.motion3.json` is exported motion data from Cubism's
Animation Workspace. It carries time-varying parameter curves and can include
part visibility/opacity and user events
([embedded data](https://docs.live2d.com/en/cubism-editor-manual/export-moc3-motion3-files/),
[Cubism motion playback](https://docs.live2d.com/en/cubism-sdk-manual/motion/)).
The application loads a motion, starts it through a motion manager, and applies
its current values to the model every frame. Motions may loop until interrupted
or explicitly ended
([Cubism motion playback](https://docs.live2d.com/en/cubism-sdk-manual/motion/)).

Live2D's authoring advice identifies what makes a motion look natural:

- coordinate body X/Z movement with the face instead of moving only the head;
- offset face and body timing to imply inertia rather than moving them in lockstep;
- overshoot or brake instead of stopping instantly;
- coordinate blinking with head or eye direction changes;
- begin face, body, and arm movement together when the character starts speaking.

These are explicit official motion-quality recommendations
([motion quality improvement tips](https://docs.live2d.com/en/cubism-editor-tutorials/motion-hint/)).
They closely match the qualities that a sparse independent-parameter oscillator
cannot recover by amplitude alone: phase relationships, anticipation,
follow-through, and asymmetric timing.

**Inference.** The naturalness of an official Haru motion is evidence about the
value of its authored curve relationships, not proof that the motion's filename
or group is an emotional category. A runtime may preserve and modulate that
choreography, but official sources do not define how to select a motion from
`[V,A,C]`.

## 4. Triggers, fades, priority, and interruption

### Cubism Original Workflow

**Established.** Motion fade can be authored at several levels. Per-parameter
fade has precedence, followed by the `.model3.json` motion override, then the
motion's overall fade; the SDK defaults to one second when none is specified
([Cubism motion playback](https://docs.live2d.com/en/cubism-sdk-manual/motion/)).
Starting a replacement motion causes the existing motion to fade out. The
motion manager stores current and reserved integer priority, but the application
must implement admission policy. Multiple motion managers can play in parallel,
but Live2D warns that overlapping parameter writers become last-update-wins and
may fade poorly
([Cubism motion playback](https://docs.live2d.com/en/cubism-sdk-manual/motion/)).

Priority therefore controls interruption; it does not blend the semantic
meaning of two motions. Calculation order independently controls how motion,
expression, blink, tracking, and physics combine.

### VTube Studio

**Established.** Creators commonly expose performance assets through keyboard
or on-screen hotkeys. The documented actions include playing one `.motion3.json`
once, changing the looping idle animation, toggling an `.exp3.json`, and clearing
expressions. Animation/expression hotkeys can use fade settings, stop after a
duration or key release, and an animation can optionally hold its last frame
([VTS model settings](https://github.com/DenchiSoft/VTubeStudio/wiki/VTS-Model-Settings)).

The VTS WebSocket API can list and execute those same hotkeys. It can also
activate an expression directly with a 0–2 second fade, though the API recommends
using the model's hotkeys so the user retains a configured way to deactivate it
([VTS API](https://github.com/DenchiSoft/VTubeStudio)). Hand-tracking gestures and
Twitch events can also trigger hotkeys; this confirms that trigger sources are
runtime/application policy rather than content embedded in the expression
([VTS hand tracking](https://github.com/DenchiSoft/VTubeStudio/wiki/Hand-Tracking),
[VTS Twitch triggers](https://github.com/DenchiSoft/VTubeStudio/wiki/Twitch-Hotkey-Triggers)).

### `pixi-live2d-display` 0.4.0

**Established.** Lares's installed adapter exposes `model.motion(group, index,
priority)` and `model.expression(nameOrIndex)`. Motions use `IDLE`, `NORMAL`, or
`FORCE` priority, with reservation/loading behavior; idle motions are selected
automatically when no other motion is active
([complete guide](https://github.com/guansss/pixi-live2d-display/wiki/Complete-Guide),
[0.4.0 motion manager source](https://github.com/guansss/pixi-live2d-display/blob/v0.4.0/src/cubism-common/MotionManager.ts)).
The 0.4.0 defaults are 500 ms for non-idle motion fade, 2000 ms for idle fade,
and 500 ms for expression fade when an asset supplies no value
([0.4.0 configuration](https://github.com/guansss/pixi-live2d-display/blob/v0.4.0/src/config.ts)).

Version 0.4.0 preserves the active expression when a non-idle motion starts by
default. Its release note explicitly says this differs from Live2D Viewer and
official demos; `preserveExpressionOnMotion = false` restores the old reset/
restore behavior
([0.4.0 release](https://github.com/guansss/pixi-live2d-display/releases/tag/v0.4.0)).
Its Cubism 4 update order is motion, saved parameters, expression, blink when no
motion updated, focus, breath, physics, pose, and model update
([0.4.0 internal model source](https://github.com/guansss/pixi-live2d-display/blob/v0.4.0/src/cubism4/Cubism4InternalModel.ts)).

**Inference.** The public high-level `motion()` API has no generic intensity or
tempo argument. E4-style time/displacement modulation is therefore custom
renderer behavior, and its placement relative to expression, physics, pose, and
the parameter save/restore boundary must be specified and tested rather than
assumed to be a built-in Live2D feature.

## 5. Pose switching is authored part selection

**Established.** `.pose3.json` fades between mutually exclusive similar Parts,
such as right-hand A and right-hand B, so incompatible drawings are not visible
together. Motion writes virtual parameters with the same IDs as the Parts, then
the pose stage converts those values into coordinated part opacity
([Cubism pose](https://docs.live2d.com/en/cubism-sdk-manual/pose/)). The file is
specifically described as data for reflecting an arm-switching mechanism created
in the model and motion
([Live2D file types](https://docs.live2d.com/en/cubism-editor-manual/file-type-and-extension/)).

**Inference.** Pose switching is not skeletal articulation. A character whose
natural gesture depends on an alternate forearm or hand drawing needs the
authored pose relationship to travel with the motion; a generic parameter sweep
cannot manufacture missing shoulder, elbow, wrist, or hand geometry.

## 6. Physics provides character-authored secondary motion

**Established.** Cubism physics is configured in model-specific groups. Input
parameters drive pendulum models whose outputs typically animate hair, skirts,
ribbons, or other swinging elements. Influence, output scale, weight, delay,
mobility, acceleration, radius, and calculation FPS are authored settings
([Cubism physics settings](https://docs.live2d.com/en/cubism-editor-manual/physics-operation/),
[setting up physics](https://docs.live2d.com/en/cubism-editor-manual/physical-operation-setting/)).
VTube Studio permits per-group strength multipliers and recommends using the
same physics FPS the modeller used
([VTS model settings](https://github.com/DenchiSoft/VTubeStudio/wiki/VTS-Model-Settings)).

**Inference.** Physics amplifies the natural consequence of an authored gesture
through follow-through and settling. It cannot replace the primary coordinated
head, torso, and arm motion that excites it.

## 7. The practical emotional-performance pattern

The following synthesis is an **inference from the documented workflows**, not
an official emotion architecture:

| Layer | Typical physical role | Authored by character creator | Chosen or supplied at runtime |
|---|---|---|---|
| rig/defaults | available shapes, ranges, deformer relationships | parameter geometry and defaults | current numeric values |
| continuous baseline | gaze, head/body tracking, mouth, breath, blink, idle | mapping affordances and safe ranges | live input or persistent state |
| `.exp3` | sustained facial bias | included parameters, values, modes, fade | expression identity, activation, deactivation |
| `.motion3` | timed whole performance | curves, phase, easing, events, part visibility, fade | group/index, onset, priority, interruption |
| `.pose3` | alternate drawings | mutually exclusive groups and links | normally follows motion-produced values |
| `.physics3` | secondary response and settling | inputs, outputs, pendulum qualities, FPS | elapsed time and optional global/group strength |
| application policy | when layers start and which wins | hotkey/config defaults may ship with character | user, tracker, plugin, game, or agent event |

In VTube Studio practice, named expressions and animations are usually explicit
creator/user actions: a hotkey toggles an emote or plays a gesture while tracking
continues underneath. The face and body do not become expressive because the
runtime inferred all their curves; they become expressive because the rig,
expression, motion, pose, and physics were authored to work together, and the
runtime applies them in a controlled order.

## 8. Implications for Lares `[V,A,C]`

These are research implications and open questions, **not decision changes**.

1. **No evidence here requires expanding `[V,A,C]`.** Live2D documentation
   explains execution and asset composition, not affect dimensionality. It
   neither validates nor refutes the existing three-value semantic report.
2. **Do not ask `[V,A,C]` to invent choreography.** The sources support using
   character-authored timing and coordination as physical material, while the
   renderer remains responsible for deterministic playback, interpolation,
   modulation, physics, and drawing.
3. **Do not silently turn asset names into emotion semantics.** VTS commonly
   maps named files to user hotkeys, but that practice does not satisfy Lares's
   existing D25/013-D5 boundary. Whether authored motions may become a
   character-local *physical basis* beneath a renderer-neutral target needs an
   explicit design clarification; this note does not make that choice.
4. **Persistent appraisal and one-shot choreography are different lifetimes.**
   A motion naturally ends and returns control to tracking/default/idle, while
   Lares's feel target remains latched. A future design must specify what
   persistently carries the tuple, what merely accents a transition, and how a
   finished motion reveals the still-current target without returning the Lar
   to semantic neutral.
5. **Parameter ownership must be explicit.** Expression, motion, baseline
   writers, physics, and pose can target the same parameter. Cubism and VTS both
   demonstrate that order changes the result; multiple motion writers on the
   same control do not automatically blend cleanly.
6. **Tempo and displacement modulation are promising but non-standard.** E4's
   passed naturalness result is compatible with the authored-motion pattern, but
   the installed Pixi adapter does not expose those modifiers as a public motion
   API. Their safe stage, range clamping, interaction with expression modes, and
   effect on physics need isolated evidence.
7. **Portability requires capability/fallback policy.** Motions, expressions,
   pose groups, and physics are character-specific. A design must decide the
   minimum authored material a Lar supplies and the behavior of a Lar with no
   suitable motion, without hard-coding Haru's parameters or motion groups into
   the shared semantic layer.

## 9. Unresolved questions for the next experiment or decision

- Can one authored motion basis be continuously modulated across a meaningful
  region of `[V,A,C]`, or are several physical bases required for direction and
  form as well as activation?
- If several bases are required, can selection and blending be defined in
  renderer-neutral performance qualities without reintroducing named emotion
  cues or discontinuities at cell boundaries?
- Which parameters remain owned by the persistent feel target while a motion is
  active, and which may the motion temporarily override?
- Should the face remain a continuous Lares-authored parameter target, use
  character-authored `.exp3` layers, or combine both with explicit per-parameter
  ownership and blend modes?
- At what exact point should intensity scaling occur: on authored motion output
  before expression, before physics, or on selected channels only?
- Must a motion's pose-switch dependencies be declared as part of its physical
  capability so alternate arm/hand drawings are never separated from the clip?
- What interruption policy preserves natural fade and recovery when the latched
  tuple changes during an active authored motion?
- Does a second differently rigged Lar preserve the same perceived V/A/C
  direction when using different character-authored motions?

The next experiment should answer only one of these questions at a time. The
web research supports the authored-performance direction; it does not yet
specify the production mapping.
