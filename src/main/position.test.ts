import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { clampToWorkArea, loadPosition, parsePoint, savePosition, type Rect } from './position'

// A two-monitor desk: primary 1920x1040 work area, a second screen to its right
// sitting 200px lower (the classic layout that breaks naive clamping).
const PRIMARY: Rect = { x: 0, y: 0, width: 1920, height: 1040 }
const SECOND: Rect = { x: 1920, y: 200, width: 1280, height: 960 }
const DESK = [PRIMARY, SECOND]

const LAR: Pick<Rect, 'width' | 'height'> = { width: 300, height: 416 }
const at = (x: number, y: number): Rect => ({ x, y, ...LAR })

describe('clampToWorkArea', () => {
  it('leaves a fully visible window where it is', () => {
    expect(clampToWorkArea(at(800, 400), DESK)).toEqual({ x: 800, y: 400 })
  })

  it('pulls a window hanging off the bottom-right back inside', () => {
    // Corner spawn, then the work area shrank under it (taskbar, resolution).
    expect(clampToWorkArea(at(1800, 900), [PRIMARY])).toEqual({ x: 1620, y: 624 })
  })

  it('rehomes to the neighbour a window now overlaps most', () => {
    // Same spot with the second screen attached: more of her is over there.
    expect(clampToWorkArea(at(1800, 900), DESK)).toEqual({ x: 1920, y: 744 })
  })

  it('pulls a window hanging off the top-left back inside', () => {
    expect(clampToWorkArea(at(-120, -80), DESK)).toEqual({ x: 0, y: 0 })
  })

  it('keeps a window on the secondary monitor it overlaps most', () => {
    expect(clampToWorkArea(at(2400, 300), DESK)).toEqual({ x: 2400, y: 300 })
  })

  it('rehomes to the nearest area when the saved monitor is gone (A4)', () => {
    // Saved on the second screen; relaunched with only the primary attached.
    expect(clampToWorkArea(at(2400, 300), [PRIMARY])).toEqual({ x: 1620, y: 300 })
  })

  it('rehomes a position that is off every area entirely', () => {
    const home = clampToWorkArea({ x: -5000, y: -5000, ...LAR }, DESK)
    expect(home).toEqual({ x: 0, y: 0 })
  })

  it('lands a window bigger than its work area flush at the top-left', () => {
    const huge = { x: 400, y: 400, width: 2400, height: 1400 }
    expect(clampToWorkArea(huge, [PRIMARY])).toEqual({ x: 0, y: 0 })
  })

  it('passes the position through when no display reports a work area', () => {
    expect(clampToWorkArea(at(50, 60), [])).toEqual({ x: 50, y: 60 })
  })
})

describe('parsePoint', () => {
  it('accepts a well-formed point and rounds it to whole DIPs', () => {
    expect(parsePoint({ x: 12.4, y: -7.6 })).toEqual({ x: 12, y: -8 })
  })

  it.each([
    ['null', null],
    ['an array', [1, 2]],
    ['a string', '{"x":1,"y":2}'],
    ['a missing field', { x: 1 }],
    ['a non-numeric field', { x: 1, y: '2' }],
    ['NaN', { x: 1, y: Number.NaN }],
    ['Infinity', { x: Number.POSITIVE_INFINITY, y: 2 }]
  ])('rejects %s', (_label, raw) => {
    expect(parsePoint(raw)).toBeNull()
  })
})

describe('loadPosition / savePosition', () => {
  const scratch = (): string => join(mkdtempSync(join(tmpdir(), 'lares-window-')), 'window.json')

  it('round-trips a dropped position', () => {
    const file = scratch()
    savePosition(file, { x: 1600, y: 880 })
    expect(loadPosition(file)).toEqual({ x: 1600, y: 880 })
  })

  it('returns null for a missing file', () => {
    expect(loadPosition(scratch())).toBeNull()
  })

  it('returns null for a corrupt file instead of throwing (P7)', () => {
    const file = scratch()
    writeFileSync(file, '{"x": 12, ')
    expect(loadPosition(file)).toBeNull()
  })
})
