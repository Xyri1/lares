type CharacterPayload =
  | {
      ok: true
      name: string
      /** Anchor and operational overlay overrides (slice 013 SPEC §13),
       * renderer-neutral: channel names and numbers, never rig ids. */
      anchors?: Record<string, Record<string, number>>
      operational?: Record<string, Record<string, number>>
      live2d: {
        model: string
        fallbackPhysics?: string
        performance?: CharacterSynthPreset
        choreography?: CharacterChoreography
      } & Record<string, unknown>
    }
  | { ok: false; error: string }

/** Authored choreography map (slice 014 SPEC §3): renderer-neutral group/index
 * refs, keyed by sign-ordered corner or the required fallback. */
interface CharacterChoreographyRef {
  group: string
  index: number
}

interface CharacterChoreography {
  fallback: CharacterChoreographyRef
  anchors?: Record<string, CharacterChoreographyRef>
}

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
}

interface CharacterCommitRequest {
  id: number
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

type ControlResult = { ok: true } | { ok: false; error: string }

/** Dev-run only: bounded, redacted events from the real ingress path. */
interface LiveTraceEvent {
  at: number
  source: 'mcp' | 'hook' | 'feel' | 'feed' | 'renderer'
  action: string
  session?: string
  detail?: string
  feel?: { valence: number; activation: number; control: number } | null
  operational?: string
}

/** Exact authoring preview is a separate P6 channel (013 SPEC §8): brain-
 * parsed opaque knob values, explicit user-invoked authoring only. */
type AuthoringPreview = { params: Record<string, number> }

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
  playScenario(name: string, seed: number, speed: number): Promise<ScenarioPlayResult>
  stopScenario(): Promise<ControlResult>
  pauseScenario(): Promise<ControlResult>
  resumeScenario(): Promise<ControlResult>
  setScenarioSpeed(speed: number): Promise<ControlResult>
  seekScenario(tMs: number): Promise<ControlResult>
  onAffectUpdate(cb: (feed: AffectFeed) => void): void
  onAuthoringPreview(cb: (preview: AuthoringPreview) => void): void
  onAuthoringRevert(cb: () => void): void
  onScenarioSeeked(cb: (history: AffectFeed[]) => void): void
  onScenarioEnd(cb: () => void): void
  onScenarioStopped(cb: () => void): void
  sendSynthTrace(lines: string[]): void
  onLiveTrace(cb: (event: LiveTraceEvent) => void): void
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
