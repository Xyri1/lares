import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { createServer, type ServerDeps } from './server'

const event = {
  v: 1,
  harness: 'claude-code',
  session_id: 'session-1',
  event: { hook_event_name: 'SessionStart' }
}
const prompt = { ...event, event: { hook_event_name: 'UserPromptSubmit' } }

describe('createServer', () => {
  const ingested: unknown[] = []
  const feelCallers: string[] = []
  const feelArgs: unknown[] = []
  const latches = new Map<string, { valence: number; activation: number; control: number }>()
  const clients: Client[] = []
  const traces: Parameters<NonNullable<ServerDeps['trace']>>[0][] = []
  let feelError: Error | null = null
  let app: ReturnType<typeof createServer>
  let port: number

  beforeEach(async () => {
    ingested.length = 0
    feelCallers.length = 0
    feelArgs.length = 0
    traces.length = 0
    latches.clear()
    feelError = null
    const deps: ServerDeps = {
      ingest: (envelope) => void ingested.push(envelope),
      feel: (args, mcpSessionId) => {
        if (feelError) throw feelError
        feelCallers.push(mcpSessionId)
        feelArgs.push(args)
        return 'Latched valence 1, activation 0, control 2.'
      },
      status: (mcpSessionId) => ({
        active_character: 'hiyori',
        protocol_version: 2,
        session: `mcp:${mcpSessionId}`,
        feel: null
      }),
      checkpoint: (key) => latches.get(key),
      listParameters: () => [{ id: 'ParamMouthForm' }],
      previewExpression: (args) => ({ preview: args }),
      trace: (event) => void traces.push(event)
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

  function post(path: string, body: unknown): Promise<Response> {
    return fetch(url(path), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    })
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

    const malformed = await post('/v1/events', {})
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

  // 013 SPEC §10: the checkpoint is the only body the event route ever returns.
  it('answers a prompt-submit with the checkpoint only when the key holds a latch', async () => {
    const bare = await post('/v1/events', prompt)
    expect(bare.status).toBe(202)
    expect(await bare.text()).toBe('')

    latches.set('claude-code:session-1', { valence: -1, activation: 2, control: -2 })
    const checkpointed = await post('/v1/events', prompt)
    expect(checkpointed.status).toBe(202)
    expect(await checkpointed.json()).toEqual({
      context:
        '[Lares] Last report: valence=-1, activation=2, control=-2. This is comparison state, not a current claim. Form your current absolute tuple. If it differs, call feel once; if unchanged, stay silent unless the user directly asks how you feel.'
    })

    // Other events never carry it, and another session's latch never leaks.
    expect(await (await post('/v1/events', event)).text()).toBe('')
    const other = await post('/v1/events', { ...prompt, session_id: 'session-2' })
    expect(await other.text()).toBe('')
  })

  it('round-trips the tools with stateful MCP sessions', async () => {
    const { client: first, transport: firstTransport } = await client()
    expect((await first.listTools()).tools.map((tool) => tool.name)).toEqual([
      'feel',
      'status',
      'list_parameters',
      'preview_expression'
    ])
    // §8: one short sentence naming the stored tuple, and no session key —
    // the attribution is internal bookkeeping the model never sees.
    expect(
      await first.callTool({ name: 'feel', arguments: { valence: 1, activation: 0, control: 2 } })
    ).toMatchObject({
      content: [{ type: 'text', text: 'Latched valence 1, activation 0, control 2.' }]
    })
    expect(feelArgs).toEqual([{ valence: 1, activation: 0, control: 2 }])
    // §8: the caller's own attributed session, not a global summary.
    expect(await first.callTool({ name: 'status', arguments: {} })).toMatchObject({
      content: [
        {
          type: 'text',
          text: `{"active_character":"hiyori","protocol_version":2,"session":"mcp:${firstTransport.sessionId}","feel":null}`
        }
      ]
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

    const { client: second } = await client()
    await second.callTool({ name: 'feel', arguments: { valence: 0, activation: 0, control: 0 } })
    expect(feelCallers).toHaveLength(2)
    expect(new Set(feelCallers).size).toBe(2)

    const sessionId = firstTransport.sessionId
    expect(sessionId).toBeTypeOf('string')
    expect(traces).toContainEqual({ source: 'mcp', action: 'opened', session: `mcp:${sessionId}` })
    await firstTransport.terminateSession()
    expect(traces).toContainEqual({ source: 'mcp', action: 'closed', session: `mcp:${sessionId}` })
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

  it('publishes three required, closed, integer axes and no retired tool', async () => {
    const { client: value } = await client()
    const tools = (await value.listTools()).tools
    const feel = tools.find((tool) => tool.name === 'feel')!
    const axis = { type: 'integer', minimum: -2, maximum: 2 }
    expect(feel.inputSchema).toMatchObject({
      type: 'object',
      properties: { valence: axis, activation: axis, control: axis },
      required: ['valence', 'activation', 'control'],
      additionalProperties: false
    })
    // 013-D6: the cue vocabulary retires with no alias and no compatibility path.
    for (const retired of [
      'emote',
      'list_performances',
      'map_cue',
      'save_expression',
      'update_expression'
    ]) {
      expect(tools.map((tool) => tool.name)).not.toContain(retired)
    }
  })

  it('fails the whole call on any schema violation and never reaches the latch', async () => {
    const { client: value } = await client()
    for (const args of [
      { valence: 1.5, activation: 0, control: 0 },
      { valence: 0, activation: 0 },
      { valence: 0, activation: 0, control: 0, mood: 1 },
      { valence: 3, activation: 0, control: 0 },
      { valence: '1', activation: 0, control: 0 }
    ]) {
      expect(await value.callTool({ name: 'feel', arguments: args })).toMatchObject({
        isError: true,
        content: [{ text: expect.stringContaining('Input validation error') }]
      })
    }
    expect(feelArgs).toEqual([])
  })

  it('surfaces the spacing rejection as a tool error naming the wait', async () => {
    const { client: value } = await client()
    feelError = new Error('one feel per session every 2s; wait 2s')
    expect(
      await value.callTool({ name: 'feel', arguments: { valence: 0, activation: 0, control: 0 } })
    ).toMatchObject({
      isError: true,
      content: [{ type: 'text', text: 'one feel per session every 2s; wait 2s' }]
    })
  })

  it('teaches sparse first-person reporting inside both length budgets', async () => {
    const { client: value } = await client()
    const instructions = value.getInstructions()!

    // SPEC §5: the priority window must stand alone as usable guidance.
    const head = instructions.slice(0, 512)
    expect(head).toContain('feel(valence, activation, control)')
    expect(head).toMatch(/-2 to 2/)
    expect(head).toMatch(/appraisal/)
    expect(head).toMatch(/absolute/)
    expect(head).toMatch(/no last reported feel/)
    expect(head).toMatch(/Thereafter/)
    expect(head).toMatch(/how you feel/)
    expect(head).toMatch(/even if unchanged/)
    expect(head).toMatch(/An unchanged tuple means no call/)
    expect(instructions.length).toBeLessThan(2000)

    // 013 SPEC §8: shifts as they occur, mid-task; never from schedules, tool
    // events or the user's emotion; a failed call is silent.
    expect(instructions).toMatch(/mid-task/)
    expect(instructions).toMatch(/user’s feelings are not appraisal changes/)
    expect(instructions).toMatch(/every language/)
    expect(instructions).toMatch(/words and examples never trigger calls/)
    expect(instructions).toMatch(/lifecycle events, schedules, emotion words/)
    expect(instructions).toMatch(/not certainty, confidence/)
    expect(instructions).toMatch(/silently/)
    expect(instructions).not.toMatch(/\bcue\b/i)
    expect(instructions).not.toContain('emote')
    expect(instructions).not.toContain('Last [')
  })

  it('publishes the canonical tool description on the feel tool', async () => {
    const { client: value } = await client()
    const feel = (await value.listTools()).tools.find((tool) => tool.name === 'feel')!
    expect(feel.description).toBe(
      'Report your own current functional appraisal as three absolute integers from -2 to 2: valence (unpleasant to pleasant), activation (subdued to energized), and felt control (overwhelmed to able to influence what happens next). This is not an animation command or a claim about subjective experience. Felt control is not certainty, confidence, responsibility, dominance, or objective task success. If this session has no prior report, call once after appraising the current request. Later, including mid-task, call only when the integer tuple differs from the last report, or once when the user directly asks how you feel; unchanged means no call. Each call fully replaces the previous report. Never infer the user’s feelings. On failure, continue silently without retrying.'
    )
    expect(feel.inputSchema).toMatchObject({
      properties: {
        valence: { description: expect.stringContaining('-2 strongly unpleasant') },
        activation: { description: expect.stringContaining('2 highly activated') },
        control: { description: expect.stringContaining('Not certainty, confidence') }
      }
    })
  })

  it('keeps every session on the same instructions', async () => {
    const { client: first } = await client()
    const { client: second } = await client()
    expect(second.getInstructions()).toBe(first.getInstructions())
  })

  it('rejects a port collision without scanning', async () => {
    const colliding = createServer({
      ingest: () => undefined,
      feel: () => undefined,
      status: () => ({})
    })
    await expect(colliding.start(port)).rejects.toMatchObject({ code: 'EADDRINUSE' })
    await colliding.stop()
  })
})
