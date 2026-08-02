import type { BaselineState } from '../sessions/mapEvent'
import type { Scenario } from './types'
import { createStepper, traceLine, STEP_MS, type StepState } from './run'

/** A/B stages (002-D2). Normal mode runs 'A' only. */
export type StageId = 'A' | 'B'

// Performance feed message (013 SPEC §13): renderer-neutral — the latched
// tuple and one operational state cross this seam, Live2D knowledge never
// does (P6). Structural twin of `AffectFeed` in src/preload/types.d.ts; the
// seam is the contract, not a shared import.
export interface AffectFeedMessage {
  stageId: StageId
  /** Scenario tick index (t = tick·100ms). Renderer keys off this instead of
   * counting arrivals — closes a fragile-counter bug and lets seeks jump the
   * tick cleanly (002 step-6 decision 1). */
  tick: number
  /** Wire integers in {-2..2}; `null` selects the neutral anchor (§11). */
  feel: { valence: number; activation: number; control: number } | null
  /** Resolved root §3 session state. */
  operational: BaselineState
}

export interface PacedPlayback {
  /** Last scenario time this run steps to — fixed for the run's lifetime. */
  endMs: number
  cancel(): void
  /** Stop advancing ticks; wall timer suspends. */
  pause(): void
  /** Continue advancing ticks from the same tick pause() left off at. */
  resume(): void
  /** Effective from the next tick — never rewrites past ticks. */
  setSpeed(speed: number): void
  /**
   * Recompute deterministically from scenario start to tMs (clamped,
   * grid-aligned) and continue paced from there. Never snapshots/restores
   * engine state — a fresh engine replays every event in order, same as a
   * cold run would (002 step-6 decision 1). No per-tick `onFeed` emission
   * during the catch-up: the whole 0..T history goes out once via `onSeek`
   * so the renderer can replay its synth through the same tick sequence and
   * land byte-identical to an unseeked run.
   */
  seek(tMs: number): void
}

/** The stepper's per-tick state, shaped for the wire (013 SPEC §13). */
export function feedMessage(state: StepState, tick: number, stageId: StageId = 'A'): AffectFeedMessage {
  return { stageId, tick, feel: state.feel, operational: state.operational }
}

/** Clamp a UI speed multiplier to the range the pacer can safely run at. */
export function clampSpeed(speed: number): number {
  return Number.isFinite(speed) ? Math.min(64, Math.max(0.1, speed)) : 1
}

// Wall-clock pacing around the exact same fixed-100ms step core runScenario
// uses: scenario time due = elapsed wall time · speed, so speed changes the
// pacing but can never change the stepped values (002-D3). One feed message
// per engine tick — 10Hz at 1×, satisfying "on-change or ≤10Hz". Engine trace
// lines accumulate in the byte format runScenario produces.
export function playScenarioPaced(
  scenario: Scenario,
  opts: {
    speed?: number
    /** Active stages, default ['A']. Each stage gets its OWN stepper, stepped
     * inside the same loop iteration — identical ticks, no drift (002-D2).
     * Engine states match across stages by determinism; the visible A/B
     * difference is renderer-side preset synth only. */
    stages?: StageId[]
    onFeed: (feed: AffectFeedMessage) => void
    onSeek: (history: AffectFeedMessage[]) => void
    /** Engine trace lines keyed by stage id. */
    onDone: (engineLines: Record<string, string[]>) => void
  }
): PacedPlayback {
  let speed = clampSpeed(opts.speed ?? 1)
  const stageIds = opts.stages ?? ['A']
  const makeStages = (): { id: StageId; stepper: ReturnType<typeof createStepper>; lines: string[] }[] =>
    stageIds.map((id) => ({ id, stepper: createStepper(scenario), lines: [] }))
  let stages = makeStages()
  const endMs = stages[0].stepper.endMs
  let nextT = 0
  let paused = false
  let startedWall = Date.now() // dueT = (Date.now() - startedWall) * speed

  // Re-anchors the wall-clock reference to "now = nextT" — used whenever
  // pause state or speed changes so pacing continues from the current
  // position instead of jumping (002 step-6 decision 1: speed/pause take
  // effect from the next tick, never retroactively).
  const rebaseWall = (): void => {
    startedWall = Date.now() - nextT / speed
  }

  const timer = setInterval(() => {
    if (paused) return
    const dueT = (Date.now() - startedWall) * speed
    while (nextT <= dueT && nextT <= endMs) {
      for (const st of stages) {
        const state = st.stepper.step(nextT)
        st.lines.push(traceLine(nextT, state))
        opts.onFeed(feedMessage(state, nextT / STEP_MS, st.id))
      }
      nextT += STEP_MS
    }
    if (nextT > endMs) {
      clearInterval(timer)
      opts.onDone(Object.fromEntries(stages.map((st) => [st.id, st.lines])))
    }
  }, 25)

  return {
    endMs,
    cancel: () => clearInterval(timer),
    pause: () => {
      paused = true
    },
    resume: () => {
      if (!paused) return
      paused = false
      rebaseWall()
    },
    setSpeed: (s: number) => {
      speed = clampSpeed(s)
      rebaseWall()
    },
    seek: (tMs: number) => {
      const target = Math.min(endMs, Math.max(0, Math.floor(tMs / STEP_MS) * STEP_MS))
      stages = makeStages() // fresh steppers — never snapshot/restore
      const history: AffectFeedMessage[] = []
      for (let t = 0; t <= target; t += STEP_MS) {
        for (const st of stages) {
          const state = st.stepper.step(t)
          st.lines.push(traceLine(t, state))
          history.push(feedMessage(state, t / STEP_MS, st.id))
        }
      }
      nextT = target + STEP_MS
      opts.onSeek(history)
      rebaseWall()
    }
  }
}
