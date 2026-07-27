const startedAt = Date.now()
let finished = false
const budget = setTimeout(finish, 500)

function finish() {
  if (finished) return
  finished = true
  clearTimeout(budget)
  // A8 measures in-script time (004-D8); spawn cost is outside the figure.
  if (process.env.LARES_FORWARDER_TIMING) {
    try {
      require('node:fs').writeSync(2, String(Date.now() - startedAt))
    } catch {}
  }
  process.exit(0)
}

const fs = require('node:fs')

const harness = process.argv[2]
if (harness !== 'claude-code' && harness !== 'codex') finish()

const harnessPid = Number(process.env.LARES_HARNESS_PID)
const pid = Number.isInteger(harnessPid) && harnessPid > 0 ? harnessPid : undefined

const runtimeFile =
  process.env.LARES_RUNTIME_FILE ||
  require('node:path').join(require('node:os').homedir(), '.lares', 'runtime.json')

let runtime
try {
  runtime = JSON.parse(fs.readFileSync(runtimeFile, 'utf8'))
} catch {
  finish()
}
if (
  runtime?.version !== 1 ||
  !Number.isInteger(runtime.port) ||
  runtime.port < 1 ||
  runtime.port > 65535 ||
  !Number.isInteger(runtime.pid) ||
  runtime.pid <= 0
) {
  finish()
}

const chunks = []
process.stdin.on('data', (chunk) => chunks.push(chunk))
process.stdin.on('error', finish)
process.stdin.on('end', () => {
  let event
  try {
    event = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    return finish()
  }
  if (
    typeof event !== 'object' ||
    event === null ||
    Array.isArray(event) ||
    typeof event.session_id !== 'string' ||
    event.session_id.length === 0 ||
    (event.cwd !== undefined && typeof event.cwd !== 'string')
  ) {
    return finish()
  }

  const body = JSON.stringify({
    v: 1,
    harness,
    session_id: event.session_id,
    ...(event.cwd === undefined ? {} : { cwd: event.cwd }),
    ...(pid === undefined ? {} : { pid }),
    event
  })
  const request = require('node:http').request(
    {
      hostname: '127.0.0.1',
      port: runtime.port,
      path: '/v1/events',
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body)
      },
    },
    (response) => {
      response.resume()
      finish()
    }
  )
  request.on('error', finish)
  request.end(body)
})
