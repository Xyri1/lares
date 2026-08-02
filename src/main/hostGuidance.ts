import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

// 012-D4: approved copy, verbatim. Must stay byte-identical to
// HOST_GUIDANCE_REMINDER in scripts/forwarder.js (checked by hostGuidance.test.ts).
export const HOST_GUIDANCE_REMINDER =
  'Lares is active for this session. If the `feel` tool is available, report genuine shifts in your appraisal of the work as they occur — mid-task, not only at completion. Steady work stays silent.'

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
