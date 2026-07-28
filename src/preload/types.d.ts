type CharacterPayload =
  | { ok: true; name: string; live2d: { model: string } & Record<string, unknown> }
  | { ok: false; error: string }

/**
 * Performance feed (root SPEC §4, slice SPEC §5), brain→body over
 * `affect:update`. Renderer-neutral: cue names and numbers only (P6).
 * Declared structurally here — this seam is the contract, not a shared import.
 */
interface AffectFeed {
  stageId: string
  /** Scenario tick index (t = tick·100ms) — the renderer keys replay/synth
   * timing off this, not off arrival order (002 step-6 decision 1). */
  tick: number
  E: { valence: number; arousal: number }
  M: { valence: number; arousal: number }
  baselineState: string
  expressionStack: {
    cueOrFreeform: string | { params: Record<string, number>; label?: string }
    weight: number
    expiryMs: number
  }[]
  beats: string[]
}

type ScenarioPlayResult = { ok: true; endMs: number } | { ok: false; error: string }

/** Per-stage mapping preset selection (002-D2). B present = A/B mode:
 * two engines main-side, two synths body-side, traces written per stage. */
interface StagePresets {
  A: string
  B?: string
}

type ControlResult = { ok: true } | { ok: false; error: string }

/** Exact authoring preview is a separate P6 channel. Expressions arrive as
 * brain-parsed opaque knob values; cue keeps motion playback body-side. */
type AuthoringPreview = { params: Record<string, number> } | { cue: string }

/** cues:list entry (slice SPEC §5/§7) — a cue's affect coordinates plus its
 * raw Live2D param set, zipped from the manifest's `expressions` and
 * `renderers.live2d.cues` blocks. */
interface CueListEntry {
  name: string
  valence: number | null
  arousal: number | null
  params?: Record<string, number>
  /** Indexed Live2D motion form: `group` or `group:index`. */
  motion?: string
}

interface LaresBridge {
  getCharacter(): Promise<CharacterPayload>
  reportInventory(params: unknown[]): void
  playScenario(
    name: string,
    seed: number,
    speed: number,
    presets?: StagePresets
  ): Promise<ScenarioPlayResult>
  pauseScenario(): Promise<ControlResult>
  resumeScenario(): Promise<ControlResult>
  setScenarioSpeed(speed: number): Promise<ControlResult>
  seekScenario(tMs: number): Promise<ControlResult>
  listCues(): Promise<CueListEntry[]>
  onAffectUpdate(cb: (feed: AffectFeed) => void): void
  onAuthoringPreview(cb: (preview: AuthoringPreview) => void): void
  onAuthoringRevert(cb: () => void): void
  onScenarioSeeked(cb: (history: AffectFeed[]) => void): void
  onScenarioEnd(cb: () => void): void
  /** Synth trace lines keyed by stage id ('A' | 'B'). */
  sendSynthTrace(linesByStage: Record<string, string[]>): void
  /** Widen the window for side-by-side A/B, restore on exit (002-D2). */
  setAbMode(on: boolean): Promise<ControlResult>
  /** Overlay only: shrink the window tight around the model and place it
   *  (003-D5). Main adds the padding and owns where she lands. */
  fitToModel(size: { width: number; height: number }): Promise<ControlResult>
  /** Overlay only: `stage:pointer` (root §8) — is the cursor on the body?
   *  Main flips click-through from this (003-D3). Send transitions only. */
  reportPointer(overBody: boolean): void
  /** Overlay drag in screen coordinates (003-D4); dragEnd persists the drop. */
  dragStart(at: { x: number; y: number }): void
  dragMove(at: { x: number; y: number }): void
  dragEnd(): void
}

interface Window {
  lares: LaresBridge
}
