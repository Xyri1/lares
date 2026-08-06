import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

// 012-D4: approved copy, verbatim. Must stay byte-identical to
// HOST_GUIDANCE_REMINDER in scripts/forwarder.js (checked by hostGuidance.test.ts).
export const HOST_GUIDANCE_REMINDER =
  'Lares is active. If `feel` is available and this session has no feel report, appraise current request and call once at first available tool decision. Later, including mid-task, form absolute [valence, activation, control] integers and compare with last report: call only if an integer differs, or once when the user directly asks how you feel; unchanged means no call. Each call replaces prior report. Axes: valence unpleasant -2 to pleasant +2; activation subdued -2 to energized +2; felt control blocked or overwhelmed -2 to able to influence what happens next +2. Control is not certainty, confidence, responsibility, dominance, or objective success. Examples illustrate appraisal comparisons, never event triggers: Last [0,1,1], an expected failing test narrows the cause and candidate remains [0,1,1] -> no call. Last [0,1,1], the failure invalidates the only viable path and candidate is [-1,2,-2] -> call `feel`. Last [-1,1,-1], evidence reveals the root cause and a workable fix, candidate [1,1,2] -> call; a routine build succeeds without another change -> no call. Last [1,0,2], the user says they are frustrated while your appraisal stays [1,0,2] -> no call; if asked how you feel, call that tuple once. Interpret direct requests semantically in any language. Routine tool results, lifecycle events, schedules, emotion words, and the user’s feelings are not triggers. Appraise only your own functional state. If call fails or is rate-limited, continue silently; do not retry or mention it.'

const rulesDir = (home: string): string => join(home, '.claude', 'rules')

export const hostGuidanceRulePath = (home: string = homedir()): string =>
  join(rulesDir(home), 'lares.md')

// Best-effort by design: a reinforcement feature must never take down the
// nerves server (startNerves) or shutdown teardown (removeRuntimeFile).
export function writeHostGuidanceRule(home: string = homedir()): void {
  try {
    mkdirSync(rulesDir(home), { recursive: true })
    writeFileSync(
      hostGuidanceRulePath(home),
      `<!-- Managed by the Lares desktop app; removed when the app quits. -->\n\n${HOST_GUIDANCE_REMINDER}\n`
    )
  } catch (error) {
    console.error('[lares] failed to write host-guidance rule', error)
  }
}

export function removeHostGuidanceRule(home: string = homedir()): void {
  try {
    rmSync(hostGuidanceRulePath(home), { force: true })
  } catch (error) {
    console.error('[lares] failed to remove host-guidance rule', error)
  }
}
