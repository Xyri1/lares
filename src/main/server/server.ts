import { randomUUID } from 'node:crypto'
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { CANONICAL_CUES } from '../cues'
import { errorMessage } from '../errors'
import { parseEnvelope, type EventEnvelope } from '../sessions/mapEvent'

const MAX_BODY_BYTES = 1024 * 1024

// SPEC §5: the first 512 characters must stand alone for clients that truncate
// server guidance, and the whole value must stay under Claude Code's 2,000.
// Both budgets are asserted in server.test.ts — keep edits inside them.
const INSTRUCTIONS = [
  'Lares is a desktop character that shows your working state. Call emote when your appraisal of the work genuinely shifts, using one cue: discovery (a new understanding or approach clicks), uncertainty (material ambiguity remains unresolved), concern (a concrete risk or problem is recognized), frustration (progress is repeatedly obstructed), relief (pressure resolves or recovery succeeds), satisfaction (success or correctness is confirmed). Send one call at the first tool-decision point after the shift.',
  '',
  'Report your own appraisal, never the user’s feelings and never a summary of the conversation. The judgment is semantic, so it holds in every language: no word triggers a call, and writing or reading aha, wait, or any translation of them is not itself a reason to emote. Steady work is silent — routine tool results, lifecycle milestones such as session start or stop, and schedules of any kind are not appraisal changes.',
  '',
  'Cue is the whole normal interface; params is a low-level escape hatch you do not need. If a call fails — connection refused, or character_not_calibrated — continue the user’s task silently: no retries, no mention of it, and no inspection of the character’s assets.'
].join('\n')

export interface ServerDeps {
  ingest(envelope: EventEnvelope, nowMs: number): void | Promise<void>
  emote(args: unknown, sourceKey: string, nowMs: number): unknown | Promise<unknown>
  listPerformances(): unknown | Promise<unknown>
  status(nowMs: number): unknown | Promise<unknown>
  listParameters?(): unknown | Promise<unknown>
  previewExpression?(args: unknown, nowMs: number): unknown | Promise<unknown>
  mapCue?(args: unknown): unknown | Promise<unknown>
  saveExpression?(args: unknown): unknown | Promise<unknown>
  updateExpression?(args: unknown): unknown | Promise<unknown>
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
    // Tool-contract v2 (011-D13); /v1/mcp stays put so a v2 client can call
    // status on a v1 daemon and report the mismatch.
    const server = new McpServer({ name: 'lares', version: '2.0.0' }, { instructions: INSTRUCTIONS })
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
          'Express your own appraisal of the work on the Lares character — never the user’s feelings and never a transcript summary. One call per genuine shift, at the first tool-decision point after it; never per tool call, never on a schedule. The judgment is semantic and holds in any language; no word triggers it. If the call fails, continue the task silently.',
        inputSchema: {
          cue: z
            .enum(CANONICAL_CUES)
            .optional()
            .describe(
              'discovery: a new understanding or approach clicks. uncertainty: material ambiguity remains unresolved. concern: a concrete risk or problem is recognized. frustration: progress is repeatedly obstructed. relief: pressure resolves or recovery succeeds. satisfaction: success or correctness is confirmed.'
            ),
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
      'list_performances',
      {
        description:
          'List the active character’s performances with their kind, source, affect coordinates and mapped canonical cues, plus the cues still missing. For the user-invoked Calibrate Lar workflow; ordinary emoting never needs it.'
      },
      () => toolResult(() => deps.listPerformances())
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
          'Preview exact params or an existing performance on the live character. Pass no fields to revert. A motion performance plays once, so warn the watching user first. For the user-invoked Calibrate Lar workflow.',
        inputSchema: {
          params: z.record(z.string(), z.number()).optional(),
          performance: z.string().optional()
        }
      },
      (args) => toolResult(() => authoring(deps.previewExpression)(args, Date.now()))
    )
    server.registerTool(
      'map_cue',
      {
        description:
          'Map one canonical cue to a calibrated performance of the active character, replacing any earlier mapping. Reserved for the user-invoked Calibrate Lar workflow; ordinary sessions never call it.',
        inputSchema: {
          cue: z.enum(CANONICAL_CUES),
          performance: z.string()
        }
      },
      (args) => toolResult(() => authoring(deps.mapCue)(args))
    )
    server.registerTool(
      'save_expression',
      {
        description:
          'After the user accepts a preview, create a new authored expression. Existing names are refused. For the user-invoked Calibrate Lar workflow.',
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
          'Update affect coordinates for any performance, or params for an authored one. Unknown names are refused. For the user-invoked Calibrate Lar workflow.',
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
