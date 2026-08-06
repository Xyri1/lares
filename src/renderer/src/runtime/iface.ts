// Slice 001 SPEC §3 — root SPEC §8 made concrete. Body-internal contract:
// nothing outside runtime/ imports the Live2D packages.
export interface ParamInfo {
  id: string
  name: string
  min: number
  max: number
  default: number
}

export interface RuntimeCompatibility {
  mocVersion: number | null
  groups: { eyeBlink: string[]; lipSync: string[] }
  motions: Record<string, number>
  maxTextureSize: number | null
  textures: string[]
  textureDimensions: { path: string; width: number; height: number }[]
}

/** One authored phrase, already selected and modulated (slice 014 SPEC §5). */
export interface ManagedMotionPlan {
  group: string
  index: number
  /** Scales every authored parameter's deviation from its rig default; 1 = authored. */
  displacement: number
  /** Scales the motion's elapsed time; 1 = authored. */
  tempo: number
  /** Rig parameter ids the feel target owns; their writes win over the motion. */
  faceParamIds: readonly string[]
}

export interface IRuntime {
  load(modelPath: string, fallbackPhysics?: string, choreographed?: boolean): Promise<void>
  prepareLoad(
    id: number,
    modelPath: string,
    fallbackPhysics?: string,
    choreographed?: boolean
  ): Promise<ParamInfo[]>
  commitLoad(id: number): boolean
  rollbackLoad(id: number): boolean
  /** One-way finalization. Matching callers already own the new body; cleanup is best effort. */
  finalizeLoad(id: number): void
  cancelLoad(id: number): boolean
  parameters(): ParamInfo[]
  compatibility?(): RuntimeCompatibility
  setParams(batch: Record<string, number>, weight?: number): void
  /** Release selected sticky overrides back to motion/physics ownership. */
  releaseParams(ids: readonly string[]): void
  /** Inverse of setParams: drop every override and any applied expression and
   * put all parameters back at their model defaults, so the model's own
   * motion/physics own them again. Debug affordance (dev-panel reset). */
  resetParams(): void
  applyExpression(ref: string | Record<string, number>, weight: number, fadeMs: number): void
  /** Indexed group motion, or a package-relative `lares://` loose motion URL. */
  playMotion(group: string, index?: number, priority?: number): void
  /** Play one registered motion for exactly one authored cycle (slice 014
   *  SPEC §§5–7): motion owns body parameters and Parts, face overrides win,
   *  displacement/tempo modulate, a watchdog bounds a missing finish, and the
   *  runtime settles body values back to the live targets over the fixed
   *  transition. Resolves true on completion (natural or watchdog), false on
   *  contained failure or cancellation. */
  playManagedMotion(plan: ManagedMotionPlan): Promise<boolean>
  /** Stop any managed phrase and ease body parameters and Parts back to the
   *  persistent targets/defaults. Safe to call when nothing plays. */
  cancelManagedMotion(): void
  hitTest(x: number, y: number): string[]
  /** Alpha (0..255) of the rendered pixel at CSS position (x, y). The overlay
   *  click-through test: Hiyori's authored hit area turned out to be a
   *  torso-only box, so 003-D3's per-pixel fallback is what shipped. */
  alphaAt(x: number, y: number): number
  /** The model's footprint in CSS px when drawn at the default Lar size —
   *  what the overlay window fits itself to (003-D5). */
  larSize(): { width: number; height: number }
}
