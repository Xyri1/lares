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
  "cueMappings": {
    "discovery": "surprised",
    "satisfaction": "wave"
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
- `expressions` maps performance names to `{ "valence", "arousal" }`. Valence
  is between `-1` and `1`; arousal is between `0` and `1`. Imported entries
  begin as a `null` entry and gain coordinates during calibration; `map_cue`
  refuses a performance whose coordinates are still `null`.
- `cueMappings` maps the six canonical cues (`discovery`, `uncertainty`,
  `concern`, `frustration`, `relief`, `satisfaction`) to performance names.
  The Calibrate Lar skill writes it through the daemon. Until all six are
  present, `emote` refuses cue playback. One performance may serve several
  cues.
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
   calibrated, and uncalibrated cue counts, plus the mapped and missing
   canonical cues. Fix reported paths or malformed expression files before
   loading the package.
4. Start Lares, select the character, then run the **Calibrate Lar** skill
   from your agent — `/lares:calibrate-lar` in Claude Code,
   `$lares:calibrate-lar` in Codex. Preview is visual: keep the character
   visible and make mapping choices with the person at the desktop.

## Calibration flow

The **Calibrate Lar** skill ships with both harness plugins. It is
user-invoked only and works entirely through the Lares MCP server — the
daemon is the only validator, and the skill never edits package files
directly:

1. `status` reads the active character and its missing canonical cues.
2. `list_performances` inventories the performances. Non-emotive ones
   (idle, physics, tap reactions) stay exactly as they are; nothing is
   deleted or renamed.
3. A clearly named performance gets affect coordinates from its name via
   `update_expression`; an opaque one (`f01`, `m_03`) is shown with
   `preview_expression` and the user says what it conveys. Then
   `map_cue({ cue, performance })` records the mapping.
4. If no performance fits a cue, the skill authors one as a last resort:
   `list_parameters`, `preview_expression({ params })`, and
   `save_expression` once the user accepts the visible result.
5. `status` again — the character is calibrated only when no canonical cue
   is missing.

Every `map_cue` and `save_expression` persists immediately, so an
interrupted run resumes from stored state. The user can also edit the
manifest by hand if an MCP client is unavailable; run `--check` afterward.

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

## Haru is the bundled default

Haru is the build-selected default and ships fully calibrated. Cues may
also drive raw parameters via `params` instead of referencing an
`.exp3.json` — the escape hatch for models that bundle no expression
files; third-party models commonly provide expressions and motions for
import.
