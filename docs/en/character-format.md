# Character package format

A Lar is a directory under `characters/<name>/`. Its runtime model files stay
in `runtime/`; `lar.character.json` is Lares's small mapping layer. It names
the model and wires the character's own rig parameters to Lares's
renderer-neutral performance channels. Lares never modifies the artist's
model files or model index.

## Manifest

`lar.character.json` uses the `lares/1` format:

```json
{
  "format": "lares/1",
  "identity": {
    "name": "Example Lar",
    "author": "Model author; Lares package by you",
    "license": "The model's applicable license notice"
  },
  "anchors": {
    "neutral": { "eyeOpen": 0.2 },
    "+++": { "mouthCurve": 1, "browRaise": 0.6 },
    "---": { "mouthCurve": -1, "browRaise": -0.6, "gazeHeight": -0.5 }
  },
  "operational": {
    "awaiting_input": { "browRaise": 0.5, "gazeHeight": 0.8 },
    "error": { "browKnit": 0.7, "mouthCurve": -0.4 }
  },
  "renderers": {
    "live2d": {
      "model": "runtime/Example.model3.json",
      "performance": {
        "params": [
          { "id": "ParamMouthForm", "source": "mouthCurve", "gain": 1, "offset": 0 },
          { "id": "ParamBrowLY", "source": "browRaise", "gain": 0.8, "offset": 0 }
        ],
        "idle": {
          "breath": { "id": "ParamBreath", "basePeriodMs": 4000, "amplitude": 1 },
          "blink": { "ids": ["ParamEyeLOpen", "ParamEyeROpen"], "baseIntervalMs": 3500, "durationMs": 160 },
          "sway": { "id": "ParamBodyAngleX", "baseAmplitude": 6, "periodMs": 5000 }
        }
      }
    }
  }
}
```

- `identity.name` and `identity.license` are required. Keep the model's
  required notice in `license`.
- `renderers.live2d.model` is a package-relative path to the `.model3.json`.
- `anchors` is optional. It overrides any subset of the nine authored poses —
  `neutral` plus the eight cube corners, sign-ordered
  (valence, activation, control): `+++`, `++-`, `+-+`, `+--`, `-++`, `-+-`,
  `--+`, `---`. Each key holds a partial object of channel values in
  `[-1, 1]`. A channel a package does not specify falls back to the shipped
  default anchor. A package with no `anchors` block performs the shipped
  defaults entirely.
- `operational` is optional, same merge rule, for the two states that
  present visually: `awaiting_input` and `error`.
- The twelve performance channels are `mouthCurve`, `mouthOpen`, `browRaise`,
  `browKnit`, `eyeOpen`, `gazeHeight`, `headPitch`, `lean`, `swayAmplitude`,
  `breathRate`, `breathDepth`, `blinkRate`. They name observable body
  behavior, never rig parameters directly.
- `renderers.live2d.performance.params[]` wires one rig parameter to one
  channel: `id` (the Live2D parameter), `source` (a channel name), `gain`,
  and `offset`. `idle` scales the breath, blink, and sway writers by their
  matching channels. A package with no `performance` block uses the shipped
  default wiring — the same standard Cubism parameter IDs, re-sourced to
  channels — so a standard-named import performs correctly with zero
  calibration; an oddly-named rig binds nothing on those parameters and
  needs hand-authored wiring.
- `expressions`, `cueMappings`, and `renderers.live2d.cues` are retired from
  the format. A manifest may still carry them as inert JSON — Lares gives
  them no dedicated handling and no backward compatibility.

## Compatibility boundary

Lares supports VTube Studio-style model asset folders, not VTube Studio
configuration, tracking, hotkeys, items, or VFX. `.vtube.json` is reported
and ignored.

Cubism Core decides compatibility from the MOC itself:

| Core MOC value | Runtime | Result |
| --- | --- | --- |
| 1 | SDK 3.0–3.2 | supported |
| 2 | SDK 3.3 | supported |
| 3 | SDK 4.0 | supported |
| 4 | SDK 4.2 | supported |
| 5 or later | SDK 5.x+ | refused |
| unknown or malformed | unknown | refused |

The `.moc3` extension and model JSON `Version` do not prove compatibility.
The app probes Core before pixi revives the model.

`FileReferences` owns the MOC, textures, and registered sidecars. Import also
scans recursively for loose `.exp3.json` and `.motion3.json` files, dedupes
by normalized package-relative path, and keeps duplicate basenames distinct
by using their full relative paths. One loose `.physics3.json` is a
fallback; multiple loose physics files are ambiguous. Missing MOC or textures
blocks import. Missing pose, user data, display info, hit areas, or motion
audio is reported as a named degradation or warning.

The JSON report printed by `--check` includes the selected entry point,
required and optional resources, registered and loose assets, ignored VTS
metadata, performance parameter IDs, all errors, warnings, and degradations.
Runtime load adds the Core MOC version, parameter/group inventory, motion
groups, and the renderer texture limit and probed texture dimensions.

## Import a model

1. Create `characters/<name>/runtime/` and put the complete model directory
   there, including its `.model3.json`, textures, expressions, and motions.
2. From the repository root, import the package:

   ```sh
   pnpm run import -- characters/<name>
   ```

   Import finds the package's one `.model3.json` and writes a minimal
   `lar.character.json` naming it. It refuses a tree with zero or with more
   than one model file, because a guess would be wrong.
3. Review without writing changes at any time:

   ```sh
   pnpm run import -- --check characters/<name>
   ```

   The check mode names broken files and shows the full resource catalog —
   registered and loose expressions, motions, and physics — independent of
   any wiring. Fix reported paths or malformed expression files before
   loading the package.
4. Start Lares and select the character. It performs the shipped default
   anchors and wiring immediately, with zero calibration required.

## Hand-author anchors and wiring

An in-app calibration workflow — preview poses and wiring from your agent —
is planned but not yet built. Until it exists, matching a character's own
expressions more closely means hand-editing `anchors` and
`renderers.live2d.performance` in its manifest against the channel list
above, then re-running `--check` to validate. `list_parameters` and
`preview_expression` on the Lares MCP server let an agent inspect the live
model's parameters and hold an exact params set on screen while you look,
but neither writes the manifest — the file stays yours to edit.

## Haru is the bundled default

Haru is the build-selected default and ships with wiring for its own rig
parameters, re-sourced to the twelve performance channels — no calibration
step required. A character with no `performance` block instead falls back to
the shipped standard-id wiring; either way, `renderers.live2d.performance`
is optional, never required for a package to load.
