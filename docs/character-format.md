# Character package format

A Lar is a directory under `characters/<name>/`. Its runtime model files stay
in `runtime/`; `lar.character.json` is Lares's small mapping layer. It names
the model and maps artist-supplied expressions or motions (plus any expression
you author) to affect coordinates. Lares never modifies the artist's model
files or model index.

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
  "expressions": {
    "surprised": { "valence": -0.1, "arousal": 0.85 },
    "wave": { "valence": 0.45, "arousal": 0.6 },
    "weary": { "valence": -0.35, "arousal": 0.15 },
    "neutral": { "valence": 0.1, "arousal": 0.25 }
  },
  "renderers": {
    "live2d": {
      "model": "runtime/Example.model3.json",
      "cues": {
        "surprised": { "expression": "runtime/expressions/驚き.exp3.json" },
        "wave": { "motion": "runtime/motions/wave.motion3.json" },
        "weary": { "expression": "authored/weary.exp3.json" },
        "neutral": { "params": { "ParamMouthForm": 0, "ParamEyeLOpen": 1 } }
      }
    }
  }
}
```

- `identity.name` and `identity.license` are required. Keep the model's
  required notice in `license`.
- `renderers.live2d.model` is a package-relative path to the `.model3.json`.
- A cue has exactly one source: `expression` (a package-relative `.exp3.json`
  path), `motion` (a package-relative `.motion3.json` path), or `params` (a
  map of parameter IDs to numeric values).
- `expressions` maps cue names to `{ "valence", "arousal" }`. Valence is
  between `-1` and `1`; arousal is between `0` and `1`. Imported cues begin
  as a `null` entry: they can be played directly, but the autonomous
  affect selector ignores them until mapped.
- Author new expressions under `authored/<name>.exp3.json` and reference them
  as an `expression` cue. Do not overwrite bundled files.
- `renderers.live2d.performance` may contain the same `params` and `idle`
  mapping shape as `presets/default.json`. Production uses the active
  character's mapping; presets remain dev-panel overrides.

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
by using their relative paths as cue names. One loose `.physics3.json` is a
fallback; multiple loose physics files are ambiguous. Missing MOC or textures
blocks import. Missing pose, user data, display info, hit areas, or motion
audio is reported as a named degradation or warning.

The JSON report printed by `--check` includes the selected entry point,
required and optional resources, registered and loose assets, ignored VTS
metadata, performance IDs, all errors, warnings, and degradations. Runtime
load adds the Core MOC version, parameter/group inventory, motion groups, and
the renderer texture limit and probed texture dimensions.

## Import and map a model

1. Create `characters/<name>/runtime/` and put the complete model directory
   there, including its `.model3.json`, textures, expressions, and motions.
2. From the repository root, import the package:

   ```sh
   pnpm run import -- characters/<name>
   ```

   Import scans `runtime/` recursively for `.exp3.json` and `.motion3.json`.
   It also reads model-index entries when present, then writes
   `lar.character.json` with one null-coordinate cue per discovered file.
   Names, including CJK names, are preserved verbatim.
3. Review without writing changes at any time:

   ```sh
   pnpm run import -- --check characters/<name>
   ```

   The check mode names broken files and shows bundled, motion, authored,
   calibrated, and uncalibrated cue counts. Fix reported paths or malformed
   expression files before loading the package.
4. Start Lares, then use an MCP-capable agent to preview and map the imported
   cues. Preview is visual: keep the character visible and make mapping choices
   with the person at the desktop.

## Copyable mapping flow

Give this prompt to the agent after the character is loaded:

```text
You are mapping the active Lares character's expression cues with the user
watching the desktop. First call list_cues and list_parameters. For each
uncalibrated cue, preview it with preview_expression({ cue: "<cue name>" }).
Ask the user what emotion it visibly conveys before writing anything. Discard
non-emotive cues such as outfit, accessory, or toggle controls rather than
forcing them onto the affect map. After the user confirms a discard, remove
that cue's key from both `expressions` and `renderers.live2d.cues` in the
manifest; never delete or rename the artist's asset. If the user wants a
clearer cue name, rename the key in both blocks while leaving its referenced
path unchanged. For each accepted cue, propose valence
[-1, 1] and arousal [0, 1], ask for confirmation, then call
update_expression({ name: "<cue name>", affect: { valence, arousal } }).

If the set lacks a useful emotion, use list_parameters, preview_expression
with a small parameter map, ask the user to accept the visible result, then
call save_expression({ name, params, affect }) once to create it. Do not save
until the user accepts it. Never overwrite a bundled cue; choose a new name.
Use preview_expression({}) to revert an expression preview when done. A motion
preview plays once, so observe it rather than expecting it to hold.
```

Acceptance is conversational: preview, ask, then save or update. The user can
also edit the manifest by hand if an MCP client is unavailable; run `--check`
afterward.

## Worked synthetic example

After importing a fictional model, its manifest may contain an artist
expression (`驚き`), an artist motion (`wave`), and an authored gap (`weary`):

```json
{
  "expressions": {
    "驚き": { "valence": -0.1, "arousal": 0.85 },
    "wave": { "valence": 0.45, "arousal": 0.6 },
    "weary": { "valence": -0.35, "arousal": 0.15 }
  },
  "renderers": {
    "live2d": {
      "cues": {
        "驚き": { "expression": "runtime/expressions/驚き.exp3.json" },
        "wave": { "motion": "runtime/motions/wave.motion3.json" },
        "weary": { "expression": "authored/weary.exp3.json" }
      }
    }
  }
}
```

This is illustrative data after mapping. Immediately after import, each
coordinate entry is `null` until it is mapped with the visible model.

## Hiyori is a regression fixture

The retained Hiyori package is a raw-parameter reference: it has no bundled
`.exp3.json` expressions. Its cues use `params` directly, so it demonstrates
the escape hatch but is not the build-selected default or a representative
import example. Haru is the selected default; third-party models commonly
provide expressions and motions for import.
