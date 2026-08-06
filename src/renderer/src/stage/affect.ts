import defaultPresetJson from '../../../../presets/default.json'
import {
  computeTarget,
  withOverlay,
  DEFAULT_FEEL,
  type FeelPoses,
  type Pose
} from '../feel/feel'
import { FACE_CHANNELS, planPhrase, type ChoreographyMap } from '../feel/choreography'
import type { IRuntime } from '../runtime/iface'
import { createSynth, mulberry32, type Synth, type SynthFeed, type SynthPreset } from '../synth/synth'
import { driveTick, frameToLine, replayHistory } from './synthReplay'
import { createTraceBuffer, pushEngine, resetBuffer, type TraceBuffer } from './traceBuffer'

// Bundled fallback for a character with no `performance` mapping — same
// preset boot (stage/index.ts) falls back to. Never the previous character's
// preset, and never the driver's constructor `preset` (which may itself be a
// character-specific mapping, e.g. Haru's, at boot).
const defaultPreset = defaultPresetJson as SynthPreset

export interface CharacterChangeTransaction {
  rollback(): void
  finalize(): void
}

export interface PipelineSnapshot {
  source: 'live' | 'scenario' | 'manual'
  feel: { valence: number; activation: number; control: number } | null
  normalized: { valence: number; activation: number; control: number } | null
  operational: string
  expressiveness: number
  pose: Pose
  bindings: { id: string; value: number; raw: number; clipped: boolean; missing: boolean }[]
}

export interface AffectDriver {
  /** Start a golden replay at the given seed/speed (default 1×). */
  play(name: string, seed: number, speed?: number): void
  stop(): Promise<void>
  pause(): void
  resume(): void
  setSpeed(speed: number): void
  /** Seek to scenario time tMs; main clamps/aligns and replays deterministically. */
  seek(tMs: number): void
  /** Read-only trace history for the overlay to draw from (002 step-6, decision 3). */
  buffer(): TraceBuffer
  /** Observe semantic pipeline changes; never called per animation frame. */
  onPipeline(cb: (snapshot: PipelineSnapshot) => void): void
  /** Observe renderer receipt independently from the currently effective target. */
  onFeed(cb: (feed: AffectFeed, source: 'live' | 'scenario') => void): void
  /** Dev-only semantic bypass. Persists until cleared and never alters the
   * latched live report or app configuration. */
  previewPose(
    feel: { valence: number; activation: number; control: number } | null,
    options?: { operational?: string; expressiveness?: number }
  ): void
  /** Debug: back to a fresh-boot face. Pauses any run, drops any preview,
   * and releases every parameter the affect layer has taken so the model's
   * own idle motion owns them again. Leaves the trace buffer alone — the
   * overlay is history, not state. */
  reset(): void
  /** Tentatively refresh model defaults; finalize stops package-specific playback. */
  characterChanged(
    preset?: SynthPreset,
    poses?: FeelPoses,
    choreography?: ChoreographyMap
  ): CharacterChangeTransaction
}

interface StageState {
  runtime: IRuntime
  /** Parameter defaults of this stage's model — the presentation floor. */
  defaults: Record<string, number>
  /** Every id this stage has ever written — see `write()`. */
  driven: Set<string>
  feed: SynthFeed
  live: Synth
  replay: { synth: Synth; preset: SynthPreset; seed: number; lines: string[] } | null
  latest: Record<string, number> | null
  trace: TraceBuffer
}

/** Preview values win only for their own knobs; synth keeps driving the rest. */
export function withHeldPreview(
  frame: Readonly<Record<string, number>>,
  preview: Readonly<Record<string, number>> | null
): Record<string, number> {
  return preview === null ? { ...frame } : { ...frame, ...preview }
}

export function replaceHeldPreview(
  runtime: Pick<IRuntime, 'releaseParams'>,
  driven: ReadonlySet<string>,
  previous: Readonly<Record<string, number>> | null,
  next: Readonly<Record<string, number>> | null
): Record<string, number> | null {
  const nextIds = new Set(Object.keys(next ?? {}))
  const released = Object.keys(previous ?? {}).filter(
    (id) => !nextIds.has(id) && !driven.has(id)
  )
  if (released.length) runtime.releaseParams(released)
  return next === null ? null : { ...next }
}

// Impure shell around the pure synth: owns the feed subscription, the
// live-vs-replay switch (slice SPEC §4), and presentation via
// IRuntime.setParams.
//
//            clock source     rng           frame grid
//   live     performance.now  Math.random   one frame per rAF
//   replay   scenario time    mulberry32    3 frames per feed tick at exact
//                             (seed)        thirds (t + i·100/3), computed on
//                                           tick ARRIVAL — rAF only presents
//                                           the latest computed frame (002-D3)
export function createAffectDriver(
  runtime: IRuntime,
  preset: SynthPreset,
  feel: FeelPoses = DEFAULT_FEEL,
  initialChoreography?: ChoreographyMap
): AffectDriver {
  let idlePreset = preset
  let poses: FeelPoses = feel
  // Production anchor evaluation is fixed at k = 1 (014-D5): wire magnitude
  // already carries commitment. previewPose may still pass another k.
  const expressiveness = 1

  // An empty register performs the authored neutral anchor: resting
  // presentation, not feel(0, 0, 0) (SPEC §11).
  const restFeed = (): SynthFeed => ({ pose: poses.anchors.neutral })

  /** Wire integer → normalized axis; junk reads as 0 rather than as NaN (P7). */
  const axis = (value: number): number => (Number.isFinite(value) ? value / 2 : 0)

  // ---------------------------------------------------------------------------
  // Authored choreography lifecycle (slice 014 SPEC §6). The stage owns only
  // the trigger key, the one pending onset timer, and the character/overlay
  // calls; every physical mechanic lives behind IRuntime.
  // ---------------------------------------------------------------------------
  const ONSET_MS = 1200
  const LOUD_OVERLAYS: ReadonlySet<string> = new Set(['awaiting_input', 'error'])
  let choreography = initialChoreography
  let phraseGeneration = 0
  let phraseKey: string | null = null
  let pendingPhrase: ReturnType<typeof setTimeout> | null = null

  const clearPendingPhrase = (): void => {
    if (pendingPhrase !== null) {
      clearTimeout(pendingPhrase)
      pendingPhrase = null
    }
  }

  const faceParamIds = (): string[] =>
    idlePreset.params
      .filter((p) => (FACE_CHANNELS as readonly string[]).includes(p.source))
      .map((p) => p.id)

  /** One phrase per displayed-feel change (§6): the trigger key is the wire
   *  tuple plus the character generation. Identical keys are inert; `null`
   *  feel and loud overlays cancel without scheduling, and resetting the key
   *  lets overlay clear perform its single deferred schedule. */
  const applyChoreography = (
    feel: { valence: number; activation: number; control: number } | null,
    operationalState: string
  ): void => {
    if (!choreography) return
    if (feel === null || LOUD_OVERLAYS.has(operationalState)) {
      clearPendingPhrase()
      phraseKey = null
      runtime.cancelManagedMotion()
      return
    }
    const key = `${feel.valence},${feel.activation},${feel.control}#${phraseGeneration}`
    if (key === phraseKey) return
    phraseKey = key
    clearPendingPhrase()
    runtime.cancelManagedMotion()
    const plan = planPhrase(
      [axis(feel.valence), axis(feel.activation), axis(feel.control)],
      choreography
    )
    if (!plan) return
    pendingPhrase = setTimeout(() => {
      pendingPhrase = null
      void runtime.playManagedMotion({ ...plan, faceParamIds: faceParamIds() })
    }, ONSET_MS)
  }

  /** Feel tuple → the target pose (SPEC §4), shared by the live feed and the
   * panel preview. */
  const poseForTuple = (v: number, a: number, c: number, k = expressiveness): Pose =>
    computeTarget([axis(v), axis(a), axis(c)], poses.anchors, k)

  /** Feed message → target and overlaid pose (SPEC §§4, 11). */
  const poseFor = (f: AffectFeed): Pose => {
    const p = f.feel
    const target = p ? poseForTuple(p.valence, p.activation, p.control) : poses.anchors.neutral
    return withOverlay(target, f.operational, poses.operational)
  }

  const makeStage = (rt: IRuntime): StageState => ({
    runtime: rt,
    defaults: Object.fromEntries(rt.parameters().map((p) => [p.id, p.default])),
    driven: new Set<string>(),
    feed: restFeed(),
    live: createSynth(idlePreset, Math.random),
    replay: null,
    latest: null,
    trace: createTraceBuffer()
  })

  const state = makeStage(runtime)
  let pipelineListener: ((snapshot: PipelineSnapshot) => void) | null = null
  let feedListener: ((feed: AffectFeed, source: 'live' | 'scenario') => void) | null = null
  let lastSnapshot: PipelineSnapshot | null = null
  let lastPipelineKey = ''
  const publish = (
    source: PipelineSnapshot['source'],
    feel: AffectFeed['feel'],
    operational: string,
    k: number,
    pose: Pose
  ): void => {
    const key = JSON.stringify([source, feel, operational, k, pose])
    if (key === lastPipelineKey) return
    lastPipelineKey = key
    const inventory = new Map(runtime.parameters().map((param) => [param.id, param]))
    lastSnapshot = {
      source,
      feel,
      normalized: feel
        ? {
            valence: axis(feel.valence),
            activation: axis(feel.activation),
            control: axis(feel.control)
          }
        : null,
      operational,
      expressiveness: k,
      pose,
      bindings: idlePreset.params.map((binding) => {
        const raw = binding.offset + binding.gain * (pose[binding.source] ?? 0)
        const param = inventory.get(binding.id)
        const value = param ? Math.min(param.max, Math.max(param.min, raw)) : raw
        return { id: binding.id, value, raw, clipped: value !== raw, missing: !param }
      })
    }
    pipelineListener?.(lastSnapshot)
  }

  let authoringPreview: Record<string, number> | null = null

  window.lares.onAuthoringPreview((value) => {
    authoringPreview = replaceHeldPreview(
      state.runtime,
      state.driven,
      authoringPreview,
      value.params
    )
  })
  window.lares.onAuthoringRevert(() => {
    authoringPreview = replaceHeldPreview(
      state.runtime,
      state.driven,
      authoringPreview,
      null
    )
  })

  // Dev-only semantic bypass; explicit controls own its operational overlay.
  let posePreview: { pose: Pose } | null = null
  let operational = 'idle'
  let currentFeed: AffectFeed | null = null
  let currentFeedSource: 'live' | 'scenario' = 'live'

  let tentativeFeeds: AffectFeed[] | null = null
  const processFeed = (f: AffectFeed): void => {
    const source = state.replay ? 'scenario' : 'live'
    currentFeed = f
    currentFeedSource = source
    operational = f.operational
    const pose = poseFor(f)
    state.feed = { pose }
    feedListener?.(f, source)
    // Operational loudness preempts even an explicit dev preview (P10).
    if (posePreview && LOUD_OVERLAYS.has(f.operational)) posePreview = null
    // The preview owns the displayed feel; feed changes latch silently (§6).
    if (!posePreview) applyChoreography(f.feel, f.operational)
    if (!posePreview) publish(source, f.feel, f.operational, expressiveness, pose)
    if (!state.replay) return
    pushEngine(state.trace, f)
    for (const frame of driveTick(state.replay.synth, state.feed, f.tick)) {
      state.replay.lines.push(frameToLine(frame))
      state.trace.synth.push(frame)
      state.latest = frame.params
    }
  }

  window.lares.onAffectUpdate((f) => {
    if (tentativeFeeds !== null) {
      tentativeFeeds.push(f)
      return
    }
    processFeed(f)
  })

  // Seek lands here as one batch covering scenario time 0..T: rebuild the
  // overlay buffer and re-seed + replay the synth through the same tick
  // sequence a normal run would have used, so post-seek frames stay
  // byte-identical to an unseeked run.
  window.lares.onScenarioSeeked((history) => {
    if (!state.replay) return
    const rp = state.replay
    resetBuffer(state.trace)
    for (const f of history) pushEngine(state.trace, f)
    const replayed = replayHistory(
      () => createSynth(rp.preset, mulberry32(rp.seed)),
      history.map((f): SynthFeed => ({ pose: poseFor(f) }))
    )
    rp.synth = replayed.synth
    rp.lines = replayed.frames.map(frameToLine)
    state.trace.synth.push(...replayed.frames)
    if (replayed.frames.length) state.latest = replayed.frames[replayed.frames.length - 1].params
    const last = history.at(-1)
    if (last) {
      const pose = poseFor(last)
      state.feed = { pose }
      currentFeed = last
      currentFeedSource = 'scenario'
      operational = last.operational
      applyChoreography(last.feel, last.operational)
      publish('scenario', last.feel, last.operational, expressiveness, pose)
    } else {
      state.feed = restFeed()
      currentFeed = null
      currentFeedSource = 'scenario'
      operational = 'idle'
      applyChoreography(null, operational)
      publish('scenario', null, operational, expressiveness, poses.anchors.neutral)
    }
  })

  const clearPlayback = (writeTrace: boolean): void => {
    if (!state.replay) return
    if (writeTrace) {
      console.log(`[lares] replay done: ${state.replay.lines.length} synth frames traced`)
      window.lares.sendSynthTrace(state.replay.lines)
    }
    state.replay = null
    state.latest = null
    state.live = createSynth(idlePreset, Math.random) // fresh idle state after replay
  }

  window.lares.onScenarioEnd(() => {
    clearPlayback(true)
  })

  window.lares.onScenarioStopped(() => {
    clearPlayback(false)
  })

  // IRuntime.setParams is a sticky merge: an id stops being written but keeps
  // its last value forever. Every id the affect layer has ever driven is
  // therefore refilled with its resting value when a frame omits it.
  // Presentation only: the trace keeps the raw synth frame.
  const write = (
    st: StageState,
    frame: Record<string, number>,
    transient: ReadonlySet<string> = new Set()
  ): void => {
    let out = frame
    for (const id of st.driven) {
      if (id in out) continue
      if (out === frame) out = { ...frame }
      out[id] = st.defaults[id] ?? 0
    }
    for (const id of Object.keys(out)) if (!transient.has(id)) st.driven.add(id)
    st.runtime.setParams(out)
  }

  const withAuthoring = (st: StageState, frame: Record<string, number>): void => {
    if (authoringPreview === null) {
      write(st, frame)
      return
    }
    const transient = new Set(
      Object.keys(authoringPreview).filter((param) => !(param in frame))
    )
    write(st, withHeldPreview(frame, authoringPreview), transient)
  }

  const present = (): void => {
    const now = performance.now()
    if (state.replay) {
      // Replay frames were composed on tick arrival, on the scenario clock.
      if (state.latest) withAuthoring(state, state.latest)
    } else {
      const frame = state.live.computeFrame(posePreview ?? state.feed, now)
      withAuthoring(state, frame)
    }
    requestAnimationFrame(present)
  }

  const reset = (refreshDefaults = false, stopMain = true): void => {
    if (stopMain) {
      void window.lares.stopScenario().catch((error) => {
        console.error('[lares] scenario:stop failed', error)
      })
    }
    clearPlayback(false)
    posePreview = null
    authoringPreview = replaceHeldPreview(
      state.runtime,
      state.driven,
      authoringPreview,
      null
    )
    if (refreshDefaults) {
      state.defaults = Object.fromEntries(state.runtime.parameters().map((p) => [p.id, p.default]))
    }
    state.latest = null
    state.feed = restFeed()
    state.driven.clear()
    clearPendingPhrase()
    phraseKey = null
    state.runtime.resetParams() // also aborts any managed phrase
    currentFeed = null
    currentFeedSource = 'live'
    operational = 'idle'
    publish('live', null, 'idle', expressiveness, poses.anchors.neutral)
  }

  requestAnimationFrame(present)

  return {
    play(name: string, seed: number, speed = 1): void {
      if (state.replay) return
      state.replay = {
        synth: createSynth(idlePreset, mulberry32(seed)),
        preset: idlePreset,
        seed,
        lines: []
      }
      resetBuffer(state.trace)
      posePreview = null
      authoringPreview = replaceHeldPreview(
        state.runtime,
        state.driven,
        authoringPreview,
        null
      )
      void window.lares.playScenario(name, seed, speed).then((res) => {
        if (!res.ok) {
          console.error(`[lares] scenario:play refused: ${res.error}`)
          state.replay = null
          state.latest = null
          return
        }
        state.trace.endMs = res.endMs
      })
    },
    async stop(): Promise<void> {
      await window.lares.stopScenario()
      clearPlayback(false)
    },
    pause(): void {
      void window.lares.pauseScenario()
    },
    resume(): void {
      void window.lares.resumeScenario()
    },
    setSpeed(speed: number): void {
      void window.lares.setScenarioSpeed(speed)
    },
    seek(tMs: number): void {
      void window.lares.seekScenario(tMs)
    },
    buffer(): TraceBuffer {
      return state.trace
    },
    onPipeline(cb): void {
      pipelineListener = cb
      if (lastSnapshot) cb(lastSnapshot)
    },
    onFeed(cb): void {
      feedListener = cb
    },
    reset(): void {
      reset()
    },
    characterChanged(
      nextPreset: SynthPreset = defaultPreset,
      nextPoses: FeelPoses = DEFAULT_FEEL,
      nextChoreography?: ChoreographyMap
    ): CharacterChangeTransaction {
      const st = state
      const bufferedFeeds: AffectFeed[] = []
      const before = {
        preset: idlePreset,
        poses,
        choreography,
        posePreview,
        authoringPreview,
        defaults: st.defaults,
        driven: st.driven,
        feed: st.feed,
        live: st.live,
        latest: st.latest
      }
      const rollback = (): void => {
        if (tentativeFeeds !== bufferedFeeds) return
        idlePreset = before.preset
        poses = before.poses
        posePreview = before.posePreview
        authoringPreview = before.authoringPreview
        st.defaults = before.defaults
        st.driven = before.driven
        st.feed = before.feed
        st.live = before.live
        st.latest = before.latest
        // Rollback restores the previous mapping under a fresh generation
        // (§6): obsolete timers and phrase progress never survive it.
        choreography = before.choreography
        phraseGeneration += 1
        phraseKey = null
        clearPendingPhrase()
        tentativeFeeds = null
        for (const feed of bufferedFeeds) processFeed(feed)
        // Re-establish the unchanged latch once; drained feeds already did
        // this (identical key → inert), an empty drain schedules it here.
        if (!posePreview) applyChoreography(currentFeed?.feel ?? null, operational)
      }
      try {
        tentativeFeeds = bufferedFeeds
        idlePreset = nextPreset
        poses = nextPoses
        // Commit installs the new mapping as a new generation (§6); the
        // single latch schedule rides main's post-commit feed re-emission.
        choreography = nextChoreography
        phraseGeneration += 1
        phraseKey = null
        clearPendingPhrase()
        posePreview = null
        authoringPreview = null
        st.defaults = Object.fromEntries(st.runtime.parameters().map((p) => [p.id, p.default]))
        st.latest = null
        st.feed = restFeed()
        st.live = createSynth(idlePreset, Math.random)
        st.driven = new Set()
        st.runtime.resetParams()
        return {
          rollback,
          finalize: () => {
            if (tentativeFeeds !== bufferedFeeds) return
            tentativeFeeds = null
            reset(true, false)
          }
        }
      } catch (error) {
        rollback()
        throw error
      }
    },
    previewPose(feel, options): void {
      if (state.replay) return
      if (feel === null) {
        posePreview = null
        // Back to the displayed latch; its changed key re-runs the selector
        // without the latch ever having moved (§6).
        applyChoreography(currentFeed?.feel ?? null, operational)
        if (currentFeed) {
          const pose = poseFor(currentFeed)
          publish(currentFeedSource, currentFeed.feel, currentFeed.operational, expressiveness, pose)
        } else {
          publish('live', null, 'idle', expressiveness, poses.anchors.neutral)
        }
        return
      }
      const k = Math.min(10, Math.max(0, options?.expressiveness ?? expressiveness))
      const op = options?.operational ?? operational
      const target = poseForTuple(feel.valence, feel.activation, feel.control, k)
      const pose = withOverlay(target, op, poses.operational)
      posePreview = { pose }
      // Same selector and lifecycle as the live path; never writes the latch.
      applyChoreography(feel, op)
      publish('manual', feel, op, k, pose)
    }
  }
}
