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
        'status'
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
