import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { CALIBRATION_INVITE } from '../calibration'
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
  const clients: Client[] = []
  let app: ReturnType<typeof createServer>
  let port: number
  let calibrationArmed: boolean

  beforeEach(async () => {
    ingested.length = 0
    emoteSources.length = 0
    calibrationArmed = false
    const deps: ServerDeps = {
      ingest: (envelope) => void ingested.push(envelope),
      emote: (_args, source) => {
        emoteSources.push(source)
        return { played: true }
      },
      listCues: () => [{ id: 'pleased' }],
      status: () => ({ active: 'hiyori' }),
      listParameters: () => [{ id: 'ParamMouthForm' }],
      previewExpression: (args) => ({ preview: args }),
      saveExpression: (args) => ({ saved: args }),
      updateExpression: (args) => ({ updated: args }),
      sessionInstructions: () => (calibrationArmed ? CALIBRATION_INVITE : undefined)
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
    expect(first.getInstructions()).toContain('meaningful beats')
    expect((await first.listTools()).tools.map((tool) => tool.name)).toEqual([
      'emote',
      'list_cues',
      'status',
      'list_parameters',
      'preview_expression',
      'save_expression',
      'update_expression'
    ])
    expect(await first.callTool({ name: 'list_cues', arguments: {} })).toMatchObject({
      content: [{ type: 'text', text: '[{"id":"pleased"}]' }]
    })
    expect(await first.callTool({ name: 'status', arguments: {} })).toMatchObject({
      content: [{ type: 'text', text: '{"active":"hiyori"}' }]
    })
    expect(await first.callTool({ name: 'emote', arguments: { cue: 'pleased' } })).toMatchObject({
      content: [{ type: 'text', text: '{"played":true}' }]
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
    await second.callTool({ name: 'emote', arguments: { cue: 'pleased' } })
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

  it('adds the calibration invite only to sessions initialized while armed', async () => {
    const { client: existing } = await client()
    const base = existing.getInstructions()
    expect(base).toContain('meaningful beats')
    expect(base).not.toContain(CALIBRATION_INVITE)

    calibrationArmed = true
    const { client: armed } = await client()
    expect(armed.getInstructions()).toContain('meaningful beats')
    expect(armed.getInstructions()).toContain(CALIBRATION_INVITE)
    expect(existing.getInstructions()).toBe(base)

    calibrationArmed = false
    const { client: later } = await client()
    expect(later.getInstructions()).toBe(base)
  })

  it('rejects a port collision without scanning', async () => {
    const colliding = createServer({
      ingest: () => undefined,
      emote: () => undefined,
      listCues: () => [],
      status: () => ({})
    })
    await expect(colliding.start(port)).rejects.toMatchObject({ code: 'EADDRINUSE' })
    await colliding.stop()
  })
})
