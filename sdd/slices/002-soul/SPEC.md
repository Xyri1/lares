# Slice 002 — Soul · SPEC

**Artifact:** Slice SPEC · **Slice:** 002-soul (= ROADMAP M2a) · **Status:** Draft

**Why / gate.** Build the affect machinery and the tuning harness so M2b can
attack the thesis risk (P8 legibility) with tools instead of vibes. Exit
gate (ROADMAP M2a): *golden scenarios replay deterministically through the
live engine driving the rendered model; physics unit tests green and
frozen; A/B playback and trace overlay usable.* Agent-verifiable by
construction.

Refines root SPEC §3/§4/§7/§8; contradicts nothing. Binding within the
slice; root SPEC stays source of truth.

---

## 1. Scope

**In:** affect engine (`src/main/affect/`, root §4 complete, pure TS,
frozen behind vitest); Claude Code event→state mapping (root §3 table) as
a pure function; single-session state resolver; performance feed over IPC;
body-side `synth/` (idle modulation + rung-(a) continuous mapping);
scenario format + deterministic player with the four goldens; dual-stage
side-by-side A/B; parameter-trace overlay; seven starter cues authored on
Hiyori.

**Out (fence):** HTTP server, MCP, discovery file (M3a); session-table
liveness (pid reaping, silence timeouts) and multi-session P10 aggregation
(M3a); harness adapters and hook registration (M3b); overlay chrome (M1b);
expression auto-import and authoring tools (M4); the tuning iteration
itself (M2b — this slice builds the harness, it never judges with it).

## 2. Affect engine (root §4, in full)

`src/main/affect/`: zero Electron imports, vitest-covered. State
`E = (valence, arousal)` + mood `M`; tick at 10Hz on a caller-supplied
clock (wall time live, scenario time in replay — never `Date.now()`
internally). Dynamics exactly as root §4: decay half-life, mood EMA with
rest-point shift, nudge table (cue `(Δv, Δa) · intensity`; baseline-state
built-ins), per-source saturation, expression stack with expiry and
preemption, nearest-cue selection with 0.1 hysteresis. All numeric values
live in one constants module (root SPEC preamble: tunable, not contract).

**Frozen at gate:** the physics passes its unit suite and thereafter
changes only with a root SPEC delta. M2b touches mapping presets (§5),
never this module.

## 3. Ingestion without a server (002-D1)

No HTTP in this slice. The engine ingests §2-shaped envelopes in-process:

- `mapEvent(envelope) → state | null` — the root §3 table for
  `harness: "claude-code"`, implemented as a pure function in
  `src/main/sessions/`; unknown event names → `null` (dropped, logged).
  M3b reuses this function server-side unchanged.
- Single-session resolver: one live session, its state is the baseline.
  No liveness, no aggregation (fence). The resolver's interface takes
  a session set so the M3a upgrade is additive, not a rewrite.

## 4. Scenario player (root §7, made deterministic)

Scenario files per root §7 (`{ name, timeScale, events: [{ at_ms,
envelope | emote }] }`); envelopes are real Claude Code hook JSON. The
four goldens ship in-repo under `scenarios/`. Player runs in main,
injecting into the engine through the same code path M3a's routes will
call.

**Determinism (002-D3):** replay mode drives engine and synth from the
scenario clock and a fixed seed (seeded PRNG for blink jitter / sway
phase; live mode stays unseeded). Each run writes a trace file (JSON,
gitignored dir): per-tick `E`, `M`, baseline state, expression stack, and
per-frame synth parameter outputs. Two runs of the same golden + seed →
byte-identical traces, at 1× and 64×.

**Controls:** pick scenario, play/pause, scrub, speed 1×/8×/64×. Recording
stays OS screen capture (root §7).

## 5. Feed and synth (root §8 subset)

Brain→body IPC `affect:update` (on-change or ≤10Hz): `{ E, M,
baselineState, expressionStack, beats }` — renderer-neutral, cue names
only. Body `synth/` owns per-frame values at the 30fps cap: root §4 idle
modulation (breath/blink/sway from arousal) plus the rung-(a) continuous
mapping — brow/mouth/eye-openness trend curves from valence/arousal.

**Mapping presets:** the affect→parameter mapping reads from a preset
object (curve shapes, gains, per-param weights) loadable per stage —
data, not code, so M2b iterates without touching frozen modules. Presets
live in-repo under `presets/`.

## 6. Dual-stage A/B (002-D2)

The window hosts one stage normally, two side by side in A/B mode: each
stage = own engine instance + own IRuntime (Hiyori loaded twice) + own
mapping preset, fed the same scenario ticks and the same seed. Feed
messages carry a stage id. The weekly D28 artifact is a screen capture of
this window; no compositing.

## 7. Starter cues (002-D4)

Seven cues authored by hand on Hiyori as raw parameter sets (D25 rung 3 —
she bundles no `.exp3.json`): `focused, frustrated, dejected, alert,
pleased, weary, neutral`. Manifest gains their affect coordinates
(`expressions` block) and param sets (`renderers.live2d.cues`). Initial
coordinates *(defaults, tunable)*: neutral (0.1, 0.25) = rest point;
focused (0.2, 0.45); frustrated (−0.5, 0.65); dejected (−0.6, 0.2);
alert (0.05, 0.7); pleased (0.55, 0.45); weary (−0.15, 0.15).

## 8. Trace overlay

In-panel graph over scenario time: `E`/`M` components, baseline state
bands, and selectable synth parameters; values identical to the trace
file. Diagnostic instrumentation (root §9 S1 note), not a pass bar.

## 9. Acceptance (GWT)

**A1 — Physics frozen.** GIVEN the vitest suite THEN decay half-life,
mood EMA + rest-point shift, nudge table, per-source saturation, stack
expiry/preemption, and cue-selection hysteresis are each covered and
green.

**A2 — Mapping table.** GIVEN each root §3 row for claude-code THEN
`mapEvent` returns the specified state; unknown events drop with no
throw.

**A3 — Determinism (the gate).** GIVEN any golden + fixed seed run twice
at 1× and at 64× THEN both trace files are byte-identical.

**A4 — Live replay.** GIVEN a golden replayed at 1× THEN rendered Hiyori
visibly tracks it (state changes, expressions, idle modulation) at ≤30fps
with no console errors.

**A5 — A/B.** GIVEN two stages with different presets and the same golden
+ seed THEN both play simultaneously side by side and their traces differ
only in synth parameter outputs.

**A6 — Cues.** GIVEN the seven cues THEN each renders a visibly distinct
face via panel preview, and the engine's nearest-cue pick at each cue's
own coordinates is that cue (unit test).

**A7 — Fence.** GIVEN the running app THEN no port is bound and no
`server/` module exists; the resolver handles exactly one session.
