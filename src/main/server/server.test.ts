import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { CANONICAL_CUES } from '../cues'
import { createServer, type ServerDeps } from './server'

const event = {
  v: 1,
  harness: 'claude-code',
  session_id: 'session-1',
  event: { hook_event_name: 'SessionStart' }
}

describe('createServer', () => {
  const ingested: unknown[] = []
  const emoteSources: string[] = []
  const emoteArgs: unknown[] = []
  const clients: Client[] = []
  let app: ReturnType<typeof createServer>
  let port: number

  beforeEach(async () => {
    ingested.length = 0
    emoteSources.length = 0
    emoteArgs.length = 0
    const deps: ServerDeps = {
      ingest: (envelope) => void ingested.push(envelope),
      emote: (args, source) => {
        emoteSources.push(source)
        emoteArgs.push(args)
        return { played: true }
      },
      listPerformances: () => ({ performances: [{ name: 'Smile' }], missing_cues: [] }),
      status: () => ({ active: 'hiyori' }),
      listParameters: () => [{ id: 'ParamMouthForm' }],
      previewExpression: (args) => ({ preview: args }),
      mapCue: (args) => ({ mapped: args }),
      saveExpression: (args) => ({ saved: args }),
      updateExpression: (args) => ({ updated: args })
    }
    app = createServer(deps)
    port = await app.start(0)
  })

  afterEach(async () => {
    await Promise.all(clients.splice(0).map((client) => client.close()))
    await app.stop()
  })

  function url(path: string): string {
    return `http://127.0.0.1:${port}${path}`
  }

  async function client(): Promise<{ client: Client; transport: StreamableHTTPClientTransport }> {
    const value = new Client({ name: 'lares-test', version: '1.0.0' })
    const transport = new StreamableHTTPClientTransport(new URL(url('/v1/mcp')))
    await value.connect(transport)
    clients.push(value)
    return { client: value, transport }
  }

  it('rejects any Origin on both routes', async () => {
    for (const path of ['/v1/events', '/v1/mcp']) {
      const response = await fetch(url(path), {
        method: 'POST',
        headers: { Origin: '', 'content-type': 'application/json' },
        body: '{}'
      })
      expect(response.status).toBe(403)
    }
  })

  it('validates the event route before ingesting', async () => {
    const noType = await fetch(url('/v1/events'), { method: 'POST', body: JSON.stringify(event) })
    expect(noType.status).toBe(415)

    const falsePositive = await fetch(url('/v1/events'), {
      method: 'POST',
      headers: { 'content-type': 'text/application/json' },
      body: JSON.stringify(event)
    })
    expect(falsePositive.status).toBe(415)

    const malformed = await fetch(url('/v1/events'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}'
    })
    expect(malformed.status).toBe(422)

    const accepted = await fetch(url('/v1/events'), {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify(event)
    })
    expect(accepted.status).toBe(202)
    expect(ingested).toEqual([event])
  })

  it('returns 404 for other routes', async () => {
    expect((await fetch(url('/missing'), { method: 'POST' })).status).toBe(404)
    expect((await fetch(url('/v1/events'), { method: 'GET' })).status).toBe(404)
  })

  it('lets the SDK reject an MCP request without JSON content type', async () => {
    const response = await fetch(url('/v1/mcp'), {
      method: 'POST',
      headers: { accept: 'application/json, text/event-stream' },
      body: '{}'
    })
    expect(response.status).toBe(415)
  })

  it('round-trips the tools with stateful MCP sessions', async () => {
    const { client: first, transport: firstTransport } = await client()
    expect((await first.listTools()).tools.map((tool) => tool.name)).toEqual([
      'emote',
      'list_performances',
      'status',
      'list_parameters',
      'preview_expression',
      'map_cue',
      'save_expression',
      'update_expression'
    ])
    expect(await first.callTool({ name: 'list_performances', arguments: {} })).toMatchObject({
      content: [{ type: 'text', text: '{"performances":[{"name":"Smile"}],"missing_cues":[]}' }]
    })
    expect(await first.callTool({ name: 'status', arguments: {} })).toMatchObject({
      content: [{ type: 'text', text: '{"active":"hiyori"}' }]
    })
    expect(await first.callTool({ name: 'emote', arguments: { cue: 'relief' } })).toMatchObject({
      content: [{ type: 'text', text: '{"played":true}' }]
    })
    expect(
      await first.callTool({
        name: 'map_cue',
        arguments: { cue: 'discovery', performance: 'Smile' }
      })
    ).toMatchObject({
      content: [{ type: 'text', text: '{"mapped":{"cue":"discovery","performance":"Smile"}}' }]
    })
    expect(await first.callTool({ name: 'list_parameters', arguments: {} })).toMatchObject({
      content: [{ type: 'text', text: '[{"id":"ParamMouthForm"}]' }]
    })
    expect(
      await first.callTool({
        name: 'preview_expression',
        arguments: { params: { ParamMouthForm: 1 } }
      })
    ).toMatchObject({
      content: [{ type: 'text', text: '{"preview":{"params":{"ParamMouthForm":1}}}' }]
    })
    expect(
      await first.callTool({
        name: 'save_expression',
        arguments: {
          name: 'wry',
          params: { ParamMouthForm: 1 },
          affect: { valence: 0.2, arousal: 0.3 }
        }
      })
    ).not.toMatchObject({ isError: true })
    expect(
      await first.callTool({
        name: 'update_expression',
        arguments: { name: 'wry', affect: { valence: 0.1, arousal: 0.2 } }
      })
    ).not.toMatchObject({ isError: true })

    const { client: second } = await client()
    await second.callTool({ name: 'emote', arguments: { cue: 'relief' } })
    expect(emoteSources).toHaveLength(2)
    expect(new Set(emoteSources).size).toBe(2)
    expect(emoteSources.every((source) => source.startsWith('mcp:'))).toBe(true)

    const sessionId = firstTransport.sessionId
    expect(sessionId).toBeTypeOf('string')
    await firstTransport.terminateSession()
    const closed = await fetch(url('/v1/mcp'), {
      method: 'POST',
      headers: {
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
        'mcp-session-id': sessionId as string
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} })
    })
    expect(closed.status).toBe(404)
  })

  it('publishes the canonical enum and no free-string cue', async () => {
    const { client: value } = await client()
    const tools = (await value.listTools()).tools
    const emote = tools.find((tool) => tool.name === 'emote')!
    const properties = emote.inputSchema.properties as Record<string, { enum?: unknown }>
    expect(properties.cue.enum).toEqual([...CANONICAL_CUES])
    expect(
      (tools.find((tool) => tool.name === 'map_cue')!.inputSchema.properties as Record<
        string,
        { enum?: unknown }
      >).cue.enum
    ).toEqual([...CANONICAL_CUES])

    // The schema is the whole vocabulary, so cue discovery is gone (SPEC §2).
    expect(tools.map((tool) => tool.name)).not.toContain('list_cues')
    expect(await value.callTool({ name: 'emote', arguments: { cue: 'Smile' } })).toMatchObject({
      isError: true
    })
    expect(emoteSources).toHaveLength(0)

    // The params escape hatch keeps its free shape and reaches the app untouched.
    expect(
      await value.callTool({
        name: 'emote',
        arguments: { params: { ParamMouthForm: 1 }, label: 'wry', intensity: 0.5 }
      })
    ).not.toMatchObject({ isError: true })
    expect(emoteArgs).toEqual([{ params: { ParamMouthForm: 1 }, label: 'wry', intensity: 0.5 }])
  })

  it('teaches sparse first-person semantics inside both length budgets', async () => {
    const { client: value } = await client()
    const instructions = value.getInstructions()!

    // SPEC §5: a client that truncates server guidance still gets a usable rule.
    const head = instructions.slice(0, 512)
    expect(head).toContain('emote')
    for (const cue of CANONICAL_CUES) expect(head).toContain(cue)
    expect(head).toMatch(/appraisal/)
    expect(instructions.length).toBeLessThan(2000)

    expect(instructions).toMatch(/never the user’s feelings/)
    expect(instructions).toMatch(/every language/)
    expect(instructions).toMatch(/no word triggers a call/)
    expect(instructions).toMatch(/silently/)
    expect(instructions).toContain('character_not_calibrated')
    // 011-D9: no calibration invitation, no lifecycle checklist.
    expect(instructions).not.toMatch(/calibrat(e|ion) (Lar|your)/i)
    expect(instructions).not.toContain('list_cues')
    expect(instructions).not.toContain('map_cue')
  })

  it('publishes the direct semantic request rule in initialization and emote metadata', async () => {
    const { client: value } = await client()
    const instructions = value.getInstructions()!
    const emote = (await value.listTools()).tools.find((tool) => tool.name === 'emote')!
    const directRequest =
      'When the user directly asks you to express your current appraisal, emit exactly one appropriate cue even without an appraisal shift.'

    expect.soft(instructions).toContain(directRequest)
    expect.soft(emote.description).toContain(directRequest)
    for (const surface of [instructions, emote.description!]) {
      expect(surface).toMatch(/semantic/)
      expect(surface).toMatch(/no word triggers/)
      expect(surface).toMatch(/do not use word or phrase matching/i)
      expect(surface).toMatch(/never the user’s feelings/)
    }
  })

  it('keeps every session on the same instructions', async () => {
    const { client: first } = await client()
    const { client: second } = await client()
    expect(second.getInstructions()).toBe(first.getInstructions())
  })

  it('rejects a port collision without scanning', async () => {
    const colliding = createServer({
      ingest: () => undefined,
      emote: () => undefined,
      listPerformances: () => ({ performances: [], missing_cues: [] }),
      status: () => ({})
    })
    await expect(colliding.start(port)).rejects.toMatchObject({ code: 'EADDRINUSE' })
    await colliding.stop()
  })
})
