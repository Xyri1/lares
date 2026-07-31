import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_CONFIG } from './config'
import {
  CALIBRATION_PROMPT,
  calibrationState,
  reconcileCalibrationArmed,
  toggleCalibration
} from './calibration'

const report = (calibrated: number, uncalibrated: number) => ({
  calibrated,
  uncalibrated
})

describe('calibration surfacing', () => {
  it('maps no, partial, and complete calibration to red, yellow, and no dot', () => {
    expect(calibrationState(report(0, 3))).toMatchObject({ tone: 'red', complete: false })
    expect(calibrationState(report(2, 1))).toMatchObject({ tone: 'yellow', complete: false })
    expect(calibrationState(report(3, 0))).toMatchObject({ tone: 'complete', complete: true })
    expect(calibrationState(report(0, 0))).toMatchObject({ tone: 'red', complete: false })
  })

  it('keeps the bundled prompt byte-identical to the documented kickoff block', () => {
    const docs = readFileSync(join(process.cwd(), 'docs', 'en', 'character-format.md'), 'utf8')
    const kickoff = /## Copyable mapping flow[\s\S]*?```text\n([\s\S]*?)\n```/.exec(docs)?.[1]
    expect(CALIBRATION_PROMPT).toBe(kickoff)
  })

  it('arms with an exact clipboard copy, persists, and manually disarms without recopying', async () => {
    const config = { ...DEFAULT_CONFIG }
    const copy = vi.fn()
    const persist = vi.fn(async () => undefined)

    expect(await toggleCalibration(config, report(0, 2), copy, persist)).toBe(true)
    expect(config.calibrationArmed).toBe(true)
    expect(copy).toHaveBeenCalledWith(CALIBRATION_PROMPT)
    expect(persist).toHaveBeenCalledOnce()

    expect(await toggleCalibration(config, report(0, 2), copy, persist)).toBe(true)
    expect(config.calibrationArmed).toBe(false)
    expect(copy).toHaveBeenCalledOnce()
    expect(persist).toHaveBeenCalledTimes(2)
  })

  it('disarms completed packages and refuses to arm one', async () => {
    const config = { ...DEFAULT_CONFIG, calibrationArmed: true }
    expect(reconcileCalibrationArmed(config, report(4, 0))).toBe(true)
    expect(config.calibrationArmed).toBe(false)
    expect(reconcileCalibrationArmed(config, report(4, 0))).toBe(false)

    const persist = vi.fn(async () => undefined)
    expect(await toggleCalibration(config, report(4, 0), vi.fn(), persist)).toBe(false)
    expect(config.calibrationArmed).toBe(false)
    expect(persist).not.toHaveBeenCalled()
  })

  it('restores the visible toggle when persistence fails', async () => {
    const config = { ...DEFAULT_CONFIG }
    await expect(
      toggleCalibration(
        config,
        report(0, 1),
        vi.fn(),
        async () => {
          throw new Error('disk full')
        }
      )
    ).rejects.toThrow('disk full')
    expect(config.calibrationArmed).toBe(false)
  })
})
