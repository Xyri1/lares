# Slice 007 — Format · SPEC

**Artifact:** Slice SPEC · **Slice:** 007-format (ROADMAP M4) · **Status:** Closed

**Why / gate.** M4 makes the character package real: a third-party
Live2D model, imported by following docs alone, becomes a working
Lar — bundled expressions harvested, calibrated by an agent over MCP,
gaps filled by agent-authored expressions. Exit gate (ROADMAP M4,
tailored by the maintainer): a fresh agent session with no repo context,
following only `docs/character-format.md`, walks a commercial
third-party model end-to-end — import → calibrate → author ≥1 gap
expression → validated, running Lar — with the maintainer as the one human
observer. Gate material: IceGirl (purchased commercial model; local
only, never committed — D19 discipline).

Scope frame: developer hygiene. Single-user operation; one model on disk
at a time; installers and tray remain M5a.

---

## 1. Scope

**In:** character loading by directory scan (hardcoded `hiyori`
dies); the import dev script with directory-scan harvest; the
validation library function and its three callers; the single
brain-side exp3 apply path; the four authoring MCP tools and the
`authoring:preview` feed channel; `docs/character-format.md` with the
mapping-flow prompt block; synthetic import fixtures.

**Out (fence):** tray, status dot, armed mode (M5a — D32); any
consent UI (D29); in-app import UI; skill-file packaging (post-M3b
skills pass); wire/envelope changes (frozen at M3a); affect-engine
physics changes (frozen at M2a); renaming/moving the `characters/`
scan root (M5a decides the user-level location); committing any
non-FML model.

## 2. Loading and import

**Loading.** The app scans `characters/` for directories containing
`lar.character.json` and loads the single package found. Multiple ⇒
warn and pick the first alphabetically. Zero ⇒ loud visible error, no
crash (P7-style: fail loudly, stay up).

**Import** (`pnpm run import -- characters/<name>`, setup-time only —
007-D1). The model directory sits at `characters/<name>/runtime/`
(Hiyori convention). The script:

- Directory-scans for `.exp3.json` and `.motion3.json` recursively;
  the model index (`FileReferences`) is advisory only — VTube-Studio-
  convention models (IceGirl) index nothing (007-D2). Index entries
  and scan results are unioned and deduped.
- Writes the initial `lar.character.json`: one cue per found
  expression/motion, keyed by the artist's name verbatim (CJK
  included), referencing the file by package-relative path
  (`{ "expression": "runtime/惊讶.exp3.json" }`) — never copying
  slider values. Affect coords start null (007-D3).
- Ends by running validation and printing the report, closing with
  "N cues uncalibrated — ask your agent to run the mapping flow."

**Null-coord semantics (007-D3).** Null-coord cues are legal and
immediately emote-able — `emote(cue)` plays them with a zero affect
nudge. They are invisible only to the engine's autonomous
affect-distance selection. `list_cues` marks them uncalibrated;
`status()` carries the count as inert data. MCP `instructions` never
mention calibration (pull-only — D32).

## 3. Expression application

One brain-side path for bundled and authored expressions alike
(007-D4): Lares parses the exp3 file itself — honoring
Add/Multiply/Overwrite blend modes against model defaults, resolving
display names via `cdi3.json` where present — and applies via the
existing slider pipeline (§8 feed, body `setParams`). Motions keep
using `playMotion`. Artist files are never modified; the model index
is never patched.

## 4. Authoring tools (MCP)

Four tools, D25's loop (007-D5):

- `list_parameters()` — the cached §8 inventory: id, display name,
  min, max, default.
- `preview_expression(params | cue)` — exact render via the §8
  `authoring:preview` channel, bypassing affect blending and idle
  drift; holds until replaced, explicitly reverted
  (`preview_expression({})`), or a 60s *(default)* timeout. A cue
  reference previews an existing mapped expression or plays its
  motion (calibration needs eyes on both).
- `save_expression(name, params, affect)` — create: writes a real
  `authored/<name>.exp3.json` (ecosystem convention) plus the manifest
  cue entry and affect coords, atomically. Refuses any name that
  already exists, bundled or authored — overwrite requires deleting
  the file first.
- `update_expression(name, affect?, params?)` — update: affect coords
  for any existing cue (the calibration write); sliders for authored
  cues only (artist files are read-only). Refuses unknown names.

User acceptance is conversational (007-D6): the flow text instructs
preview → ask → save; enforcement is the collision refusal plus the
human watching their own desktop. Cap: ≤ 50 authored expressions per
package *(default)*.

## 5. Validation

A pure library function in `src/main/characters/` (007-D7): schema,
reference resolution (model file, every cue's expression/motion/
authored file exists), value ranges (valence [−1,1], arousal [0,1]),
exp3 parseability. Output is a report: cues by source (bundled
expression / motion / authored), calibrated vs not, broken
references. Three callers: the import script (always, post-write),
`pnpm run import -- --check` (report-only, writes nothing), the app at load
(loud on failure). Knob-id-vs-model checks stay in-app, post-load,
against the §8 inventory.

## 6. Docs

`docs/character-format.md` (007-D8): annotated schema (D08 shape),
import walkthrough (drop folder → run script → calibrate), the
mapping-flow prompt block (copy-pasteable; this is M4's skill
delivery), and a synthetic worked example showing the happy path —
cues referencing bundled expressions and motions, one authored gap
expression, calibrated coords. Hiyori documented as the atypical
all-raw-params reference (she bundles no exp3). IceGirl never
appears in the repo.

## 7. Acceptance (GWT)

**A1 — Import, VTube-Studio-shaped.** GIVEN a synthetic fixture with
loose CJK-named exp3/motion3 files and an empty model index WHEN
`pnpm run import --` runs THEN the manifest maps every file as a cue, keys
verbatim, null coords, and the report prints counts.

**A2 — Import, SDK-shaped.** GIVEN a Hiyori-shaped fixture (indexed
motions, no exp3) WHEN imported THEN indexed and scanned files union
without duplicates.

**A3 — Validation.** GIVEN packages with a broken reference,
out-of-range coords, and a malformed exp3 WHEN validated THEN each
fails loudly with the offending path named; `--check` writes nothing.

**A4 — Loading.** GIVEN zero / one / two packages under `characters/`
WHEN the app launches THEN loud error / load / warn-and-pick-first.

**A5 — exp3 semantics.** GIVEN exp3 fixtures using Add, Multiply, and
Overwrite blends WHEN parsed and applied THEN resulting slider values
match hand-computed expectations against model defaults (unit).

**A6 — Authoring tools (live MCP).** GIVEN the app with a loaded
character WHEN a real MCP client walks the loop THEN
`list_parameters` returns the inventory; `preview_expression` holds,
replaces, reverts, and times out; `save_expression` writes file +
manifest and refuses a colliding name; `update_expression` sets
coords on any cue, refuses slider edits on bundled cues and unknown
names.

**A7 — The gate (eyes on).** GIVEN a fresh agent session, docs only,
IceGirl dropped into `characters/` WHEN the session follows
`docs/character-format.md` end-to-end THEN a validated package
results, ≥1 authored gap expression accepted and playing on the Lar,
with the maintainer observing. On pass, M4 closes in ROADMAP.
