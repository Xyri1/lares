# Live2D model file formats

Research for reading VTube-Studio-compatible Cubism 3/4 models, 2026-07-30.
Sources are first-party: the Live2D CubismSpecs repository, Live2D manuals,
and the VTube Studio wiki/repository. Folder/distribution shapes and
loose-vs-indexed discovery are covered separately in
[live2d-model-distribution.md](live2d-model-distribution.md); this file
covers what each file *is* and what is inside it. Structures illustrated from
the bundled samples (Haru — a Live2D sample; IceGirl — a VTS-configured
model) are marked as observations, not spec.

## .moc3 — binary model

The Model Workspace of Cubism Editor "will ultimately export the file in
.moc3 format. .moc3 is the Live2D model data used in the program"
([Live2D file types](https://docs.live2d.com/en/cubism-editor-manual/file-type-and-extension/)).
It carries the actual mesh/deformer/parameter data; VTube Studio describes it
as "Model binary file. Has all model data, such as vertices, deformers,
parameters, etc."
([VTS model loading](https://github.com/DenchiSoft/VTubeStudio/wiki/Loading-your-own-Models)).
Written only by Cubism Editor; required at runtime (`FileReferences.Moc` is a
required field of the model3.json —
[model3.json spec](https://github.com/Live2D/CubismSpecs/blob/master/FileFormats/model3.json.md)).

Live2D does **not** publish the moc3 binary layout. The official interface is
the Cubism Core C API: `csmGetMocVersion(address, size)` returns the file
format version, `csmGetLatestMocVersion()` the newest version the linked Core
can load, and `csmHasMocConsistency` validates a file; buffers must be loaded
at `csmAlignofMoc` alignment
([Core API reference](https://docs.live2d.com/en/cubism-sdk-manual/cubism-core-api-reference/)).
The reference PDF defines the version enum with exact values and Editor
version ranges
([Native Core API Reference r15 PDF](https://cubism.live2d.com/sdk-doc/reference/NativeCoreAPIReference_en_r15.pdf)):

| constant | value | produced by moc3 file version |
| - | - | - |
| `csmMocVersion_Unknown` | 0 | not a moc3 file |
| `csmMocVersion_30` | 1 | 3.0.00 – 3.2.07 |
| `csmMocVersion_33` | 2 | 3.3.00 – 3.3.03 |
| `csmMocVersion_40` | 3 | 4.0.00 – 4.1.05 |
| `csmMocVersion_42` | 4 | 4.2.00 – 4.2.02 |
| `csmMocVersion_50` | 5 | 5.0.00 – |

The same PDF warns that Editor upgrades may emit values above those defined.
A Cubism 4 Core rejecting a Cubism 5 file logs "The Core unsupport later than
moc3 ver:[4]. This moc3 ver is [5]", confirming the 4.2→4 / 5.0→5 numbering
([Cubism 5 SDK compatibility](https://docs.live2d.com/en/cubism-sdk-manual/compatibility-with-cubism-5/)).
VTube Studio accepts exports made with "Export Version" set to "SDK 3.0",
"SDK 3.3", "SDK 4.0", "SDK 5.0" or newer
([VTS model loading](https://github.com/DenchiSoft/VTubeStudio/wiki/Loading-your-own-Models)).

Observed in the bundled samples (not spec — the layout is unpublished): the
file begins with ASCII `MOC3`, and the byte at offset 4 matches the
`csmMocVersion` value — `0x03` for Haru and Hiyori (4.0-era exports), `0x04`
for IceGirl (4.2-era export).

## .model3.json — settings/index

Exported by Cubism Editor alongside the moc3; it is one of the three files
exported by default (moc3, model3.json, textures)
([embedded-data export](https://docs.live2d.com/en/cubism-editor-manual/export-moc3-motion3-files/)).
Per the spec
([model3.json spec](https://github.com/Live2D/CubismSpecs/blob/master/FileFormats/model3.json.md)):

- Required top-level: `Version` (number, 3 in current files) and
  `FileReferences`. Optional: `Groups`, `HitAreas`, `Layout`.
- `FileReferences` — required: `Moc` (string), `Textures` (array of strings);
  optional: `Physics`, `Pose`, `DisplayInfo` (cdi3), `UserData`,
  `Expressions` (array of `{Name, File}`), `Motions` (object mapping group
  names to arrays of `{File, FadeInTime?, FadeOutTime?, Sound?, MotionSync?}`),
  and `MotionSync`. All paths are relative to the model3.json.
- `Groups`: array of `{Target: "Parameter", Name, Ids}`; the reserved names
  `EyeBlink` and `LipSync` designate the eye-blink and mouth-open parameter
  sets.
- `HitAreas`: array of `{Name, Id}` collision zones.

Observed in the bundled Haru sample: `Groups` maps `LipSync` to
`PARAM_MOUTH_OPEN_Y` and `EyeBlink` to `PARAM_EYE_L_OPEN`/`PARAM_EYE_R_OPEN`;
`Motions` groups (`Idle`, `Tap`, `Flick`, …) include entries with `Sound`
pointing at `sounds/*.wav`. VTube Studio treats the model3.json as the "Main
Live2D model index file … has references to all other files" and requires it
([VTS model loading](https://github.com/DenchiSoft/VTubeStudio/wiki/Loading-your-own-Models)) —
but note it does *not* require expressions/motions to be indexed (see the
distribution doc); observed in the local IceGirl sample, the model3.json
lists no `Expressions` or `Motions` at all while 19 exp3 and 3 motion3 files
sit loose beside it.

## .exp3.json — expressions

Per the spec
([exp3.json spec](https://github.com/Live2D/CubismSpecs/blob/master/FileFormats/exp3.json.md)):

- Required: `Type` — exactly `"Live2D Expression"` — and `Parameters`.
  Optional: `FadeInTime`, `FadeOutTime` (seconds, ≥ 0).
- Each `Parameters` entry: required `Id` (parameter id) and `Value` (number);
  optional `Blend` ∈ `Add` | `Multiply` | `Overwrite`. For `Add` the stored
  `Value` is the setting value minus the parameter's default value (a delta);
  `Multiply` and `Overwrite` store the setting value directly. The spec does
  not state a default for an omitted `Blend`.

Writers: historically Cubism Viewer (for OW) converts Animation-Workspace
facial motions to exp3
([Live2D file types](https://docs.live2d.com/en/cubism-editor-manual/file-type-and-extension/));
VTube Studio's built-in editor also writes them — "Saving a new expression
will create an .exp3.json file in your model's directory", reusing an
existing expressions subfolder if one exists — and discovers any exp3 in the
model folder or a subfolder. VTS documents its three modes as "Overwrite:
Default mode. Just sets the parameter to the set value", "Add: Adds the set
value to the parameter", "Multiply: Multiplies the parameter with the set
value", and resolves conflicts by "the value of the last activated hotkey"
([VTS expressions](https://github.com/DenchiSoft/VTubeStudio/wiki/Expressions-%28a.k.a.-Stickers-or-Emotes%29)).
Optional at runtime. Observed in the local IceGirl sample: VTS-era exp3 files
use `Blend: "Add"` throughout, with user-chosen Chinese filenames (生气
"angry", 惊讶 "surprised") as the only human label — the format itself has no
display-name field.

## .motion3.json — motions

Exported by Cubism Editor's Animation Workspace ("Export for Runtime → Export
motion file",
[VTS animations](https://github.com/DenchiSoft/VTubeStudio/wiki/Animations)).
Optional at runtime. Per the spec
([motion3.json spec](https://github.com/Live2D/CubismSpecs/blob/master/FileFormats/motion3.json.md)):

- `Version` (number, 3) and `Meta` — required `Duration` (s), `Fps`,
  `CurveCount`, `TotalSegmentCount`, `TotalPointCount`; optional `Loop`,
  `AreBeziersRestricted`, `FadeInTime`, `FadeOutTime`, `UserDataCount`,
  `TotalUserDataSize`.
- `Curves`: each has `Target`, `Id`, `Segments`, optional per-curve
  `FadeInTime`/`FadeOutTime`. `Target` is one of `"Model"` ("Track targets
  model"), `"Parameter"` ("the track ID then is the parameter ID"), or
  `"PartOpacity"` ("the track ID then is the parts ID"). For `Model` the Id
  is one of `Opacity` ("Opacity track applying to the model as a whole"),
  `EyeBlink` ("Eye track"), or `LipSync` ("Mouth opening track").
- `Segments` is a flattened array: the first point `(t, value)`, then repeated
  [identifier, point(s)] runs. Identifiers: `0` linear, `1` cubic bézier, `2`
  stepped, `3` inverse-stepped; "a segment identifier is followed by 1 point
  in case of linear, stepped, and inverse stepped segments … or 3 point in
  case of bézier segments, that represent P1, P2, P3".
- Optional `UserData`: array of `{Time (s), Value (string)}` timeline events.

Sound is *not* part of motion3.json — audio is attached per-motion via the
model3.json `Sound` field
([model3.json spec](https://github.com/Live2D/CubismSpecs/blob/master/FileFormats/model3.json.md)).
VTube Studio reads motion3 files from the model folder or a subfolder and
uses them "as looping background idle animation or one-shot animation"; it
can also record new ones from tracking (its "Record Animation" feature)
([VTS animations](https://github.com/DenchiSoft/VTubeStudio/wiki/Animations)).
Observed in the bundled Haru sample: idle motions carry `Parameter` and
`PartOpacity` curves only (no `Model` target), `Meta.Loop: true`.

## .cdi3.json — display info

Optional Editor export that "contains information for parameters and part
names and linkage information for parameters"
([embedded-data export](https://docs.live2d.com/en/cubism-editor-manual/export-moc3-motion3-files/)).
Per the spec
([cdi3.json spec](https://github.com/Live2D/CubismSpecs/blob/master/FileFormats/cdi3.json.md)):
required `Version`, `ParameterGroups`, `Parts`; optional `Parameters` and
`CombinedParameters` (pairs of parameter ids). Parameter and ParameterGroup
entries are `{Id, GroupId, Name}` — `GroupId` points at the parent group
(empty string = no parent) — and Part entries are `{Id, Name}`. The `Name`
fields are the human display names shown in the Editor. VTube Studio ignores
it: "Model display information file. Not needed by VTube Studio"
([VTS model loading](https://github.com/DenchiSoft/VTubeStudio/wiki/Loading-your-own-Models)).
Observed in the bundled Haru sample the names are the author's locale
(`PARAM_ANGLE_X` → "角度 X").

## .physics3.json — physics

Optional Editor export containing "the set values for physical operations"
([embedded-data export](https://docs.live2d.com/en/cubism-editor-manual/export-moc3-motion3-files/)).
Per the spec
([physics3.json spec](https://github.com/Live2D/CubismSpecs/blob/master/FileFormats/physics3.json.md)):

- Required top-level: `Version`, `Meta`, `PhysicsSettings`.
- `Meta`: `PhysicsSettingCount`, `TotalInputCount`, `TotalOutputCount`,
  `VertexCount`, `EffectiveForces` (`Gravity`/`Wind` 2-D vectors),
  `PhysicsDictionary` (Id→Name pairs); optional `Fps`.
- Each `PhysicsSettings` entry: `Id`; `Input` array of `{Source {Target,
  Id}, Weight, Type, Reflect}`; `Output` array of `{Destination, VertexIndex,
  Scale, Weight, Type, Reflect}`; `Vertices` (pendulum points `{Position
  {X,Y}, Mobility, Delay, Acceleration, Radius}`); `Normalization`
  (`Position`/`Angle` each `{Minimum, Default, Maximum}`). `Type` is `X`,
  `Y`, or `Angle`.

Cubism-optional, but VTube Studio lists `<model>.physics3.json` among the
files a model folder should contain and stresses exporting it together with
the model so it is "'registered' with the model (in the .model3.json file)"
([VTS model loading](https://github.com/DenchiSoft/VTubeStudio/wiki/Loading-your-own-Models)).
VTS scales the effect (strength/wind boosts) from its own per-model config,
not by editing this file
([VTS model settings](https://github.com/DenchiSoft/VTubeStudio/wiki/VTS-Model-Settings)).

## .pose3.json — part switching

Written by Cubism Viewer (for OW); it "reflects arm switching mechanisms"
([Live2D file types](https://docs.live2d.com/en/cubism-editor-manual/file-type-and-extension/)).
Per the spec
([pose3.json spec](https://github.com/Live2D/CubismSpecs/blob/master/FileFormats/pose3.json.md)):
required `Type` — exactly `"Live2D Pose"` — and `Groups`; optional
`FadeInTime` (seconds). `Groups` is an array of arrays of `{Id, Link?}`
nodes; within a group "only one node is displayed" (exclusive part
switching), `Id` names the part whose opacity is driven, and `Link` is "a
list of parts IDs that manipulates the opacity of parts in cooperation with
Id". Optional at runtime; referenced from `FileReferences.Pose`. Observed in
the bundled Haru sample: two groups switching right/left arm variants.

## .userdata3.json — mesh-attached user data

Optional Editor export of "the setting values of user data"
([embedded-data export](https://docs.live2d.com/en/cubism-editor-manual/export-moc3-motion3-files/)).
Per the spec
([userdata3.json spec](https://github.com/Live2D/CubismSpecs/blob/master/FileFormats/userdata3.json.md)):
required `Version`, `Meta` (`UserDataCount`, `TotalUserDataSize`), and
`UserData` — an array of `{Target, Id, Value}` where the only defined
`Target` is `"ArtMesh"` and `Id` is the ArtMesh identifier. Free-form string
payloads attached to meshes; no local sample contains one.

## Texture folders

The contract is the `FileReferences.Textures` array of relative PNG paths
([model3.json spec](https://github.com/Live2D/CubismSpecs/blob/master/FileFormats/model3.json.md));
"the image set in the texture atlas is exported" with the model
([embedded-data export](https://docs.live2d.com/en/cubism-editor-manual/export-moc3-motion3-files/)).
The conventional shape is a `<model>.<resolution>` folder — VTube Studio
documents it as "`<model>.<resolution>` (e.g. `akari.4096`) — contains your
texture(s)" and "supports models with multiple and/or large textures"
([VTS model loading](https://github.com/DenchiSoft/VTubeStudio/wiki/Loading-your-own-Models)).
Observed locally: `haru.1024/texture_00.png…texture_02.png`, `Hiyori.2048/`,
`IceGirl.8192/` — but readers should trust the `Textures` array, not the
folder-name convention.

## .cmo3 / .can3 — authoring projects (not runtime)

`.cmo3` is the Model Workspace project format and `.can3` the Animation
Workspace project format; related authoring-side formats are `.cmp3`
(exported parts), `.ctmp3` (animation templates), and `.paramctrl3.json`
(parameter controller data)
([Live2D file types](https://docs.live2d.com/en/cubism-editor-manual/file-type-and-extension/)).
Only Cubism Editor reads/writes them; no runtime (and not VTube Studio) loads
them. Creator bundles often ship them beside the runtime export — the
bundled Haru folder carries `haru_t01.cmo3` and three `.can3` files above its
`runtime/` directory.

## .vtube.json — VTube Studio model config

"VTube Studio saves all model-related configuration data in a file right next
to your Live2D model. The file is called
`<Your-Live2D-Model-Name>.vtube.json`" — generated automatically when VTS
first scans a model, "fully human-readable, not encrypted", JSON, with a
warning that manual edits "may result in broken files"; VTS also snapshots
modified models every 5 minutes into a `Backups` folder next to
`Live2DModels`
([VTS model file](https://github.com/DenchiSoft/VTubeStudio/wiki/VTube-Studio-Model-File)).
It is app-private config, not part of the Cubism contract, and holds the
model's display name/icon, idle animation choice, movement config, physics
boost/wind settings, and the tracking-input → Live2D-parameter mappings
([VTS model settings](https://github.com/DenchiSoft/VTubeStudio/wiki/VTS-Model-Settings)).
The wiki does not publish a schema; observed in the local IceGirl sample
(written by VTS 1.25.0), the top level is:

- `Version`, `Name`, `ModelID` (GUID), `ModelSaveMetadata` (app version,
  platform, timestamps)
- `FileReferences`: `Icon`, `Model` (the model3.json), `IdleAnimation`
  (a motion3 filename), `IdleAnimationWhenTrackingLost`
- `SavedModelPosition`, `ModelPositionMovement`, `ItemSettings`
- `PhysicsSettings`: `Use`, `UseLegacyPhysics`, `Live2DPhysicsFPS`,
  `PhysicsStrength`, `WindStrength`, `DraggingPhysicsStrength`
- `ParameterSettings`: array of `{Name, Input, InputRangeLower/Upper,
  OutputRangeLower/Upper, ClampInput, ClampOutput, UseBlinking,
  UseBreathing, OutputLive2D, Smoothing}` — e.g. `FaceAngleX` →
  `ParamAngleX`
- `Hotkeys`: array of `{HotkeyID, Name, Action, File, …}` — observed
  `Action` values `ToggleExpression` (with `File` naming an exp3) and
  `TriggerAnimation` (with `File` naming a motion3)
- `HotkeySettings`, `ArtMeshDetails`, `ParameterCustomization`,
  `PhysicsCustomizationSettings`, `FolderInfo`, `SavedActiveExpressions`

The full set of hotkey actions is public in the VTS API repository:
`TriggerAnimation = 0`, `ChangeIdleAnimation = 1`, `ToggleExpression = 2`,
`RemoveAllExpressions = 3`, plus model/scene/item actions
([VTS HotkeyAction enum](https://github.com/DenchiSoft/VTubeStudio/blob/master/Files/HotkeyAction.cs)).

## Other VTS sidecar files

- **Model icon** — VTS recommends "a model icon into that folder (any
  filename, .png or .jpg, recommended 512x512 pixels)"; selected per model in
  the config UI and recorded in the vtube.json `FileReferences.Icon`
  ([VTS model loading](https://github.com/DenchiSoft/VTubeStudio/wiki/Loading-your-own-Models),
  [VTS model settings](https://github.com/DenchiSoft/VTubeStudio/wiki/VTS-Model-Settings)).
  Observed: `icon.jpg` in the IceGirl folder.
- **Items** — live in an "Items folder next to your Live2DModels folder",
  as PNGs/JPGs, GIFs, or folders of PNG frames (animated items); Live2D
  models can themselves be items; items pin "to the uppermost ArtMesh" when
  dropped on a model
  ([VTS item system](https://github.com/DenchiSoft/VTubeStudio/wiki/Item-System)).
  No `.vtsitem` file format is documented on the wiki pages reviewed.
- **`items_pinned_to_model.json`** — observed in the local IceGirl model
  folder (written by VTS 1.25.0 per its `FileMetadata`): `{FileMetadata,
  SceneName, SceneGroupName, SceneModel, SceneID, Items[]}`, evidently the
  per-model saved item scene. Not documented on the wiki pages reviewed
  ([item scenes](https://github.com/DenchiSoft/VTubeStudio/wiki/Item-Scenes-and-Item-Hotkeys)
  describes the feature but not its storage) — treat the name and shape as
  unconfirmed beyond this observation.
- **Backgrounds** — user-supplied `.jpg`/`.png`/`.mp4`/`.webm` files in a
  backgrounds folder (location shown only as a screenshot in the wiki), not
  in the model folder
  ([VTS backgrounds](https://github.com/DenchiSoft/VTubeStudio/wiki/Loading-your-own-Backgrounds)).
- **Sounds** — Cubism attaches audio per motion via the model3.json `Sound`
  field (observed: Haru's `sounds/*.wav`); no VTS-specific sound file format
  in the model folder is documented on the pages reviewed.

## Affect-relevant signals

- **exp3 is the emote unit, but values may be deltas.** `Blend: "Add"`
  entries store setting-minus-default values
  ([exp3.json spec](https://github.com/Live2D/CubismSpecs/blob/master/FileFormats/exp3.json.md));
  interpreting an Add expression absolutely requires the model's parameter
  defaults (which live in the moc3, readable only through the Core API).
  VTS defaults to Overwrite and lets the last activated hotkey win conflicts
  ([VTS expressions](https://github.com/DenchiSoft/VTubeStudio/wiki/Expressions-%28a.k.a.-Stickers-or-Emotes%29)).
- **exp3 has no display-name field** — `Type`, `Parameters`, fade times only
  ([exp3.json spec](https://github.com/Live2D/CubismSpecs/blob/master/FileFormats/exp3.json.md)).
  The filename (or the model3.json `Expressions[].Name` when indexed) is the
  only label, and in VTS-authored models it is user-chosen free text in any
  language (observed in the IceGirl sample).
- **motion3 curve targets separate expressive channels**: `Model`-target
  curves are limited to `Opacity`, `EyeBlink`, `LipSync`; everything facial
  or postural is a `Parameter` curve and costume/limb switching is
  `PartOpacity`
  ([motion3.json spec](https://github.com/Live2D/CubismSpecs/blob/master/FileFormats/motion3.json.md)).
- **model3.json `Groups` names the blink and lip-sync parameter ids**
  (`EyeBlink`/`LipSync`), i.e. which parameters a runtime may freely
  override without fighting emotive motion
  ([model3.json spec](https://github.com/Live2D/CubismSpecs/blob/master/FileFormats/model3.json.md)).
- **cdi3 is the human-readable dictionary**: `Parameters[].Name` /
  `Parts[].Name` label otherwise opaque ids, though in the author's locale
  ([cdi3.json spec](https://github.com/Live2D/CubismSpecs/blob/master/FileFormats/cdi3.json.md));
  VTS ignores the file, so its presence is common but not guaranteed.
- **vtube.json is the strongest emotive-binding signal in VTS models**:
  `Hotkeys[]` entries with `Action: "ToggleExpression"` point `File` at
  exactly the exp3 files the creator wired as emotes, and
  `FileReferences.IdleAnimation` names the neutral baseline motion (observed
  in the IceGirl sample; action names confirmed by the
  [VTS HotkeyAction enum](https://github.com/DenchiSoft/VTubeStudio/blob/master/Files/HotkeyAction.cs)).
  It is app-private and undocumented, so read defensively.
