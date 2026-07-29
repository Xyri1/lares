import { randomUUID } from 'node:crypto'
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { errorMessage } from '../errors'
import { parseEnvelope, type EventEnvelope } from '../sessions/mapEvent'

const MAX_BODY_BYTES = 1024 * 1024

const INSTRUCTIONS =
  'Emote at meaningful beats: session start, state change, third consecutive failure, recovery, and completion; never per tool call. Prefer a list_cues cue, and compose params only when no cue fits. On connection refused, continue silently.'

export interface ServerDeps {
  ingest(envelope: EventEnvelope, nowMs: number): void | Promise<void>
  emote(args: unknown, sourceKey: string, nowMs: number): unknown | Promise<unknown>
  listCues(): unknown | Promise<unknown>
  status(nowMs: number): unknown | Promise<unknown>
  listParameters?(): unknown | Promise<unknown>
  previewExpression?(args: unknown, nowMs: number): unknown | Promise<unknown>
  saveExpression?(args: unknown): unknown | Promise<unknown>
  updateExpression?(args: unknown): unknown | Promise<unknown>
  sessionInstructions?(): string | undefined
}

interface McpSession {
  server: McpServer
  transport: StreamableHTTPServerTransport
}

type Body = { ok: true; value: unknown } | { ok: false; status: 413 | 422 }

function isJson(req: IncomingMessage): boolean {
  return req.headers['content-type']?.split(';', 1)[0].trim().toLowerCase() === 'application/json'
}

async function readJson(req: IncomingMessage): Promise<Body> {
  let size = 0
  let tooLarge = false
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) tooLarge = true
    else chunks.push(chunk)
  }
  if (tooLarge) return { ok: false, status: 413 }
  try {
    return { ok: true, value: JSON.parse(Buffer.concat(chunks).toString('utf8')) }
  } catch {
    return { ok: false, status: 422 }
  }
}

function reply(res: ServerResponse, status: number, body?: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(body === undefined ? undefined : JSON.stringify(body))
}

function text(value: unknown): string {
  return JSON.stringify(value) ?? 'null'
}

async function toolResult(action: () => unknown | Promise<unknown>) {
  try {
    return { content: [{ type: 'text' as const, text: text(await action()) }] }
  } catch (error) {
    return {
      content: [{ type: 'text' as const, text: errorMessage(error) }],
      isError: true
    }
  }
}

function authoring<T>(action: T | undefined): T {
  if (!action) throw new Error('character authoring is unavailable')
  return action
}

export function createServer(deps: ServerDeps): {
  start(port?: number): Promise<number>
  stop(): Promise<void>
} {
  const sessions = new Map<string, McpSession>()

  const createMcpSession = async (): Promise<McpSession> => {
    let session: McpSession
    const invitation = deps.sessionInstructions?.()?.trim()
    const server = new McpServer(
      { name: 'lares', version: '1.0.0' },
      { instructions: invitation ? `${INSTRUCTIONS}\n${invitation}` : INSTRUCTIONS }
    )
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: randomUUID,
      enableJsonResponse: true,
      onsessioninitialized: (id) => {
        sessions.set(id, session)
      },
      onsessionclosed: (id) => {
        sessions.delete(id)
      }
    })
    session = { server, transport }

    server.registerTool(
      'emote',
      {
        description:
          'Use at meaningful beats, never per tool call. Prefer cue; compose params only when no cue fits.',
        inputSchema: {
          cue: z.string().optional(),
          params: z.record(z.string(), z.number()).optional(),
          intensity: z.number().optional(),
          duration_s: z.number().optional(),
          queue: z.boolean().optional(),
          label: z.string().optional()
        }
      },
      (args) => toolResult(() => deps.emote(args, `mcp:${transport.sessionId ?? 'anonymous'}`, Date.now()))
    )
    server.registerTool(
      'list_cues',
      { description: 'List cues before composing params.' },
      () => toolResult(() => deps.listCues())
    )
    server.registerTool(
      'status',
      { description: 'Read the active character and session summary.' },
      () => toolResult(() => deps.status(Date.now()))
    )
    server.registerTool(
      'list_parameters',
      {
        description:
          'List the active character parameters before previewing or authoring an expression.'
      },
      () => toolResult(() => authoring(deps.listParameters)())
    )
    server.registerTool(
      'preview_expression',
      {
        description:
          'Preview exact params or an existing cue on the live character. Pass no fields to revert.',
        inputSchema: {
          params: z.record(z.string(), z.number()).optional(),
          cue: z.string().optional()
        }
      },
      (args) => toolResult(() => authoring(deps.previewExpression)(args, Date.now()))
    )
    server.registerTool(
      'save_expression',
      {
        description:
          'After the user accepts a preview, create a new authored expression. Existing names are refused.',
        inputSchema: {
          name: z.string(),
          params: z.record(z.string(), z.number()),
          affect: z.object({ valence: z.number(), arousal: z.number() })
        }
      },
      (args) => toolResult(() => authoring(deps.saveExpression)(args))
    )
    server.registerTool(
      'update_expression',
      {
        description:
          'Update affect coordinates for any cue, or params for an authored cue. Unknown names are refused.',
        inputSchema: {
          name: z.string(),
          affect: z.object({ valence: z.number(), arousal: z.number() }).optional(),
          params: z.record(z.string(), z.number()).optional()
        }
      },
      (args) => toolResult(() => authoring(deps.updateExpression)(args))
    )
    await server.connect(transport)
    return session
  }

  const listener = createHttpServer((req, res) => {
    void handle(req, res).catch(() => {
      if (!res.headersSent) reply(res, 500, { error: 'internal server error' })
      else res.end()
    })
  })

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.headers.origin !== undefined) return reply(res, 403)

    if (req.method === 'DELETE' && req.url === '/v1/mcp') {
      const id = req.headers['mcp-session-id']
      const session = typeof id === 'string' ? sessions.get(id) : undefined
      return session === undefined ? reply(res, 404) : session.transport.handleRequest(req, res)
    }
    if (req.method !== 'POST') return reply(res, 404)

    if (req.url === '/v1/events') {
      if (!isJson(req)) return reply(res, 415)
      const body = await readJson(req)
      if (!body.ok) return reply(res, body.status)
      const envelope = parseEnvelope(body.value)
      if (!envelope.ok) return reply(res, 422, { error: envelope.error })
      await deps.ingest(envelope.value, Date.now())
      return reply(res, 202)
    }

    if (req.url !== '/v1/mcp') return reply(res, 404)
    if (!isJson(req)) {
      const session = await createMcpSession()
      await session.transport.handleRequest(req, res)
      await session.server.close()
      return
    }
    const body = await readJson(req)
    if (!body.ok) return reply(res, body.status)

    const id = req.headers['mcp-session-id']
    const sessionId = typeof id === 'string' ? id : undefined
    const existing = sessionId === undefined ? undefined : sessions.get(sessionId)
    if (sessionId !== undefined && !existing) return reply(res, 404)
    if (existing) return existing.transport.handleRequest(req, res, body.value)
    if (!isInitializeRequest(body.value)) return reply(res, 400)

    const session = await createMcpSession()
    await session.transport.handleRequest(req, res, body.value)
    if (session.transport.sessionId === undefined) await session.server.close()
  }

  return {
    async start(port = 21473): Promise<number> {
      await new Promise<void>((resolve, reject) => {
        const resolveStart = (): void => {
          listener.off('error', rejectStart)
          resolve()
        }
        const rejectStart = (error: Error): void => {
          listener.off('listening', resolveStart)
          reject(error)
        }
        listener.once('error', rejectStart)
        listener.once('listening', resolveStart)
        listener.listen(port, '127.0.0.1')
      })
      const address = listener.address()
      if (address === null || typeof address === 'string') throw new Error('server did not bind a TCP port')
      return address.port
    },
    async stop(): Promise<void> {
      const active = [...sessions.values()]
      sessions.clear()
      await Promise.all(active.map(async ({ server, transport }) => {
        await server.close()
        await transport.close()
      }))
      if (!listener.listening) return
      await new Promise<void>((resolve, reject) => listener.close((error) => (error ? reject(error) : resolve())))
    }
  }
}
