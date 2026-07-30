# Slice 010 — Format Compatibility · PLAN

Execution notes; disposable after the compatibility gate closes. This
is additive work on slices 007/008, not a replacement importer.

---

## 1. Settle opening gates

Confirm 010-D5 (shared report enrichment) and D6 (body-side Core probe
through a revocable protocol root).

Append Haru's exact artifact, individual terms, notice, and sound-data
decision to `sdd/clearances/M0-clearances.md`. Update D19 from
clearance-open only after that read. Generic compatibility work does
not wait for Haru packaging.

## 2. Extend the existing report

Build on `characters/manifest.ts`, `import.ts`, `library.ts`, and the
character load broker. Do not introduce a second importer or public
runtime abstraction.

Add aggregate fields for:

- MOC runtime version;
- required and optional resources;
- registered/loose expression and motion catalog;
- physics/pose/user-data/display-info/hit-area/audio capabilities;
- body inventory, groups, ranges, motion inventory, and texture limit;
- performance-binding gaps and explicit degradations.

Keep existing callers: dev import/check, app import, app load, and
tests.

## 3. Add the runtime gate safely

Before revival, resolve the MOC through the controlled asset protocol
and call the bundled Core version API. Accept values 1–4 and refuse 5+,
unknown, and malformed input with one clear compatibility message.

Generalize the existing `lares://characters/` root registry only as
needed for a revocable inspection ID. Dispose the probe model and
release the root in `finally`. Test traversal, link/reparse-point, and
post-probe revocation.

## 4. Close resource-discovery edges

Retain slice 007's indexed-plus-recursive expression/motion union and
brain-side exp3 path. Add only missing compatibility behavior:

- canonical relative-path identity and duplicate basenames;
- exactly-one unregistered physics fallback;
- optional sidecar and audio degradations;
- exact-case validation across Windows/macOS;
- device texture-limit reporting.

Do not patch model3 or build an expression registry inside pixi.

## 5. Make performance character-owned

Load `renderers.live2d.performance` using the current `SynthPreset`
shape. Production follows the active package; global presets remain
dev-panel overrides.

Seed only exact standard Cubism IDs. Report custom-ID gaps for manual
package mapping. Supplied expression/motion playback must remain
available even when automatic continuous performance is incomplete.

## 6. Bundle Haru through D33

After clearance, update the allowlisted default-character packaging
input to the exact cleared Haru runtime artifact. Run it through the
same import/report/load transaction as a user package.

Curate Haru's affect mappings and uppercase-ID performance data.
Exclude or retain voice files strictly according to the clearance.
Keep Hiyori available to regression tests and remove any remaining
product behavior that assumes her name or parameter IDs.

## 7. Fixtures, docs, and gate

Add compact synthetic fixtures for:

- MOC values 1–5 and malformed input;
- registered/loose/nested/duplicate-basename assets;
- sparse sidecars and custom IDs;
- zero/one/multiple unregistered physics files;
- missing optional audio and required textures;
- empty hit areas/groups and oversized textures.

Publish the version table, VTS boundary, ignored `.vtube.json`
behavior, degradation meanings, and Haru package example.

Run:

- headless validation/report checks on Windows and macOS;
- renderer smoke for versions, loose assets, custom IDs, and Haru;
- slice 007 authoring regression;
- a cold stranger import using a non-bundled VTS-style Cubism 3/4
  folder, followed by restart.

Close only when app and dev reports match, unsupported versions refuse
before revival, Haru uses no special loader branch, and the stranger
can explain every degradation without source guidance.

## Standing risks

- Haru's voice files may require exclusion; clearance decides.
- Core version probing must happen before framework revival.
- Large VTS textures can be valid assets but exceed a device limit;
  the live body result is authoritative.
- VTS customization expressions stay callable but intentionally do not
  gain affect coordinates automatically.
