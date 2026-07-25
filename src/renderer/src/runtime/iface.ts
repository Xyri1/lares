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
  parameters(): ParamInfo[]
  setParams(batch: Record<string, number>, weight?: number): void
  applyExpression(ref: string | Record<string, number>, weight: number, fadeMs: number): void
  playMotion(group: string, index?: number, priority?: number): void
  hitTest(x: number, y: number): string[]
}
