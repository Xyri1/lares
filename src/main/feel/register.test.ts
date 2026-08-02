import { describe, expect, it } from 'vitest'
import type { SessionRow } from '../sessions/ingest'
import {
  attribute,
  FeedGate,
  FeelRegister,
  FEEL_SPACING_MS,
  LATCH_CAPACITY,
  parseFeelFile,
  type FeelFile
} from './register'

const TUPLE = { valence: -1, activation: 2, control: -2 }

function row(partial: Partial<SessionRow> & Pick<SessionRow, 'session_id'>): SessionRow {
  return {
    harness: 'claude-code',
    state: 'thinking',
    since: 0,
    last_event_at: 0,
    subagents: 0,
    turnOpen: false,
    ...partial
  }
}

describe('FeelRegister', () => {
  it('latches a valid tuple and replaces it wholesale on the next report', () => {
    const register = new FeelRegister()
    expect(register.tryFeel('claude-code:s1', TUPLE, 1000)).toEqual({ status: 'latched' })
    expect(register.get('claude-code:s1')).toEqual({ ...TUPLE, at: 1000 })

    register.tryFeel('claude-code:s1', { valence: 2, activation: 0, control: 1 }, 9000)
    expect(register.get('claude-code:s1')).toEqual({
      valence: 2,
      activation: 0,
      control: 1,
      at: 9000
    })
  })

  it('throws on anything but three integers in {-2..2} and leaves the latch intact', () => {
    const register = new FeelRegister()
    register.tryFeel('claude-code:s1', TUPLE, 0)
    const invalid = [
      { valence: 0, activation: 0 },
      { valence: 0.5, activation: 0, control: 0 },
      { valence: 3, activation: 0, control: 0 },
      { valence: '1', activation: 0, control: 0 },
      { valence: NaN, activation: 0, control: 0 },
      [0, 0, 0],
      null,
      'feel'
    ]
    for (const args of invalid) {
      expect(() => register.tryFeel('claude-code:s1', args, 10_000)).toThrow('integers from -2 to 2')
    }
    expect(register.get('claude-code:s1')).toEqual({ ...TUPLE, at: 0 })
  })

  it('rejects a second report inside the spacing window with the remaining wait', () => {
    const register = new FeelRegister()
    register.tryFeel('claude-code:s1', TUPLE, 5000)

    expect(register.tryFeel('claude-code:s1', { valence: 0, activation: 0, control: 0 }, 6500)).toEqual(
      { status: 'rejected', waitMs: 500 }
    )
    expect(register.get('claude-code:s1')).toEqual({ ...TUPLE, at: 5000 })
    // The cap is per key: another session is unaffected.
    expect(register.tryFeel('claude-code:s2', TUPLE, 6500)).toEqual({ status: 'latched' })
    expect(register.tryFeel('claude-code:s1', TUPLE, 5000 + FEEL_SPACING_MS)).toEqual({
      status: 'latched'
    })
  })

  it('displays the most recent report across all keys, live or ended', () => {
    const register = new FeelRegister()
    expect(register.displayed()).toBeUndefined()
    register.tryFeel('claude-code:old', TUPLE, 1000)
    register.tryFeel('codex:new', { valence: 1, activation: 1, control: 1 }, 2000)
    register.tryFeel('claude-code:old', { valence: -2, activation: -2, control: -2 }, 4000)

    expect(register.displayed()).toEqual({ valence: -2, activation: -2, control: -2, at: 4000 })
  })

  it('writes through on every accepted report and never on a rejected one', () => {
    const written: FeelFile[] = []
    const register = new FeelRegister((file) => written.push(file))
    register.tryFeel('claude-code:s1', TUPLE, 0)
    register.tryFeel('claude-code:s1', TUPLE, 100)
    expect(() => register.tryFeel('claude-code:s1', {}, 100_000)).toThrow()

    expect(written).toEqual([{ v: 1, latches: { 'claude-code:s1': { ...TUPLE, at: 0 } } }])
  })

  it('keeps volatile mcp: keys out of storage while still displaying them', () => {
    const register = new FeelRegister()
    register.tryFeel('mcp:abc', TUPLE, 1000)

    expect(register.displayed()).toEqual({ ...TUPLE, at: 1000 })
    expect(register.get('mcp:abc')).toEqual({ ...TUPLE, at: 1000 })
    expect(register.file()).toEqual({ v: 1, latches: {} })
  })

  it('round-trips storage and evicts the oldest keys past capacity', () => {
    const register = new FeelRegister()
    for (let i = 0; i < LATCH_CAPACITY + 4; i++) {
      register.tryFeel(`claude-code:s${i}`, TUPLE, i * FEEL_SPACING_MS)
    }
    const file = register.file()
    expect(Object.keys(file.latches)).toHaveLength(LATCH_CAPACITY)
    expect(file.latches['claude-code:s0']).toBeUndefined()
    expect(file.latches['claude-code:s4']).toBeDefined()
    // The displayed key is the most recent, so it is retained by definition.
    expect(register.displayed()).toEqual(file.latches[`claude-code:s${LATCH_CAPACITY + 3}`])

    const restored = new FeelRegister()
    restored.restore(parseFeelFile(JSON.parse(JSON.stringify(file)))!)
    expect(restored.file()).toEqual(file)
    expect(restored.displayed()).toEqual(register.displayed())
  })
})

describe('parseFeelFile', () => {
  it('refuses anything that is not a v1 file, so the caller can warn', () => {
    for (const raw of [null, 'x', [], {}, { v: 2, latches: {} }, { v: 1 }, { v: 1, latches: [] }]) {
      expect(parseFeelFile(raw)).toBeNull()
    }
  })

  it('drops unusable and volatile entries without losing the good ones', () => {
    const parsed = parseFeelFile({
      v: 1,
      latches: {
        'claude-code:good': { ...TUPLE, at: 5 },
        'claude-code:float': { valence: 0.5, activation: 0, control: 0, at: 5 },
        'claude-code:range': { valence: 9, activation: 0, control: 0, at: 5 },
        'claude-code:short': { valence: 0, activation: 0, at: 5 },
        'claude-code:undated': { ...TUPLE },
        'claude-code:null': null,
        'mcp:volatile': { ...TUPLE, at: 9 }
      }
    })

    expect([...parsed!]).toEqual([['claude-code:good', { ...TUPLE, at: 5 }]])
  })
})

describe('FeedGate', () => {
  it('emits only when the tuple or the operational state moves', () => {
    const gate = new FeedGate()
    expect(gate.changed(null, 'idle')).toBe(true)
    expect(gate.changed(null, 'idle')).toBe(false)

    // A sweep-produced operational change still emits.
    expect(gate.changed(null, 'done')).toBe(true)
    expect(gate.changed(null, 'idle')).toBe(true)
    expect(gate.changed(null, 'idle')).toBe(false)

    expect(gate.changed(TUPLE, 'idle')).toBe(true)
    expect(gate.changed({ ...TUPLE }, 'idle')).toBe(false)
    expect(gate.changed({ ...TUPLE, control: 0 }, 'idle')).toBe(true)
    expect(gate.changed(null, 'idle')).toBe(true)
  })

  it('lets an unchanged state through again after a reset', () => {
    const gate = new FeedGate()
    expect(gate.changed(TUPLE, 'working')).toBe(true)
    expect(gate.changed(TUPLE, 'working')).toBe(false)
    gate.reset()
    expect(gate.changed(TUPLE, 'working')).toBe(true)
  })
})

describe('attribute', () => {
  it('prefers an open turn, then the most recently active session', () => {
    const rows = [
      row({ session_id: 'quiet', last_event_at: 100, turnOpen: true }),
      row({ session_id: 'loud', last_event_at: 900 })
    ]
    expect(attribute(rows)).toBe('claude-code:quiet')

    rows[0].turnOpen = false
    expect(attribute(rows)).toBe('claude-code:loud')
  })

  it('resolves several open turns to the most recent one, across harnesses', () => {
    expect(
      attribute([
        row({ session_id: 'a', last_event_at: 100, turnOpen: true }),
        row({ session_id: 'b', harness: 'codex', last_event_at: 700, turnOpen: true }),
        row({ session_id: 'c', last_event_at: 300, turnOpen: true })
      ])
    ).toBe('codex:b')
  })

  it('returns null for an empty session table so the caller can go volatile', () => {
    expect(attribute([])).toBeNull()
  })
})
