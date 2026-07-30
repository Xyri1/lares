# Slice 001 — Canvas · SPEC

**Artifact:** Slice SPEC · **Slice:** 001-canvas (= ROADMAP M1a) · **Status:** Draft

**Why / gate.** First code: prove the render path so M2 can attack the
thesis risk with a live model. Exit gate (ROADMAP M1a): *the bundled model
renders on macOS and Windows and every model parameter is drivable through
the runtime interface.*

Refines root SPEC §1/§5/§8/§10; contradicts nothing. Binding within the
slice; root SPEC stays source of truth.

---

## 1. Scope

**In:** electron-vite scaffold; plain framed window; pixi-live2d-display
(or maintained fork, 001-D2) behind `IRuntime` inside `runtime/`; 30fps
cap; character-package skeleton loading Hiyori; asset fetch script; dev
parameter panel.

**Out (fence):** overlay chrome (M1b), affect engine and performance-feed
dynamics (M2), HTTP/MCP server and adapters (M3), full import validation
and authoring (M4), installers (M5).

## 2. Window

Plain OS window: framed, resizable, default 480×720, dev-tools available.
None of the D13 overlay behaviors. Renderer ticker capped at 30fps (root
§10); cap verified by the panel's FPS readout.

## 3. Runtime interface (root §8, made concrete)

```ts
interface ParamInfo { id: string; name: string; min: number; max: number; default: number }

interface IRuntime {
  load(modelPath: string): Promise<void>
  parameters(): ParamInfo[]                                   // full model inventory
  setParams(batch: Record<string, number>, weight?: number): void
  applyExpression(ref: string | Record<string, number>, weight: number, fadeMs: number): void
  playMotion(group: string, index?: number, priority?: number): void
  hitTest(x: number, y: number): string[]
}
```

Constraints: nothing outside `runtime/` imports the Live2D package (root
§8); unknown param ids in `setParams` are dropped, values clamped to the
inventory range (P7 posture starts here even without a server).

## 4. Character package skeleton (root §5 subset)

Reads `lar.character.json`; M1a checks only: `format === "lares/1"`,
`identity.name` and `identity.license` present, `renderers.live2d.model`
resolves to an existing file. Bad manifest or missing model ⇒ clean error
surfaced in-window, no crash. Full §5 validation is M4.

Seam honesty even now: main process owns the manifest (`characters/`),
renderer receives only the `renderers.live2d` block over IPC and loads the
model. Raw asset paths never travel further than that block (P6 spirit;
the block is body-side territory by definition).

Hiyori's manifest is committed at `characters/hiyori/lar.character.json`
(our authorship, Apache-2.0); its `model` path points into the gitignored
asset directory populated by the fetch script (001-D3).

## 5. Assets

`pnpm fetch-assets` (script, idempotent): downloads Cubism Core from
Live2D's official distribution and the Hiyori sample zip from Live2D's
sample-data page into gitignored locations; verifies the committed NOTICE
files match `sdd/clearances/M0-clearances.md` wording. The repo never
contains the Core (D20 §6.8) or Hiyori model files (001-D3).

## 6. Acceptance (GWT)

**A1 — Render.** GIVEN a fresh clone + `pnpm install && pnpm fetch-assets
&& pnpm dev` on Windows and on macOS THEN the window shows Hiyori rendered
(idle motion if bundled assets provide one) with no console errors, FPS
readout ≤30.

**A2 — Inventory.** GIVEN the model loaded THEN `parameters()` returns
every parameter the model declares, each with id/name/min/max/default.

**A3 — Drivability (the gate).** GIVEN the dev panel's sweep-all THEN every
parameter in the inventory is driven through its range via `setParams`
with visible model response and no errors.

**A4 — Clamping.** GIVEN `setParams` with an unknown id and a value 10×
out of range THEN the unknown is dropped, the value clamped, no throw.

**A5 — Skeleton failure.** GIVEN a manifest with a wrong model path THEN
a readable in-window error, app alive.

**A6 — Repo hygiene.** GIVEN `git ls-files` THEN no Core, no Hiyori model
files; NOTICE and license texts present.

**A7 — Motion/expression paths.** GIVEN Hiyori's bundled motions THEN
`playMotion` plays one; `applyExpression` with a raw param set applies and
fades. (`.exp3.json`-ref form exercised only if Hiyori ships one; otherwise
deferred to the first model that does — noted in PLAN close-out.)
