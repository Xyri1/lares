# Live2D control surface

Fresh inspection for slice 013, 2026-08-02. This inventories Live2D as a
rendering target without assuming the existing Lares freeform pipeline.

## Conclusion

Live2D exposes a model-specific numeric rig, not an emotion interface. Its
fundamental inputs are scalar model parameters and part opacities. Expressions,
motions, gaze, blinking, breathing, lip sync, physics, and pose are authored or
procedural writers competing or cooperating over that same rig. Drawables are
derived rendering output rather than a useful expressive input.

The official standard parameter names and ranges are recommendations for model
reuse, not a format guarantee. A portable affect interface therefore cannot
name Live2D parameter IDs. Each character must translate renderer-neutral
performance intent into the controls its own rig actually exposes.

## Surface layers

| Surface | What it controls | Character |
|---|---|---|
| Model parameters | Face, gaze, head, body, limbs, blush, breath | Continuous scalar inputs with model-defined IDs and ranges |
| Part opacity | Visibility of structural or pose variants | Direct but coarse and model-specific |
| `.exp3.json` expressions | Relative parameter mixtures with fades | Static authored recipes |
| `.motion3.json` motions | Parameter and part-opacity curves over time | Authored performance clips |
| Eye blink, gaze, breath, lip sync | Procedural parameter changes | Continuous runtime writers |
| Physics and pose | Secondary motion and part selection | Derived systems driven by other controls |
| Drawables | Mesh geometry, render order, masks, colors, opacity | Core output consumed by the renderer |

Cubism parameters have minimum, default, and maximum values chosen by the model
author. The SDK can set or add weighted values before the model update. Cubism
expression motion adds two further composition modes: Multiply and Overwrite.
Overwrite can suppress another writer such as eye blinking, so calculation
order is observable behavior rather than an implementation detail
([standard parameter list](https://docs.live2d.com/en/cubism-editor-manual/standard-parameter-list/),
[expression motion](https://docs.live2d.com/en/cubism-sdk-manual/expression/),
[parameter operation](https://docs.live2d.com/en/cubism-sdk-manual/parameters/)).

The official sample update order applies main motion, eye blink when no main
motion updated, expression motion, gaze and body direction, breath, physics,
lip sync, pose, and finally the Core model update. Applications may choose an
order, but the model designer and runtime must agree on it.

## Haru's actual rig

The bundled Haru model exposes 33 parameters and 26 parts in
`characters/haru/runtime/haru.cdi3.json`:

- 19 facial controls: eye opening, smile, shape and gaze; eight eyebrow
  controls; mouth shape and opening; and blush;
- 6 orientation controls: head XYZ and body XYZ;
- 4 arm controls;
- 4 dynamic controls: breath, bust, front hair, and back hair.

Haru uses older uppercase IDs such as `PARAM_ANGLE_X` rather than the current
recommended `ParamAngleX`, plus the model-specific blush parameter
`PARAM_TERE`. This is direct evidence that even common semantic controls cannot
be discovered by assuming one spelling convention.

Haru also supplies:

- eight expression files, each shaped as an additive recipe over a 17-parameter
  facial set (the meaningful non-zero subset varies by expression);
- twenty-three motion files lasting roughly 1.4 to 10 seconds, each containing
  curves for all 33 parameters and four arm-part opacities;
- physics whose inputs are head/body X and Z angles and whose outputs are front
  and back hair sway;
- pose groups that switch the two variants of each arm;
- model groups identifying both eye-open parameters for blinking and the mouth
  opening parameter for lip sync.

The repository currently uses `pixi-live2d-display` 0.4.0. Its high-level
surface includes expression, motion, motion priority, focus, tap, and per-frame
update controls; lower-level parameter access reaches the internal Cubism Core
model
([motion and expression guide](https://github.com/guansss/pixi-live2d-display/blob/master/docs/docs/motions_expressions.md),
[complete guide](https://github.com/guansss/pixi-live2d-display/wiki/Complete-Guide)).

## Implication for later design

The Live2D adapter should remain semantically dumb. Slice 013's affect contract
should terminate above it; a character-owned translation may then select a
small controllable subset of face, gaze, posture, and energy channels. Physics
outputs such as hair sway should ordinarily remain derived, and authored motion
clips should not be mistaken for continuous affect coordinates.
