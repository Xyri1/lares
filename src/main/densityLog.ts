import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import type { BaselineState } from './affect/types'

export class DensityLog {
  private baseline: BaselineState | undefined

  constructor(private readonly file: string) {
    mkdirSync(dirname(file), { recursive: true })
  }

  recordBaseline(state: BaselineState, nowMs: number): void {
    const from = this.baseline
    this.baseline = state
    if (from === undefined || from === state) return
    this.write({ timestamp: new Date(nowMs).toISOString(), type: 'baseline', from, to: state })
  }

  private write(value: object): void {
    appendFileSync(this.file, `${JSON.stringify(value)}\n`)
  }
}
