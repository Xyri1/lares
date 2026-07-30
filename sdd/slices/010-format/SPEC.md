# Slice 010 — Format Compatibility · SPEC

**Artifact:** Slice SPEC · **Slice:** 010-format (post-M4/M5a follow-up) ·
**Status:** Open

**Why / gate.** Slice 007 delivered the first `lares/1` import,
calibration, and expression-authoring path. Slice 008 owns managed
copies, folder import, transactional switching, and the build-selected
default (D33). Those slices proved the workflow, but they did not bound
the Live2D runtime versions Lares honestly supports or exercise enough
of the VTube Studio model ecosystem.

Slice 010 hardens that existing path around VTS-style Cubism 3/4
assets, rejects Cubism 2.1 and Cubism 5 deliberately, and makes Haru
the intended bundled default after additive clearance.

Exit gate: using the existing import UI and dev check, a stranger
imports a non-bundled VTS-style Cubism 3/4 folder and receives the same
aggregate compatibility findings from both surfaces; registered and
loose expressions/motions play after restart; Cubism 2.1 and Cubism 5
fixtures are refused before revival; and a fresh cleared build loads
Haru through the generic path on Windows and macOS. Slice 007's
preview/save/update authoring smoke remains green but is not redesigned.

This slice refines root D19/D24/D25 and SPEC §5. It does not reopen or
renumber slices 007–009.

---

## 1. Scope

**In:** an explicit Cubism SDK 3.0–4.2 runtime boundary; pre-revival MOC
version probing; VTS-style resource discovery across registered and
loose assets; honest static/body capability reporting through the
existing validation callers; per-character performance bindings;
compatibility fixtures that cover sparse and irregular packages; Haru
as the cleared build default through D33; Hiyori retained as a
regression fixture; published compatibility and degradation guidance.

**Out (fence):** Cubism 2.1 (`.model.json`, `.moc`, `.mtn`,
`.exp.json`); Cubism 5 MOC version 5 or later; the Cubism 5 fork or an
official-SDK migration; MotionSync; ZIP extraction or remote download;
VTube Studio tracking, hotkeys, VFX, items, expression groups, or
persistent configuration; filename sentiment inference; a new import
system, settings surface, renderer, or authoring-acceptance workflow.

## 2. Supported source contract (010-D1/D2)

The existing D33/008-D3 import contract stands:

- a ready Lares package contains one `lar.character.json`;
- a raw extracted directory contains exactly one recursive
  `.model3.json`;
- zero or multiple model entry points are refused without guessing;
- the selected package root contains every imported resource.

The MOC version returned by Cubism Core is normative:

| Core value | Runtime target | Result |
|---|---|---|
| `MocVersion_30` (`1`) | SDK 3.0–3.2 | accept |
| `MocVersion_33` (`2`) | SDK 3.3 | accept |
| `MocVersion_40` (`3`) | SDK 4.0 | accept |
| `MocVersion_42` (`4`) | SDK 4.2 | accept |
| `MocVersion_50` (`5`) or later | SDK 5.x+ | reject |
| unknown or malformed | unknown | reject |

An Editor 5-authored model exported for SDK 4.2 remains accepted. The
`.moc3` suffix and model3 `"Version": 3` do not establish runtime
compatibility.

**VTS-compatible** means compatible with the model asset folder, not
with VTube Studio configuration. A generated `.vtube.json` is reported
as ignored metadata and never controls import or playback.

## 3. Resource graph and loose assets (010-D3/D4)

`FileReferences` remains authoritative for the MOC, textures, pose,
user data, display info, registered physics, and other required model
resources. Expression and motion discovery retains slice 007's rule:
union indexed files with a recursive scan for `*.exp3.json` and
`*.motion3.json`, dedupe by normalized package-relative path, and keep
identical basenames in different directories distinct.

The resolved runtime view is in memory; Lares never rewrites the
artist's model3 file.

- Exactly one unregistered `*.physics3.json` may be attached as the
  VTS single-file fallback; multiple unregistered files are ambiguous.
- `.pose3.json`, `.userdata3.json`, `.cdi3.json`, icons, and audio are
  optional capabilities.
- `.cmo3`, `.can3`, `.cmp3`, `.ctmp3`, and `.paramctrl3.json` are
  source/editor files and do not make a package runnable.
- Missing MOC or textures block the package. Missing optional behavior
  is a named degradation. Missing motion audio is a warning because
  animation playback does not depend on it.

Every discovered expression or motion remains callable under its
artist name with a null affect coordinate, as decided by 007-D2/D3.
Discovery never assigns emotional meaning. Calibration explicitly maps
the subset used by autonomous affect selection; clothing, hair,
accessory, and tracking customizations stay uncalibrated by default.

## 4. Compatibility report and runtime probe (010-D5/D6)

The existing shared validation report remains the single interface for
the dev import/check, app import, app load, and tests. Slice 010 adds:

- selected model entry point and detected MOC runtime version;
- required-resource findings and optional degradations;
- registered and loose expression/motion paths;
- physics, pose, user-data, display-info, hit-area, texture, and audio
  capabilities;
- body-reported parameter IDs, ranges, defaults, EyeBlink/LipSync
  groups, motion inventory, and texture limits;
- performance-binding gaps;
- all independent errors and warnings, not first-error-only output.

Inspection has two phases:

1. **Static/main:** entry point, JSON shape, containment and exact case,
   references, recursive catalog, and existing manifest validation.
2. **Runtime/body:** Core MOC version, load viability, parameters,
   groups, ranges, and render-only limits.

For the body phase, main exposes the already validated package root
through a revocable opaque `lares://characters/<root-id>/` mapping.
The body never receives an arbitrary local path. Main retains
containment and link checks; the probe model is disposed and the root
revoked when inspection ends.

The report enriches D33's transaction; it does not replace it. Import
still copies into managed storage and commits selection only after
validation plus successful body load.

## 5. Character-owned performance

`renderers.live2d.performance` uses the existing synth-preset shape:

```jsonc
{
  "params": [
    {
      "id": "PARAM_MOUTH_FORM",
      "source": "valence",
      "gain": 1,
      "offset": 0
    }
  ],
  "idle": {
    "breath": {
      "id": "PARAM_BREATH",
      "basePeriodMs": 4000,
      "amplitude": 1
    },
    "blink": {
      "ids": ["PARAM_EYE_L_OPEN", "PARAM_EYE_R_OPEN"],
      "baseIntervalMs": 3500,
      "durationMs": 160,
      "valenceGain": 0.15
    },
    "sway": {
      "id": "PARAM_BODY_ANGLE_X",
      "baseAmplitude": 6,
      "periodMs": 5000
    }
  }
}
```

Production uses the active character's mapping. Global `presets/`
remain dev-panel tuning overrides. Import may seed exact standard
Cubism IDs; it never guesses from display names or substrings. Custom
IDs appear as mapping gaps without making supplied expressions and
motions unplayable.

Cue targets retain slice 007's three exclusive forms:
`{ expression: "<package-relative path>" }`,
`{ motion: "<package-relative path>" }`, or
`{ params: { "<id>": <finite value> } }`.

## 6. Bundled Haru (010-D7)

Haru is a consumer of the generic path, not a loader exception:

- accepted as a Cubism 3 runtime by the same Core probe;
- loose expressions found by the same recursive catalog;
- supplied motions and Add-mode expressions played by the existing
  slice 007 path;
- uppercase legacy parameter IDs handled only by package performance
  data;
- empty hit-area metadata handled by the existing silhouette fallback;
- installed and selected through D33 like any build default.

Hiyori remains a non-default regression fixture for raw-parameter cues
and the older standard-ID family.

Before Haru ships, D19 must record the exact artifact, individual
terms, required notice, and treatment of voice files. If sound rights
remain unclear, `.wav` files do not ship and the curated package omits
their optional `Sound` references. This blocks Haru packaging, not the
generic compatibility work.

## 7. Validation and safety

Imported packages remain untrusted ingress (P7):

- paths are relative, normalized, contained, NUL-free, and exact-case;
- absolute paths, URL schemes, traversal, symlinks, junctions, and
  other reparse points are rejected;
- JSON numbers are finite and parameter values are checked against the
  body inventory;
- textures must fit the live renderer's `MAX_TEXTURE_SIZE`;
- one invalid optional asset does not hide independent valid assets;
- no imported content executes or performs network I/O.

## 8. Acceptance (GWT)

**A1 — Version boundary.** GIVEN valid MOC versions 1–4 WHEN imported
THEN they may continue to body load; GIVEN Cubism 2.1, version 5 or
later, unknown, or malformed input THEN it is refused before revival
with the SDK 3.0–4.2 support message.

**A2 — VTS discovery.** GIVEN indexed, loose, nested, overlapping, and
duplicate-basename expression/motion fixtures WHEN checked THEN the
normalized union is complete and stable; `.vtube.json` never changes
the result.

**A3 — Resource edges.** GIVEN registered physics, one unregistered
physics file, multiple unregistered physics files, sparse sidecars,
missing optional audio, and missing required textures WHEN checked
THEN supported, degraded, ambiguous, warning, and blocking outcomes are
reported honestly.

**A4 — Capability honesty.** GIVEN standard IDs, custom IDs, no hit
areas, empty motion groups, and oversized textures WHEN probed THEN the
report distinguishes render viability, supplied-asset playback,
automatic performance coverage, and hard device limits.

**A5 — Same report.** GIVEN the same package WHEN checked through the
dev command and app import THEN normalized findings match.

**A6 — Protocol containment.** GIVEN a valid inspected root WHEN the
body probe completes or fails THEN its opaque protocol mapping is
revoked and no probe model remains; traversal and link fixtures never
resolve.

**A7 — Existing workflow regression.** GIVEN an imported VTS-style
model WHEN an indexed expression, loose expression, loose motion,
preview, save, and update are exercised THEN slice 007 semantics remain
unchanged and persist after restart.

**A8 — Haru default.** GIVEN a cleared fresh build WHEN first launched
THEN Haru is seeded through D33, renders on both OSes, plays curated
cues, drives her legacy IDs, and no code branch checks her name.

**A9 — Stranger gate.** GIVEN only the published compatibility docs
and a non-bundled user-supplied VTS-style Cubism 3/4 folder WHEN a
person unfamiliar with the implementation imports it THEN it runs,
supplied assets play, degradation gaps are understandable, and the
same Lar returns after restart.

## 9. Research basis

- [VTube Studio: Getting Started](https://github.com/DenchiSoft/VTubeStudio/wiki/Getting-Started)
  defines the minimum model folder and permits animations and
  expressions in the root or subfolders.
- [VTube Studio Model File](https://github.com/DenchiSoft/VTubeStudio/wiki/Vtube-Studio-Model-File)
  identifies `.vtube.json` as generated VTS configuration with no
  documented format.
- [Live2D Haru sample](https://www.live2d.com/en/learn/sample/haru/)
  identifies Haru as an SDK 3.0 sample and lists her runtime assets.
- [Cubism Core API reference](https://docs.live2d.com/en/cubism-sdk-manual/cubism-core-api-reference/)
  makes Core the authority for `.moc3` compatibility and documents the
  MOC-version query.
