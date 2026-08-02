import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadScenario } from './load'
import { runScenario } from './run'

// scenarios/ lives at the repo root; vitest runs from there (repo facts).
const SCENARIOS_DIR = join(process.cwd(), 'scenarios')
const GOLDENS = ['smooth-build', 'brutal-debugging-session', 'long-wait-for-input', 'recovery-arc']

describe('golden scenario determinism (A3)', () => {
  for (const name of GOLDENS) {
    it(`${name}: two runs produce byte-identical traces`, () => {
      const scenario = loadScenario(join(SCENARIOS_DIR, `${name}.json`))
      const a = runScenario(scenario)
      const b = runScenario(scenario)
      expect(a.length).toBeGreaterThan(0)
      expect(a.join('\n')).toBe(b.join('\n'))
    })
  }

  it('recovery-arc: playback speed never changes the trace (1x vs 64x)', () => {
    const scenario = loadScenario(join(SCENARIOS_DIR, 'recovery-arc.json'))
    const slow = runScenario(scenario, { speed: 1 })
    const fast = runScenario(scenario, { speed: 64 })
    expect(slow.join('\n')).toBe(fast.join('\n'))
  })

  it('brutal-debugging-session: the third failure lands within 5 minutes of the first', () => {
    const scenario = loadScenario(join(SCENARIOS_DIR, 'brutal-debugging-session.json'))
    const failureTimes = scenario.events
      .filter((e) => 'envelope' in e && e.envelope.event.hook_event_name === 'PostToolUseFailure')
      .map((e) => e.at_ms)
    expect(failureTimes.length).toBeGreaterThanOrEqual(3)
    expect(failureTimes[2] - failureTimes[0]).toBeLessThan(5 * 60_000)
  })

  it('every golden trace line parses back to the expected shape', () => {
    for (const name of GOLDENS) {
      const scenario = loadScenario(join(SCENARIOS_DIR, `${name}.json`))
      const trace = runScenario(scenario)
      for (const line of trace) {
        const parsed = JSON.parse(line)
        expect(parsed).toMatchObject({
          t: expect.any(Number),
          operational: expect.any(String)
        })
        expect(parsed.feel === null || typeof parsed.feel === 'object').toBe(true)
      }
    }
  })

  it('every golden reports at least one feel call at a narrative beat', () => {
    for (const name of GOLDENS) {
      const scenario = loadScenario(join(SCENARIOS_DIR, `${name}.json`))
      const feelEvents = scenario.events.filter((e) => 'feel' in e)
      expect(feelEvents.length).toBeGreaterThan(0)
    }
  })
})
