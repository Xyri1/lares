import { randomUUID } from 'node:crypto'
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { errorMessage } from '../errors'
import type { FeelTuple } from '../feel/register'
import { eventName, parseEnvelope, type EventEnvelope } from '../sessions/mapEvent'

const MAX_BODY_BYTES = 1024 * 1024

// SPEC §5: the first 512 characters must stand alone, and the whole value must
// stay under Claude Code's 2,000-character server-guidance budget.
// Both budgets are asserted in server.test.ts — keep edits inside them.
const INSTRUCTIONS = [
  'Lares shows how the work feels to you. Call feel(valence, activation, control) with three integers from -2 to 2. If no last reported feel exists for this session, call once after appraising the current request to establish an initial report. Thereafter, call only when your appraisal meaningfully changes, including mid-task, or the user directly asks how you feel, even if nothing changed. Values are absolute: each call fully replaces the previous report.',
  '',
  'Judge direct-request intent semantically in every language; these examples are not trigger phrases, and no word triggers a call.',
  '',
  'Steady work stays silent. Routine tool results, session start or stop, and schedules are not shifts and never cause another call. Report your own appraisal, never the user’s feelings and never a conversation summary.',
  '',
  'If a call fails — connection refused, or the one-report-per-2s spacing — continue the user’s task silently: no retries, no mention of it.'
].join('\n')

// 013 SPEC §8, verbatim. Self-contained: the axis meanings live nowhere else.
const FEEL_DESCRIPTION =
  'Report your current felt state as three integers, each from -2 to 2: valence (unpleasant −2 … pleasant +2), activation (subdued −2 … energized +2), control (overwhelmed −2 … in control +2). This is a first-person report of your current functional appraisal — not an animation command, and not a claim about subjective experience. Values are absolute: each call fully replaces your previous report. If no last reported feel exists for this session, call once after appraising the current request to establish an initial report. Thereafter, call only when your appraisal meaningfully changes, or once when the user directly asks how you feel. Steady work stays silent. If the call fails, continue your task silently.'

// P7: the published schema is the ingress guard — integer, in range, all three
// axes, nothing else. Any violation fails the whole call (013 SPEC §8).
const axis = z.int().min(-2).max(2)
const FEEL_INPUT = z.strictObject({ valence: axis, activation: axis, control: axis })

// 013 SPEC §10, verbatim with the tuple interpolated.
function checkpointContext(feel: FeelTuple): string {
  return `[Lares] Last reported feel: valence=${feel.valence}, activation=${feel.activation}, control=${feel.control}. Reassess from here — this is your last report, not a current claim. Call feel only on a meaningful appraisal change or a direct user request; values are absolute.`
}

export interface ServerDeps {
  ingest(envelope: EventEnvelope, nowMs: number): void | Promise<void>
  feel(args: unknown, mcpSessionId: string, nowMs: number): unknown | Promise<unknown>
  status(mcpSessionId: string, nowMs: number): unknown | Promise<unknown>
  /** Latch for one `harness:session_id` key; absent means no checkpoint (§10). */
  checkpoint?(sessionKey: string): FeelTuple | undefined
  listParameters?(): unknown | Promise<unknown>
  previewExpression?(args: unknown, nowMs: number): unknown | Promise<unknown>
  trace?(event: { source: 'mcp'; action: 'opened' | 'closed'; session: string }): void
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
  // A tool that answers in prose (feel's acknowledgement, 013 §8) reaches the
  // model as the sentence itself, not as a JSON string literal.
  return typeof value === 'string' ? value : (JSON.stringify(value) ?? 'null')
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
        deps.trace?.({ source: 'mcp', action: 'opened', session: `mcp:${id}` })
      },
      onsessionclosed: (id) => {
        sessions.delete(id)
        deps.trace?.({ source: 'mcp', action: 'closed', session: `mcp:${id}` })
      }
    })
    session = { server, transport }

    server.registerTool(
      'feel',
      { description: FEEL_DESCRIPTION, inputSchema: FEEL_INPUT },
      (args) => toolResult(() => deps.feel(args, transport.sessionId ?? 'anonymous', Date.now()))
    )
    server.registerTool(
      'status',
      { description: 'Read the active character and your session’s last reported feel.' },
      () => toolResult(() => deps.status(transport.sessionId ?? 'anonymous', Date.now()))
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
          'Preview exact params on the live character. Pass no fields to revert. For explicit, user-invoked authoring only.',
        inputSchema: {
          params: z.record(z.string(), z.number()).optional()
        }
      },
      (args) => toolResult(() => authoring(deps.previewExpression)(args, Date.now()))
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
      // 013 SPEC §10: the prompt-submit checkpoint is the route's only body.
      const feel =
        eventName(envelope.value) === 'UserPromptSubmit'
          ? deps.checkpoint?.(`${envelope.value.harness}:${envelope.value.session_id}`)
          : undefined
      return reply(res, 202, feel && { context: checkpointContext(feel) })
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
