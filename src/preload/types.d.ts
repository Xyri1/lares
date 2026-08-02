type CharacterPayload =
  | {
      ok: true
      name: string
      /** Anchor and operational overlay overrides (slice 013 SPEC §13),
       * renderer-neutral: channel names and numbers, never rig ids. */
      anchors?: Record<string, Record<string, number>>
      operational?: Record<string, Record<string, number>>
      /** Expressiveness `k` (slice 013 SPEC §4) — a hidden app-config float,
       * read at launch; absent means 1. */
      expressiveness?: number
      live2d: {
        model: string
        fallbackPhysics?: string
        performance?: CharacterSynthPreset
      } & Record<string, unknown>
    }
  | { ok: false; error: string }

interface CharacterSynthPreset {
  /** `source` names a performance channel (slice 013 SPEC §2). */
  params: {
    id: string
    source: string
    gain: number
    offset: number
  }[]
  idle: {
    breath: { id: string; basePeriodMs: number; amplitude: number }
    blink: { ids: string[]; baseIntervalMs: number; durationMs: number }
    sway: { id: string; baseAmplitude: number; periodMs: number }
  }
}

interface CharacterPrepareRequest {
  id: number
  character: Extract<CharacterPayload, { ok: true }>
  cues: CueListEntry[]
}

interface CharacterCommitRequest {
  id: number
  cues: CueListEntry[]
}

type CharacterPrepareResult =
  | { id: number; ok: true; inventory: unknown[]; compatibility?: unknown }
  | { id: number; ok: false; error: string }

type CharacterCommitResult =
  | { id: number; ok: true }
  | { id: number; ok: false; error: string }

type CharacterDecision = 'commit' | 'rollback' | null

/**
 * Performance feed (slice 013 SPEC §13), brain→body over `affect:update`.
 * Renderer-neutral: the latched tuple and one operational state (P6).
 * Declared structurally here — this seam is the contract, not a shared import.
 */
interface AffectFeed {
  stageId: string
  /** Scenario tick index (t = tick·100ms) — the renderer keys replay/synth
   * timing off this, not off arrival order (002 step-6 decision 1). */
  tick: number
  /** Wire integers in {-2..2}; `null` selects the neutral anchor — resting
   * presentation, not `feel(0, 0, 0)` (SPEC §11). */
  feel: { valence: number; activation: number; control: number } | null
  /** Root §3 session state; only `awaiting_input` and `error` present. */
  operational: string
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

/** Agent-integrations window (brain→page full-state push over
 * `integrations:state`); the page renders whatever phase it is handed and
 * answers with `integrations:action`. All strings arrive pre-localized. */
interface IntegrationsCommandRow {
  id: number
  /** Display form — executable basename plus args, not the full path. */
  text: string
  status: 'running' | 'ok' | 'fail'
}

interface IntegrationsResultRow {
  /** `skip` = that harness's plugin manager is not installed — normal, not a failure. */
  status: 'ok' | 'skip' | 'fail'
  text: string
}

interface IntegrationsState {
  phase: 'confirm' | 'running' | 'result'
  strings: {
    confirmTitle: string
    message: string
    detail: string
    cancel: string
    configure: string
    runningTitle: string
    runningNote: string
    resultTitle: string
    nextTitle: string
    copy: string
    done: string
  }
  commands: IntegrationsCommandRow[]
  results?: { rows: IntegrationsResultRow[]; next: string[]; hasManual: boolean }
  copied?: boolean
}

type IntegrationsAction = 'configure' | 'cancel' | 'copy' | 'done'

interface LaresBridge {
  getCharacter(): Promise<CharacterPayload>
  getOverlayScale(): Promise<number>
  onOverlayScale(cb: (scale: number) => void): void
  reportInventory(params: unknown[], compatibility: unknown): void
  onCharacterPrepare(cb: (request: CharacterPrepareRequest) => void): void
  reportCharacterPrepared(result: CharacterPrepareResult): void
  onCharacterCommit(cb: (request: CharacterCommitRequest) => void): void
  reportCharacterCommitted(result: CharacterCommitResult): void
  onCharacterRollback(cb: (id: number) => void): void
  onCharacterFinalize(cb: (id: number) => void): void
  getCharacterDecision(id: number): Promise<CharacterDecision>
  onCharacterCancel(cb: (id: number) => void): void
  playScenario(
    name: string,
    seed: number,
    speed: number,
    presets?: StagePresets
  ): Promise<ScenarioPlayResult>
  stopScenario(): Promise<ControlResult>
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
  onScenarioStopped(cb: () => void): void
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
  /** Integrations window only. */
  onIntegrationsState(cb: (state: IntegrationsState) => void): void
  integrationsAction(action: IntegrationsAction): void
}

interface Window {
  lares: LaresBridge
}
