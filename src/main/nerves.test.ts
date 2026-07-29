import { describe, expect, it } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { Nerves } from './nerves'
import { createServer } from './server/server'

const CUES = {
  pleased: { valence: 0.2, arousal: 0.1 },
  frustrated: { valence: -0.3, arousal: 0.2 }
}

const INVENTORY = [
  { id: 'ParamMouthForm', name: 'Mouth form', min: -1, max: 1, default: 0 },
  { id: 'ParamAngleY', name: 'Head Y', min: -30, max: 30, default: 0 }
]

describe('Nerves emote ingress', () => {
  it('requires exactly one branch and a body inventory for params', () => {
    const nerves = new Nerves('Hiyori', CUES, 0)
    expect(() => nerves.emote({}, 'a', 0)).toThrow('exactly one')
    expect(() => nerves.emote({ cue: 'pleased', params: {} }, 'a', 0)).toThrow('exactly one')
    expect(() => nerves.emote({ params: { ParamMouthForm: 1 } }, 'a', 0)).toThrow('inventory')
  })

  it('clamps freeform values and duration, drops unknown ids, and warns on intensity', () => {
    const nerves = new Nerves('Hiyori', CUES, 0)
    expect(nerves.setInventory(INVENTORY)).toBe(true)
    expect(
      nerves.emote(
        {
          params: { ParamMouthForm: 10, ParamAngleY: -100, Unknown: 1 },
          intensity: 0.2,
          duration_s: 999,
          label: 'wry'
        },
        'a',
        0
      )
    ).toEqual({ status: 'played', warning: 'intensity is ignored for params' })
    expect(nerves.snapshot().expressionStack).toEqual([
      {
        cueOrFreeform: {
          params: { ParamMouthForm: 1, ParamAngleY: -30 },
          label: 'wry'
        },
        weight: 1,
        expiryMs: 30_000
      }
    ])
  })

  it('rejects more than 24 params and a fifth queued expression', () => {
    const nerves = new Nerves('Hiyori', CUES, 0)
    nerves.setInventory(INVENTORY)
    expect(() =>
      nerves.emote(
        { params: Object.fromEntries(Array.from({ length: 25 }, (_, i) => [`p${i}`, i])) },
        'a',
        0
      )
    ).toThrow('24-parameter cap')

    for (let i = 0; i < 4; i++) {
      expect(nerves.emote({ cue: 'pleased', duration_s: 1 }, `source-${i}`, 0)).toEqual({
        status: 'played'
      })
    }
    expect(() => nerves.emote({ cue: 'pleased' }, 'source-4', 0)).toThrow('queue is full')
  })

  it('coalesces per source while preserving saturation-scaled feeling', () => {
    const nerves = new Nerves('Hiyori', CUES, 0)
    expect(nerves.emote({ cue: 'pleased' }, 'a', 0)).toEqual({ status: 'played' })
    expect(nerves.emote({ cue: 'pleased' }, 'a', 1000)).toEqual({ status: 'coalesced' })
    expect(nerves.snapshot().expressionStack).toHaveLength(1)
    expect(nerves.snapshot().E.valence).toBeCloseTo(0.4)

    expect(nerves.emote({ cue: 'pleased' }, 'b', 1000)).toEqual({ status: 'played' })
    expect(nerves.snapshot().expressionStack).toHaveLength(2)
    expect(nerves.snapshot().E.valence).toBeCloseTo(0.6)
  })

  it('queue false replaces pending expressions', () => {
    const nerves = new Nerves('Hiyori', CUES, 0)
    nerves.emote({ cue: 'pleased' }, 'a', 0)
    nerves.emote({ cue: 'frustrated', queue: false }, 'b', 0)
    expect(nerves.snapshot().expressionStack).toHaveLength(1)
    expect(nerves.snapshot().expressionStack[0].cueOrFreeform).toBe('frustrated')
  })

  it('reports the active character, sessions, cues, and protocol version', () => {
    const nerves = new Nerves('Hiyori', CUES, 0, () => true)
    nerves.ingest(
      {
        v: 1,
        harness: 'claude-code',
        session_id: 's1',
        event: { hook_event_name: 'SessionStart' }
      },
      0
    )
    expect(nerves.listCues()[0]).toMatchObject({ name: 'pleased', source: 'bundled' })
    expect(nerves.status(0)).toMatchObject({
      active_character: 'Hiyori',
      protocol_version: 1,
      sessions: { baseline: 'thinking', sessions: [{ session_id: 's1' }] }
    })
  })

  it('keeps null-coordinate cues directly emote-able but out of autonomous selection', () => {
    const nerves = new Nerves(
      'Imported',
      { mapped: { valence: 0.4, arousal: 0.2 }, unmapped: null },
      0
    )
    expect(nerves.emote({ cue: 'unmapped' }, 'agent', 0)).toEqual({ status: 'played' })
    expect(nerves.snapshot().E).toEqual({ valence: 0.1, arousal: 0.25 })
    expect(nerves.listCues()).toContainEqual({
      name: 'unmapped',
      valence: null,
      arousal: null,
      calibrated: false,
      source: 'bundled'
    })
    expect(nerves.status(0).uncalibrated_cues).toBe(1)
  })

  it('resolves cue params through inventory and holds, replaces, reverts, and times out previews', () => {
    const previews: unknown[] = []
    let reverts = 0
    const nerves = new Nerves(
      'Imported',
      {
        smile: { valence: 0.4, arousal: 0.2 },
        wave: null
      },
      0,
      undefined,
      {
        resolveCue: (cue) =>
          cue === 'smile' ? { params: { ParamMouthForm: 9 } } : { motion: 'runtime/wave.motion3.json' },
        preview: (value) => previews.push(value),
        revertPreview: () => reverts++
      }
    )
    nerves.setInventory(INVENTORY)
    expect(nerves.listParameters()[0]).toMatchObject({
      id: 'ParamMouthForm',
      display_name: 'Mouth form'
    })

    nerves.emote({ cue: 'smile' }, 'agent', 0)
    expect(nerves.snapshot().expressionStack[0].cueOrFreeform).toEqual({
      params: { ParamMouthForm: 1 },
      label: 'smile'
    })
    expect(nerves.previewExpression({ params: { ParamMouthForm: -9 } }, 100)).toEqual({
      status: 'previewing'
    })
    expect(nerves.previewExpression({ cue: 'smile' }, 200)).toEqual({ status: 'previewing' })
    expect(previews).toEqual([
      { params: { ParamMouthForm: -1 } },
      { params: { ParamMouthForm: 1 } }
    ])
    nerves.tick(60_199)
    expect(reverts).toBe(0)
    nerves.tick(60_200)
    expect(reverts).toBe(1)

    expect(nerves.previewExpression({ cue: 'wave' }, 70_000)).toEqual({ status: 'played' })
    expect(previews.at(-1)).toEqual({ cue: 'wave' })
    expect(nerves.previewExpression({}, 70_001)).toEqual({ status: 'reverted' })
    expect(reverts).toBe(2)
  })

  it('retains post-load cue validation errors for the app to surface loudly', () => {
    const nerves = new Nerves(
      'Broken',
      { bad: null },
      0,
      undefined,
      {
        resolveCue: () => {
          throw new Error('Cue "bad": unknown parameter "Missing"')
        }
      }
    )
    expect(nerves.setInventory(INVENTORY)).toBe(true)
    expect(nerves.cueValidationErrors()).toEqual([
      'Cue "bad": unknown parameter "Missing"'
    ])
    expect(() => nerves.previewExpression({ cue: 'bad' }, 0)).toThrow(
      'has no parameters'
    )
  })

  it('switches character state without resetting sessions, affect, mood, or baseline', () => {
    let reverts = 0
    const nerves = new Nerves('First', CUES, 0, () => true, {
      cueSources: { pleased: 'bundled', frustrated: 'bundled' },
      revertPreview: () => reverts++
    })
    nerves.setInventory(INVENTORY)
    nerves.ingest(
      {
        v: 1,
        harness: 'claude-code',
        session_id: 'live-session',
        event: { hook_event_name: 'SessionStart' }
      },
      0
    )
    nerves.emote({ cue: 'pleased' }, 'agent', 0)
    nerves.previewExpression({ params: { ParamMouthForm: 1 } }, 0)
    const before = nerves.snapshot()
    const sessions = nerves.status(0).sessions

    nerves.switchCharacter(
      'Second',
      { curious: { valence: 0.4, arousal: 0.3 } },
      { curious: 'raw' },
      [{ id: 'ParamSecond', name: 'Second', min: 0, max: 2, default: 1 }]
    )

    expect(nerves.snapshot()).toMatchObject({
      E: before.E,
      M: before.M,
      baselineState: before.baselineState,
      expressionStack: []
    })
    expect(nerves.status(0)).toMatchObject({ active_character: 'Second', sessions })
    expect(nerves.listCues()).toEqual([
      {
        name: 'curious',
        valence: 0.4,
        arousal: 0.3,
        calibrated: true,
        source: 'raw'
      }
    ])
    expect(nerves.listParameters()).toEqual([
      { id: 'ParamSecond', display_name: 'Second', min: 0, max: 2, default: 1 }
    ])
    expect(() => nerves.emote({ cue: 'pleased' }, 'agent-2', 0)).toThrow('unknown cue')
    expect(reverts).toBe(1)
  })

  it('prepares a character without mutation, then commits the prepared state', () => {
    const nerves = new Nerves('First', CUES, 0)
    nerves.setInventory(INVENTORY)

    const prepared = nerves.prepareCharacter(
      'Second',
      { same: { valence: 0.3, arousal: 0.2 } },
      { same: 'raw' },
      [{ id: 'ParamSecond', name: 'Second', min: -1, max: 1, default: 0 }],
      () => ({ params: { ParamSecond: 1 } })
    )

    expect(nerves.status(0).active_character).toBe('First')
    expect(nerves.listCues().map((cue) => cue.name)).toEqual(['pleased', 'frustrated'])
    expect(() => nerves.commitCharacter(prepared)).not.toThrow()
    expect(nerves.status(0).active_character).toBe('Second')
    expect(nerves.snapshot().expressionStack).toEqual([])
  })

  it('round-trips the real MCP server into the performance snapshot', async () => {
    const nowMs = Date.now()
    const nerves = new Nerves('Hiyori', CUES, nowMs)
    const server = createServer({
      ingest: (envelope, at) => nerves.ingest(envelope, at),
      emote: (args, source, at) => nerves.emote(args, source, at),
      listCues: () => nerves.listCues(),
      status: (at) => nerves.status(at)
    })
    const port = await server.start(0)
    const client = new Client({ name: 'nerves-test', version: '1.0.0' })
    try {
      await client.connect(
        new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/v1/mcp`))
      )
      expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual([
        'emote',
        'list_cues',
        'status',
        'list_parameters',
        'preview_expression',
        'save_expression',
        'update_expression'
      ])
      await client.callTool({ name: 'emote', arguments: { cue: 'pleased' } })
      expect(nerves.snapshot().expressionStack[0].cueOrFreeform).toBe('pleased')
      const status = await client.callTool({ name: 'status', arguments: {} })
      const content = (status as { content: Array<{ text: string }> }).content
      expect(JSON.parse(content[0].text)).toMatchObject({
        active_character: 'Hiyori',
        protocol_version: 1,
        active_expression: 'pleased'
      })
    } finally {
      await client.close()
      await server.stop()
    }
  })
})
