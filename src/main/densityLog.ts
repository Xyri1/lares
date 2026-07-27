import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import type { BaselineState } from './affect/types'
import type { EmoteResult } from './nerves'

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

  recordEmote(source: string, args: unknown, result: EmoteResult, nowMs: number): void {
    const value = args as { cue?: unknown; params?: unknown }
    this.write({
      timestamp: new Date(nowMs).toISOString(),
      type: 'emote',
      source,
      ...(value.cue === undefined ? {} : { cue: value.cue }),
      ...(value.params === undefined ? {} : { params: value.params }),
      coalesced: result.status === 'coalesced'
    })
  }

  private write(value: object): void {
    appendFileSync(this.file, `${JSON.stringify(value)}\n`)
  }
}
