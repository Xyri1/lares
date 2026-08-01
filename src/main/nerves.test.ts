import { describe, expect, it } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import {
  performanceInventory,
  resolveCanonicalCue,
  statusMappings,
  type CanonicalCue,
  type CueMappings
} from './cues'
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

const HOOK_PERFORMANCES: Partial<Record<CanonicalCue, string>> = {
  concern: 'concern-beat',
  frustration: 'frustration-beat',
  relief: 'relief-beat',
  satisfaction: 'satisfaction-beat'
}

function hookNerves(pidProbe?: (pid: number) => boolean): Nerves {
  return new Nerves(
    'Hook Lar',
    {
      'baseline-error': { valence: -0.2, arousal: 0.45 },
      'concern-beat': { valence: -0.25, arousal: 0.15 },
      'frustration-beat': { valence: -0.5, arousal: 0.35 },
      'relief-beat': { valence: 0.35, arousal: 0.1 },
      'satisfaction-beat': { valence: 0.5, arousal: 0.05 }
    },
    0,
    pidProbe,
    { resolveHookCue: (cue) => HOOK_PERFORMANCES[cue] }
  )
}

function hookEvent(
  hook_event_name: string,
  session_id = 'session-a',
  harness: 'claude-code' | 'codex' = 'claude-code'
) {
  return { v: 1 as const, harness, session_id, event: { hook_event_name } }
}

describe('Nerves deterministic hook beats', () => {
  it('makes concern the active error expression on the first consecutive PostToolUseFailure', () => {
    const nerves = hookNerves()

    nerves.ingest(hookEvent('UserPromptSubmit'), 0)
    nerves.ingest(hookEvent('PostToolUseFailure'), 2000)

    expect(nerves.status(2000).active_expression).toBe('concern-beat')
    expect(nerves.snapshot().expressionStack).toEqual([
      { cueOrFreeform: 'concern-beat', weight: 1, expiryMs: Infinity }
    ])
  })

  it('replaces active concern with frustration on the third consecutive PostToolUseFailure', () => {
    const nerves = hookNerves()

    nerves.ingest(hookEvent('UserPromptSubmit'), 0)
    nerves.ingest(hookEvent('PostToolUseFailure'), 2000)
    nerves.ingest(hookEvent('PostToolUseFailure'), 4000)
    expect(nerves.status(4000).active_expression).toBe('concern-beat')

    nerves.ingest(hookEvent('PostToolUseFailure'), 6000)
    nerves.ingest(hookEvent('PostToolUseFailure'), 8000)

    expect(nerves.status(8000).active_expression).toBe('frustration-beat')
    expect(nerves.snapshot().expressionStack).toEqual([
      { cueOrFreeform: 'frustration-beat', weight: 1, expiryMs: Infinity }
    ])
  })

  it('clears error preemption and stale failure beats before recovery relief', () => {
    const nerves = hookNerves()

    nerves.ingest(hookEvent('UserPromptSubmit'), 0)
    nerves.ingest(hookEvent('PostToolUseFailure'), 2000)
    nerves.ingest(hookEvent('PostToolUseFailure'), 4000)
    nerves.ingest(hookEvent('PostToolUseFailure'), 6000)
    nerves.ingest(hookEvent('PostToolUse'), 8000)
    nerves.ingest(hookEvent('PostToolUse'), 10_000)

    expect(nerves.snapshot().expressionStack.map((entry) => entry.cueOrFreeform)).toEqual([
      'relief-beat'
    ])
    expect(nerves.status(10_000).active_expression).toBe('relief-beat')
  })

  it('queues satisfaction when Stop follows a successful tool-bearing turn', () => {
    const nerves = hookNerves()

    nerves.ingest(hookEvent('UserPromptSubmit'), 0)
    nerves.ingest(hookEvent('PreToolUse'), 1000)
    nerves.ingest(hookEvent('PostToolUse'), 2000)
    nerves.ingest(hookEvent('Stop'), 4000)

    expect(nerves.status(4000).active_expression).toBe('satisfaction-beat')
  })

  it('keeps the immediate failure beat harmless when the expression queue is full', () => {
    const nerves = hookNerves()
    for (let index = 0; index < 4; index++) {
      nerves.emote({ cue: 'satisfaction-beat' }, `mcp:${index}`, 0)
    }

    expect(() => nerves.ingest(hookEvent('PostToolUseFailure'), 2000)).not.toThrow()
    expect(nerves.snapshot().baselineState).toBe('error')
    expect(nerves.snapshot().expressionStack[0]).toEqual({
      cueOrFreeform: 'concern-beat',
      weight: 1,
      expiryMs: Infinity
    })
  })

  it('keeps routine hooks baseline-only and permission as awaiting_input preemption', () => {
    const nerves = hookNerves()

    nerves.ingest(hookEvent('UserPromptSubmit', 'codex-turn', 'codex'), 0)
    nerves.ingest(hookEvent('PreToolUse', 'codex-turn', 'codex'), 1000)
    nerves.ingest(hookEvent('PostToolUse', 'codex-turn', 'codex'), 2000)
    expect(nerves.snapshot().expressionStack).toEqual([])

    nerves.ingest(hookEvent('PermissionRequest', 'codex-turn', 'codex'), 3000)
    expect(nerves.snapshot()).toMatchObject({
      baselineState: 'awaiting_input',
      expressionStack: [{ expiryMs: Infinity }]
    })
  })

  it('keeps awaiting_input louder than an error beat from another session', () => {
    const nerves = hookNerves()

    nerves.ingest(hookEvent('PermissionRequest', 'waiting', 'codex'), 1000)
    nerves.ingest(hookEvent('PostToolUseFailure', 'failing'), 2000)

    expect(nerves.snapshot()).toMatchObject({
      baselineState: 'awaiting_input',
      expressionStack: [{ expiryMs: Infinity }]
    })
    expect(nerves.snapshot().expressionStack).toHaveLength(1)

    nerves.ingest(hookEvent('Stop', 'waiting', 'codex'), 4000)
    expect(nerves.status(4000).active_expression).toBe('concern-beat')
  })

  it('resets failure history at UserPromptSubmit', () => {
    const nerves = hookNerves()

    nerves.ingest(hookEvent('PostToolUseFailure'), 2000)
    nerves.ingest(hookEvent('UserPromptSubmit'), 4000)
    expect(nerves.snapshot().expressionStack).toEqual([])

    nerves.ingest(hookEvent('PostToolUseFailure'), 6000)
    nerves.ingest(hookEvent('PostToolUseFailure'), 8000)
    expect(nerves.status(8000).active_expression).toBe('concern-beat')
    nerves.ingest(hookEvent('PostToolUseFailure'), 10_000)

    expect(nerves.status(10_000).active_expression).toBe('frustration-beat')
  })

  it('does not satisfy unresolved failures and resets their history after Stop', () => {
    const nerves = hookNerves()

    nerves.ingest(hookEvent('PostToolUseFailure'), 2000)
    nerves.ingest(hookEvent('Stop'), 4000)
    expect(nerves.status(4000).active_expression).toBeNull()

    nerves.ingest(hookEvent('PostToolUseFailure'), 6000)

    expect(nerves.status(6000).active_expression).toBe('concern-beat')
  })

  it('allows recovery relief followed by Stop satisfaction', () => {
    const nerves = hookNerves()

    nerves.ingest(hookEvent('PostToolUseFailure'), 2000)
    nerves.ingest(hookEvent('PostToolUse'), 4000)
    nerves.ingest(hookEvent('Stop'), 6000)

    expect(nerves.snapshot().expressionStack.map((entry) => entry.cueOrFreeform)).toEqual([
      'relief-beat',
      'satisfaction-beat'
    ])
  })

  it('keeps failure history independent for identical session ids from different harnesses', () => {
    const nerves = hookNerves()

    nerves.ingest(hookEvent('PostToolUseFailure', 'shared', 'claude-code'), 2000)
    nerves.ingest(hookEvent('UserPromptSubmit', 'shared', 'codex'), 3000)
    nerves.ingest(hookEvent('PostToolUseFailure', 'shared', 'claude-code'), 4000)
    nerves.ingest(hookEvent('PostToolUseFailure', 'shared', 'claude-code'), 6000)

    expect(nerves.status(6000).active_expression).toBe('frustration-beat')
  })

  it('recovers sessions independently without masking a remaining error', () => {
    const nerves = hookNerves()

    nerves.ingest(hookEvent('PostToolUseFailure', 'session-a'), 2000)
    nerves.ingest(hookEvent('PostToolUseFailure', 'session-a'), 3000)
    nerves.ingest(hookEvent('PostToolUseFailure', 'session-b'), 3500)
    nerves.ingest(hookEvent('PostToolUseFailure', 'session-a'), 4000)
    nerves.ingest(hookEvent('PostToolUse', 'session-a'), 6000)

    expect(nerves.status(6000).active_expression).toBe('concern-beat')

    nerves.ingest(hookEvent('PostToolUse', 'session-b'), 8000)
    expect(nerves.snapshot().expressionStack.map((entry) => entry.cueOrFreeform)).toEqual([
      'relief-beat',
      'relief-beat'
    ])
  })

  it('does not let a retrying session mask another session still in error', () => {
    const nerves = hookNerves()

    nerves.ingest(hookEvent('PostToolUseFailure', 'session-a'), 2000)
    nerves.ingest(hookEvent('PostToolUseFailure', 'session-b'), 2500)
    nerves.ingest(hookEvent('PostToolUseFailure', 'session-b'), 3000)
    nerves.ingest(hookEvent('PostToolUseFailure', 'session-b'), 3500)
    expect(nerves.status(3500).active_expression).toBe('frustration-beat')

    nerves.ingest(hookEvent('PreToolUse', 'session-b'), 4000)
    expect(nerves.status(4000).active_expression).toBe('concern-beat')

    nerves.ingest(hookEvent('PostToolUseFailure', 'session-b'), 5000)
    expect(nerves.status(5000).active_expression).toBe('frustration-beat')
  })

  it('removes a PID-reaped session beat while preserving another live error', () => {
    const livePids = new Set([101, 202])
    const nerves = hookNerves((pid) => livePids.has(pid))

    nerves.ingest({ ...hookEvent('PostToolUseFailure', 'session-a'), pid: 101 }, 2000)
    nerves.ingest({ ...hookEvent('PostToolUseFailure', 'session-b'), pid: 202 }, 2500)
    nerves.ingest({ ...hookEvent('PostToolUseFailure', 'session-b'), pid: 202 }, 3000)
    nerves.ingest({ ...hookEvent('PostToolUseFailure', 'session-b'), pid: 202 }, 3500)
    expect(nerves.status(3500).active_expression).toBe('frustration-beat')

    livePids.delete(202)
    nerves.tick(30_000)

    expect(nerves.status(30_000)).toMatchObject({
      active_expression: 'concern-beat',
      sessions: { sessions: [{ session_id: 'session-a' }] }
    })
  })

  it('clears failure and successful-turn history when SessionEnd arrives', () => {
    const nerves = hookNerves()

    nerves.ingest(hookEvent('PostToolUseFailure'), 2000)
    nerves.ingest(hookEvent('SessionEnd'), 3000)
    nerves.ingest(hookEvent('PostToolUseFailure'), 4000)
    nerves.ingest(hookEvent('PostToolUseFailure'), 5000)
    expect.soft(nerves.status(5000).active_expression).toBe('concern-beat')

    nerves.ingest(hookEvent('PostToolUse'), 7000)
    nerves.ingest(hookEvent('SessionEnd'), 8000)
    nerves.ingest(hookEvent('Stop'), 9000)

    expect
      .soft(nerves.snapshot().expressionStack.map((entry) => entry.cueOrFreeform))
      .toEqual(['relief-beat'])
  })

  it('preserves ordinary error preemption when the failure cue is unmapped', () => {
    const nerves = new Nerves('Hook Lar', { 'baseline-error': { valence: -0.2, arousal: 0.45 } }, 0)

    nerves.ingest(hookEvent('PostToolUseFailure'), 2000)

    expect(nerves.status(2000).active_expression).toBe('baseline-error')
    expect(nerves.snapshot().expressionStack).toEqual([
      { cueOrFreeform: 'baseline-error', weight: 1, expiryMs: Infinity }
    ])
  })
})

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
      protocol_version: 2,
      sessions: { baseline: 'thinking', sessions: [{ session_id: 's1' }] }
    })
  })

  it('keeps its performance-name vocabulary out of the canonical protocol (011-D12)', () => {
    const nerves = new Nerves('Hiyori', CUES, 0)
    expect(nerves.emote({ cue: 'pleased' }, 'agent', 0)).toEqual({ status: 'played' })
    expect(() => nerves.emote({ cue: 'satisfaction' }, 'agent-2', 0)).toThrow('unknown cue')
    expect(nerves.listCues().map((cue) => cue.name)).toEqual(['pleased', 'frustrated'])
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
    expect(nerves.status(0).uncalibrated_performances).toBe(1)
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
    expect(nerves.previewExpression({ performance: 'smile' }, 200)).toEqual({ status: 'previewing' })
    expect(previews).toEqual([
      { params: { ParamMouthForm: -1 } },
      { params: { ParamMouthForm: 1 } }
    ])
    nerves.tick(60_199)
    expect(reverts).toBe(0)
    nerves.tick(60_200)
    expect(reverts).toBe(1)

    expect(nerves.previewExpression({ performance: 'wave' }, 70_000)).toEqual({ status: 'played' })
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
    expect(() => nerves.previewExpression({ performance: 'bad' }, 0)).toThrow(
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

  it('fails an incomplete character closed without touching affect or playback', async () => {
    const nerves = new Nerves('Imported', CUES, 0, undefined, {})
    nerves.setInventory(INVENTORY)
    const missing: CanonicalCue[] = ['uncertainty', 'concern', 'frustration', 'relief', 'satisfaction']
    const server = createServer({
      ingest: (envelope, at) => nerves.ingest(envelope, at),
      emote: (args, source, at) => {
        const raw = args as Record<string, unknown>
        if (!Object.hasOwn(raw, 'cue')) return nerves.emote(raw, source, at)
        const { cue, performance } = resolveCanonicalCue(raw.cue, { discovery: 'pleased' }, missing)
        return { ...nerves.emote({ ...raw, cue: performance }, source, at), cue, performance }
      },
      listPerformances: () => performanceInventory(nerves.listCues(), {}, { discovery: 'pleased' }),
      status: (at) => ({ ...nerves.status(at), ...statusMappings({ discovery: 'pleased' }, missing) })
    })
    const port = await server.start(0)
    const client = new Client({ name: 'nerves-test', version: '1.0.0' })
    try {
      await client.connect(
        new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/v1/mcp`))
      )
      const before = nerves.snapshot()
      const refused = (await client.callTool({
        name: 'emote',
        arguments: { cue: 'discovery' }
      })) as { isError?: boolean; content: Array<{ text: string }> }
      expect(refused.isError).toBe(true)
      expect(refused.content[0].text).toBe(
        'character_not_calibrated: missing uncertainty, concern, frustration, relief, satisfaction'
      )
      expect(nerves.snapshot()).toEqual(before)

      // The params escape hatch is unaffected by canonical readiness.
      expect(
        (await client.callTool({ name: 'emote', arguments: { params: { ParamMouthForm: 1 } } })) as {
          isError?: boolean
        }
      ).not.toMatchObject({ isError: true })
      expect(nerves.snapshot().expressionStack).toHaveLength(1)
    } finally {
      await client.close()
      await server.stop()
    }
  })

  it('round-trips the real MCP server through canonical resolution into the snapshot', async () => {
    const nowMs = Date.now()
    const nerves = new Nerves('Hiyori', CUES, nowMs)
    // Duplicate targets are legal (011-D5); both share the performance's history.
    const mappings: CueMappings = {
      discovery: 'pleased',
      uncertainty: 'frustrated',
      concern: 'frustrated',
      frustration: 'frustrated',
      relief: 'pleased',
      satisfaction: 'pleased'
    }
    const server = createServer({
      ingest: (envelope, at) => nerves.ingest(envelope, at),
      emote: (args, source, at) => {
        const raw = args as Record<string, unknown>
        const { cue, performance } = resolveCanonicalCue(raw.cue, mappings, [])
        return { ...nerves.emote({ ...raw, cue: performance }, source, at), cue, performance }
      },
      listPerformances: () => performanceInventory(nerves.listCues(), {}, mappings),
      status: (at) => ({ ...nerves.status(at), ...statusMappings(mappings, []) })
    })
    const port = await server.start(0)
    const client = new Client({ name: 'nerves-test', version: '1.0.0' })
    const parse = (result: unknown): unknown =>
      JSON.parse((result as { content: Array<{ text: string }> }).content[0].text)
    try {
      await client.connect(
        new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/v1/mcp`))
      )
      expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual([
        'emote',
        'list_performances',
        'status',
        'list_parameters',
        'preview_expression',
        'map_cue',
        'save_expression',
        'update_expression'
      ])
      expect(parse(await client.callTool({ name: 'emote', arguments: { cue: 'satisfaction' } }))).toEqual({
        status: 'played',
        cue: 'satisfaction',
        performance: 'pleased'
      })
      expect(nerves.snapshot().expressionStack[0].cueOrFreeform).toBe('pleased')
      expect(parse(await client.callTool({ name: 'status', arguments: {} }))).toMatchObject({
        active_character: 'Hiyori',
        protocol_version: 2,
        active_expression: 'pleased',
        missing_cues: [],
        cue_mappings: mappings
      })
    } finally {
      await client.close()
      await server.stop()
    }
  })
})
