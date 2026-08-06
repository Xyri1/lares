const startedAt = Date.now()
let finished = false
// 013 SPEC §10: the 500ms budget is a soft target, not a gate. The prompt-submit
// checkpoint waits for the response with no in-script cutoff; the harness hook
// timeout is the outer bound. Every other path keeps the hard cutoff.
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

// 012-D3/D4: approved copy, verbatim. Never derived from prompt text.
const HOST_GUIDANCE_REMINDER =
  'Lares is active. If `feel` is available and this session has no feel report, appraise current request and call once at first available tool decision. Later, including mid-task, form absolute [valence, activation, control] integers and compare with last report: call only if an integer differs, or once when the user directly asks how you feel; unchanged means no call. Each call replaces prior report. Axes: valence unpleasant -2 to pleasant +2; activation subdued -2 to energized +2; felt control blocked or overwhelmed -2 to able to influence what happens next +2. Control is not certainty, confidence, responsibility, dominance, or objective success. Examples illustrate appraisal comparisons, never event triggers: Last [0,1,1], an expected failing test narrows the cause and candidate remains [0,1,1] -> no call. Last [0,1,1], the failure invalidates the only viable path and candidate is [-1,2,-2] -> call `feel`. Last [-1,1,-1], evidence reveals the root cause and a workable fix, candidate [1,1,2] -> call; a routine build succeeds without another change -> no call. Last [1,0,2], the user says they are frustrated while your appraisal stays [1,0,2] -> no call; if asked how you feel, call that tuple once. Interpret direct requests semantically in any language. Routine tool results, lifecycle events, schedules, emotion words, and the user’s feelings are not triggers. Appraise only your own functional state. If call fails or is rate-limited, continue silently; do not retry or mention it.'

function emitContext(event, context) {
  try {
    fs.writeSync(
      1,
      JSON.stringify({
        hookSpecificOutput: { hookEventName: event, additionalContext: context }
      })
    )
  } catch {}
}

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

  if (
    harness === 'codex' &&
    event.hook_event_name === 'SessionStart' &&
    runtime.hostGuidance === true
  ) {
    emitContext('SessionStart', HOST_GUIDANCE_REMINDER)
  }

  // Only the prompt-submit checkpoint reads the daemon's answer (013 SPEC §10);
  // every other event stays fire-and-forget.
  const checkpoint = event.hook_event_name === 'UserPromptSubmit'

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
      if (!checkpoint) {
        response.resume()
        return finish()
      }
      const answer = []
      response.on('data', (chunk) => answer.push(chunk))
      response.on('error', finish)
      response.on('end', () => {
        let context
        try {
          context = JSON.parse(Buffer.concat(answer).toString('utf8')).context
        } catch {}
        if (typeof context === 'string' && context) emitContext('UserPromptSubmit', context)
        finish()
      })
    }
  )
  request.on('error', finish)
  // The checkpoint waits for its answer; a refused connection still exits fast.
  if (checkpoint) clearTimeout(budget)
  request.end(body)
})
