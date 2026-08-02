import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { SessionRow, SessionSummary } from '../sessions/ingest'
import { createFeel, type FeelDeps } from './service'
import { type FeelFile } from './register'

const TUPLE = { valence: -1, activation: 2, control: -2 }

function row(session_id: string, partial: Partial<SessionRow> = {}): SessionRow {
  return {
    session_id,
    harness: 'claude-code',
    state: 'thinking',
    since: 0,
    last_event_at: 0,
    subagents: 0,
    turnOpen: false,
    ...partial
  }
}

function feelFilePath(): string {
  return join(mkdtempSync(join(tmpdir(), 'lares-feel-')), 'feel.json')
}

function make(
  overrides: Partial<FeelDeps> & { summary?: SessionSummary } = {}
): {
  feel: ReturnType<typeof createFeel>
  path: string
  persisted: FeelFile[]
  warnings: string[]
  summary: SessionSummary
} {
  const summary: SessionSummary = overrides.summary ?? { baseline: 'working', sessions: [] }
  const persisted: FeelFile[] = []
  const warnings: string[] = []
  const path = overrides.path ?? feelFilePath()
  const feel = createFeel({
    path,
    state: () => summary,
    persist: (file) => void persisted.push(file),
    warn: (message) => void warnings.push(message),
    ...overrides
  })
  return { feel, path, persisted, warnings, summary }
}

describe('createFeel', () => {
  it('attributes a call to the open turn and acknowledges the stored tuple (§§8, 9)', () => {
    const { feel, persisted, summary } = make({
      summary: {
        baseline: 'working',
        sessions: [
          row('older', { last_event_at: 90 }),
          row('open', { last_event_at: 10, turnOpen: true })
        ]
      }
    })

    expect(feel.report(TUPLE, 'mcp-1', 1000)).toBe(
      'Latched valence -1, activation 2, control -2.'
    )
    expect(feel.attributed('mcp-1', 1000)).toEqual({
      session: 'claude-code:open',
      feel: { ...TUPLE, at: 1000 }
    })
    expect(persisted).toEqual([{ v: 1, latches: { 'claude-code:open': { ...TUPLE, at: 1000 } } }])
    expect(summary.baseline).toBe('working')
  })

  it('rejects an invalid tuple and a rate-capped call, naming the wait (§8)', () => {
    const { feel, persisted } = make()

    expect(() => feel.report({ valence: 0.5, activation: 0, control: 0 }, 'mcp-1', 0)).toThrow(
      /integers from -2 to 2/
    )
    feel.report(TUPLE, 'mcp-1', 1000)
    expect(() => feel.report({ valence: 0, activation: 0, control: 0 }, 'mcp-1', 2500)).toThrow(
      'one feel per session every 2s; wait 1s'
    )
    // The latch is untouched by either refusal.
    expect(feel.attributed('mcp-1', 2500).feel).toEqual({ ...TUPLE, at: 1000 })
    expect(persisted).toHaveLength(1)
  })

  it('latches an unattributable call under a volatile key that never persists or checkpoints (§§9, 10)', () => {
    const { feel, persisted } = make() // empty session table

    feel.report(TUPLE, 'mcp-1', 1000)

    expect(feel.attributed('mcp-1', 1000).session).toBe('mcp:mcp-1')
    expect(feel.checkpoint('mcp:mcp-1')).toBeUndefined()
    expect(persisted).toEqual([{ v: 1, latches: {} }])
    // It still drives the display — a documented degradation, not a drop.
    expect(feel.feed(1000)?.feel).toEqual(TUPLE)
  })

  it('restores the displayed latch from feel.json at boot (§12, 013-S9)', () => {
    const path = feelFilePath()
    const stored = make({ path })
    stored.feel.report(TUPLE, 'mcp-1', 1000) // volatile: not the restored one
    writeFileSync(
      path,
      JSON.stringify({
        v: 1,
        latches: {
          'claude-code:old': { valence: 0, activation: 0, control: 0, at: 10 },
          'claude-code:recent': { ...TUPLE, at: 20 }
        }
      })
    )

    const { feel, warnings } = make({ path })

    expect(warnings).toEqual([])
    expect(feel.checkpoint('claude-code:recent')).toEqual({ ...TUPLE, at: 20 })
    expect(feel.feed(2000)).toEqual({ stageId: 'A', tick: 20, feel: TUPLE, operational: 'working' })
  })

  it('writes the accepted report through to disk (§12)', async () => {
    const path = feelFilePath()
    const feel = createFeel({ path, state: () => ({ baseline: 'idle', sessions: [row('s1')] }) })

    feel.report(TUPLE, 'mcp-1', 1000)
    await vi.waitFor(() =>
      expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({
        v: 1,
        latches: { 'claude-code:s1': { ...TUPLE, at: 1000 } }
      })
    )
  })

  it('starts empty with a warning for a malformed or unreadable file (§12)', () => {
    const path = feelFilePath()
    writeFileSync(path, JSON.stringify({ v: 2, latches: { 'claude-code:s1': TUPLE } }))
    const wrongShape = make({ path })
    expect(wrongShape.feel.feed(1000)?.feel).toBeNull()
    expect(wrongShape.warnings).toEqual([`[lares] ignoring malformed ${path}; starting with no latches`])

    writeFileSync(path, 'not json')
    const unreadable = make({ path })
    expect(unreadable.feel.feed(1000)?.feel).toBeNull()
    expect(unreadable.warnings[0]).toContain(`ignoring unreadable ${path}`)

    // A missing file is the normal first run: empty, and silent.
    expect(make().warnings).toEqual([])
  })

  it('emits the feed only on change, and again for a beat after a body takes the channel (§§1, 6, 13)', () => {
    const summary: SessionSummary = { baseline: 'working', sessions: [row('s1')] }
    const feel = createFeel({ path: feelFilePath(), state: () => summary, persist: () => {} })

    feel.report(TUPLE, 'mcp-1', 1000)
    expect(feel.feed(1000)).toEqual({
      stageId: 'A',
      tick: 10,
      feel: TUPLE,
      operational: 'working'
    })
    expect(feel.feed(1100)).toBeNull()

    // A sweep-produced operational change still goes out.
    summary.baseline = 'awaiting_input'
    expect(feel.feed(1200)?.operational).toBe('awaiting_input')

    // Character switch: the body reset itself to the new neutral, so the
    // unchanged tuple and the live overlay have to re-arrive (P10).
    feel.resend(1300)
    expect(feel.feed(1300)).toEqual({
      stageId: 'A',
      tick: 13,
      feel: TUPLE,
      operational: 'awaiting_input'
    })
    expect(feel.feed(1400)?.feel).toEqual(TUPLE)
    // Past the window the gate goes quiet again.
    expect(feel.feed(3400)).toBeNull()
  })

  it('forces one message through after something else owned the channel', () => {
    const feel = createFeel({
      path: feelFilePath(),
      state: () => ({ baseline: 'idle', sessions: [] }),
      persist: () => {}
    })

    expect(feel.feed(1000)).not.toBeNull()
    expect(feel.feed(1100)).toBeNull()
    feel.resetFeed()
    expect(feel.feed(1200)).not.toBeNull()
    expect(feel.feed(1300)).toBeNull()
  })
})
