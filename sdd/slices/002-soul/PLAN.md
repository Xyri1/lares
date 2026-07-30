# Slice 002 — Soul · PLAN

Execution notes; disposable after the gate closes. Steps ordered by
dependency; each ends in something runnable.

---

## 1. Engine core

`src/main/affect/`: state + tick (caller-supplied clock), decay, mood
EMA with rest-point shift, nudge table, per-source saturation, expression
stack (expiry, FIFO queue, preemption), nearest-cue selection with
hysteresis. Constants in one module. Vitest as each piece lands — the
suite is A1 and the freeze line (D28). No Electron imports; enforce by
convention like `runtime/`.

## 2. Event→state mapping + resolver

`src/main/sessions/`: `mapEvent` per root §3 (claude-code rows only),
unknown events → null; single-session resolver behind a set-shaped
interface (002-D1 fence). Tests: every table row + an unknown event.

## 3. Scenario format + runner

Scenario parse (root §7 shape), scenario clock with timeScale, in-process
injection into engine + resolver. Author the four goldens under
`scenarios/` with real hook JSON captured from a live Claude Code session
(one session's worth of envelopes covers all §3 rows; hand-trim into the
four arcs). Trace writer (per-tick engine snapshot). Test: golden runs
twice → identical engine-side traces (A3's main half, pre-renderer).

## 4. Feed + synth

`affect:update` IPC (on-change or ≤10Hz, stage id field); renderer
`synth/` module: seeded PRNG (replay) vs Math.random (live), idle
modulation per root §4, rung-(a) trend curves reading a mapping preset
object (`presets/default.json`). Synth outputs appended to the trace.
Hiyori visibly breathes/blinks/sways with affect by the end of this step.

## 5. Starter cues

Author the seven param sets against Hiyori's inventory (dev panel sliders
→ copy values); manifest gains `expressions` coords (slice SPEC §7
defaults) and `renderers.live2d.cues`. Panel preview button per cue.
The maintainer eyeballs each on the live model before values freeze (A6's visual
half).

## 6. Player tab + trace overlay

Dev-panel scenario tab: picker, play/pause, scrub, 1×/8×/64×; trace
overlay canvas (E/M curves, state bands, selectable synth params) reading
the live trace buffer. Values must match the trace file (A6/A8 of slice
SPEC — overlay is diagnostic, not decorative).

## 7. Dual-stage A/B

Second engine instance + second stage canvas; per-stage preset selection;
same scenario ticks + seed to both; window widens in A/B mode. Traces
written per stage (A5).

## 8. Gate run

A1–A7 checklist from slice SPEC §9 on Windows; macOS repeat is a render
smoke (A4) only — physics and determinism are OS-independent. Close out:
mark ROADMAP M2a closed, note anything learned about golden-scenario
realism for M2b's judging, seed slice 003 (M2b) with the preset format
actually shipped.

## Gate run

A1–A7 exercised on Windows. **Not closed** — three items need the maintainer's
eyes (below). Verified so far:

- **A1 / A2 / A6 (unit half)** — 97 vitest tests green: engine physics,
  the §3 mapping table, scenario determinism, seek equivalence, A/B, and
  nearest-cue selection at each cue's own coordinates.
- **A3, the gate** — `smooth-build` and `recovery-arc`, seed 42, each run
  at 1× and at 64× through the real app (engine → IPC → renderer synth →
  trace writer): trace files byte-identical within each pair. Determinism
  holds end-to-end, not only in the pure modules.
- **A4** — 1× replay: zero renderer console errors, 29.5fps mean against
  the 30fps cap, and the authored cues visibly on the model. The first
  pass recorded a **false green** here: it sampled core values off the
  pixi ticker, which runs *before* the render pass, so it reported writes
  that were overwritten and never drawn. Sample at `beforeModelUpdate` —
  see the resolved risk below.
- **A5** — dual-stage `recovery-arc`, default vs expressive preset:
  engine halves byte-identical, every synth line differing. A single-stage
  run afterwards reproduced stage A byte-for-byte — A/B mode costs the
  normal path nothing.
- **A7** — no `server/` module, nothing binds a port, the resolver
  refuses more than one session.

**Cleared by the maintainer:** the macOS render smoke, the "visibly
tracks it" judgement (A4), and the seven cue faces reading as distinct on
the model (A6's visual half) — the last only after the expression defect
below was fixed. Cue param values are frozen as of that pass.

**Preset format as shipped** — seeds M2b; slice SPEC §5 called for data,
not code, and this is the data:
`{ params: [{ id, source: 'valence'|'arousal', gain, offset, weight? }],
idle: { breath: { id, basePeriodMs, amplitude }, blink: { ids,
baseIntervalMs, durationMs, valenceGain }, sway: { id, baseAmplitude,
periodMs } } }`. Two ship: `presets/default.json` and
`presets/expressive.json`, the latter a deliberately louder variant built
as the A/B foil.

**Golden realism, for M2b's judging:** the goldens carry real hook JSON
with one exception — permission `Notification` payloads never fire in
headless `claude -p` runs (permission enforcement appears to
short-circuit before hook dispatch), so `long-wait-for-input` uses a
documented payload shape rather than a captured one. The arc it drives is
real; that one envelope is not. The same trap waits for M3b's adapter
testing.

**Follow-ups left in the code, deliberately:**

- Trace filenames encode name and seed but not speed, so reproducing A3
  by hand overwrites one leg with the other — copy the file between runs.
- `writeTrace` resolves `traces/` against the process cwd; fine in dev,
  wants an app-path anchor before anything ships packaged.
- The trace overlay graphs stage A only; both stages' traces are written.
- The affect layer takes permanent ownership of every parameter it
  touches (sticky `setParams`, no release), so Hiyori's bundled idle
  motion stops animating those params for the session. Deliberate — the
  affect layer owns the face — and it is why the panel's `reset` exists.

## Standing risks

- Rung-(a) mapping may look wrong immediately — that's M2b's problem by
  design; this slice only requires the machinery to move the face, not
  to move it well. Resist tuning during the build (D28 discipline).

**Resolved during the build:**

- *Two Hiyori instances in one window.* Two pixi Applications do **not**
  work: the texture cache is keyed globally, so the second WebGL context
  steals stage A's textures and blanks it. One Application hosting two
  models on a shared 30fps ticker is clean — textures shared, only the
  Cubism instance duplicated. No fallback to two windows; 001-D4 upheld.
- *Authored expressions never reached the screen* (found at the gate, by
  eye — every automated check was green). Two defects, one symptom. The
  runtime wrote parameters from the pixi ticker, which runs after render,
  while pixi-live2d-display does the model's real work *inside* the
  render pass — where Hiyori's auto-started `Idle` motion group rewrites
  every parameter it owns. Everything written was stomped before it was
  drawn. Separately, the renderer never read `expressionStack`, so
  playback applied no cue at all. Fixed with one compositor (defaults →
  trend → idle → stack → preview) shared by preview and playback;
  preempt entries resolve to a real cue in main via the engine's own
  `selectCue()`, so the feed still carries cue names only (P6). Lesson
  for M2b: read core values at `beforeModelUpdate`, never off the ticker,
  or the instruments will confirm a face that never rendered.
- *Real hook JSON capture.* Every event in the root §3 table exists in
  Claude Code 2.1.219, `PostToolUseFailure` and `SubagentStart` included
  — no root SPEC delta. Failure payloads carry `error`, successes carry
  `tool_response`. See the `Notification` caveat above.
