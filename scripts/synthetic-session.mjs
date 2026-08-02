import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

const runtime = JSON.parse(await readFile(join(homedir(), '.lares', 'runtime.json'), 'utf8'))
const base = `http://127.0.0.1:${runtime.port}`
const sessionId = `synthetic-${randomUUID()}`
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function event(hook_event_name, extra = {}) {
  const response = await fetch(`${base}/v1/events`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      v: 1,
      harness: 'claude-code',
      session_id: sessionId,
      cwd: process.cwd(),
      pid: process.pid,
      event: { hook_event_name, ...extra }
    })
  })
  if (response.status !== 202) throw new Error(`${hook_event_name} failed: HTTP ${response.status}`)
}

const client = new Client({ name: 'lares-synthetic-session', version: '1.0.0' })
try {
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/v1/mcp`)))
  console.log(client.getInstructions())

  const before = JSON.parse(
    (await client.callTool({ name: 'status', arguments: {} })).content[0].text
  )
  if (before.protocol_version !== 2) throw new Error(`expected protocol v2, got ${before.protocol_version}`)

  const feel = async (valence, activation, control) => {
    const result = await client.callTool({ name: 'feel', arguments: { valence, activation, control } })
    if (result.isError) throw new Error(`feel(${valence},${activation},${control}) failed: ${result.content[0].text}`)
    console.log(result.content[0].text)
  }

  await event('SessionStart')
  await feel(1, 1, 1) // discovery

  await event('PreToolUse', { tool_name: 'shell' })
  await event('PostToolUseFailure', { tool_name: 'shell', error: 'synthetic failure 1' })
  await event('PostToolUseFailure', { tool_name: 'shell', error: 'synthetic failure 2' })
  await event('PostToolUseFailure', { tool_name: 'shell', error: 'synthetic failure 3' })
  await sleep(2100)
  await feel(-2, 1, -2) // frustration, control slipping

  await event('PostToolUse', { tool_name: 'shell' })
  await sleep(2100)
  await feel(1, 0, 1) // relief

  await event('Stop')
  await sleep(2100)
  await feel(2, 0, 2) // satisfaction

  const status = await client.callTool({ name: 'status', arguments: {} })
  console.log(status.content[0].text)
} finally {
  await client.close()
}
