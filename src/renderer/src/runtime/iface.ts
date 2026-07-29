// Slice 001 SPEC §3 — root SPEC §8 made concrete. Body-internal contract:
// nothing outside runtime/ imports the Live2D packages.
export interface ParamInfo {
  id: string
  name: string
  min: number
  max: number
  default: number
}

export interface IRuntime {
  load(modelPath: string): Promise<void>
  prepareLoad(id: number, modelPath: string): Promise<ParamInfo[]>
  commitLoad(id: number): boolean
  rollbackLoad(id: number): boolean
  finalizeLoad(id: number): boolean
  cancelLoad(id: number): boolean
  parameters(): ParamInfo[]
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
  hitTest(x: number, y: number): string[]
  /** Alpha (0..255) of the rendered pixel at CSS position (x, y). The overlay
   *  click-through test: Hiyori's authored hit area turned out to be a
   *  torso-only box, so 003-D3's per-pixel fallback is what shipped. */
  alphaAt(x: number, y: number): number
  /** The model's footprint in CSS px when drawn at the default Lar size —
   *  what the overlay window fits itself to (003-D5). */
  larSize(): { width: number; height: number }
}
