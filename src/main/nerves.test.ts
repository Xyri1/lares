import { describe, expect, it } from 'vitest'
import { Nerves } from './nerves'

const INVENTORY = [
  { id: 'ParamMouthForm', name: 'Mouth form', min: -1, max: 1, default: 0 },
  { id: 'ParamAngleY', name: 'Head Y', min: -30, max: 30, default: 0 }
]

function hookEvent(
  hook_event_name: string,
  session_id = 'session-a',
  harness: 'claude-code' | 'codex' = 'claude-code'
) {
  return { v: 1 as const, harness, session_id, event: { hook_event_name } }
}

describe('Nerves', () => {
  it('tracks session state through ingest and reports it back', () => {
    const nerves = new Nerves('Hiyori', () => true)
    nerves.ingest(hookEvent('SessionStart'), 0)
    expect(nerves.sessionState(0)).toMatchObject({
      baseline: 'thinking',
      sessions: [{ session_id: 'session-a' }]
    })
  })

  it('reports active character and a fixed protocol version', () => {
    const nerves = new Nerves('Hiyori')
    expect(nerves.status()).toEqual({ active_character: 'Hiyori', protocol_version: 2 })
  })

  it('rejects malformed inventory and accepts a valid one', () => {
    const nerves = new Nerves('Hiyori')
    expect(nerves.setInventory('nope')).toBe(false)
    expect(nerves.setInventory(INVENTORY)).toBe(true)
    expect(nerves.listParameters()[0]).toMatchObject({ id: 'ParamMouthForm', display_name: 'Mouth form' })
  })

  it('throws for list/preview before any inventory has arrived', () => {
    const nerves = new Nerves('Hiyori')
    expect(() => nerves.listParameters()).toThrow('body inventory is not available yet')
    expect(() => nerves.previewExpression({ params: { X: 1 } }, 0)).toThrow(
      'body inventory is not available yet'
    )
  })

  it('previews clamped params, holds, and reverts empty calls or on timeout', () => {
    const previews: unknown[] = []
    let reverts = 0
    const nerves = new Nerves('Hiyori', undefined, {
      preview: (value) => previews.push(value),
      revertPreview: () => reverts++
    })
    nerves.setInventory(INVENTORY)

    expect(nerves.previewExpression({ params: { ParamMouthForm: 9, Unknown: 1 } }, 0)).toEqual({
      status: 'previewing'
    })
    expect(previews).toEqual([{ params: { ParamMouthForm: 1 } }])

    nerves.tick(59_999)
    expect(reverts).toBe(0)
    nerves.tick(60_000)
    expect(reverts).toBe(1)

    expect(nerves.previewExpression({}, 70_000)).toEqual({ status: 'reverted' })
    expect(reverts).toBe(2)
  })

  it('rejects a preview call missing params, over the parameter cap, or resolving to nothing known', () => {
    const nerves = new Nerves('Hiyori')
    nerves.setInventory(INVENTORY)
    expect(() => nerves.previewExpression({ performance: 'smile' }, 0)).toThrow('params is required')
    expect(() =>
      nerves.previewExpression(
        { params: Object.fromEntries(Array.from({ length: 25 }, (_, i) => [`p${i}`, i])) },
        0
      )
    ).toThrow('24-parameter cap')
    expect(() => nerves.previewExpression({ params: { Unknown: 1 } }, 0)).toThrow('no known body parameters')
  })

  it('switches character state without touching sessions, and reverts any active preview', () => {
    let reverts = 0
    const nerves = new Nerves('First', () => true, { revertPreview: () => reverts++ })
    nerves.setInventory(INVENTORY)
    nerves.ingest(hookEvent('SessionStart', 'live-session'), 0)
    nerves.previewExpression({ params: { ParamMouthForm: 1 } }, 0)
    const sessions = nerves.sessionState(0)

    nerves.switchCharacter('Second', [
      { id: 'ParamSecond', name: 'Second', min: 0, max: 2, default: 1 }
    ])

    expect(nerves.status()).toEqual({ active_character: 'Second', protocol_version: 2 })
    expect(nerves.sessionState(0)).toEqual(sessions)
    expect(nerves.listParameters()).toEqual([
      { id: 'ParamSecond', display_name: 'Second', min: 0, max: 2, default: 1 }
    ])
    expect(reverts).toBe(1)
  })

  it('prepares a character without mutation, then commits the prepared state', () => {
    const nerves = new Nerves('First')
    nerves.setInventory(INVENTORY)

    const prepared = nerves.prepareCharacter('Second', [
      { id: 'ParamSecond', name: 'Second', min: -1, max: 1, default: 0 }
    ])

    expect(nerves.status().active_character).toBe('First')
    expect(() => nerves.commitCharacter(prepared)).not.toThrow()
    expect(nerves.status().active_character).toBe('Second')
  })
})
