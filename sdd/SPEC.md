# SPEC — Lares (project scope)

**Artifact:** SPEC · **Project:** Lares · **Status:** Living · **Date:** 2026-07-24

The technical contract for v1. Numeric values marked *(default)* are tunable constants in one config module; changing them is not a contract change. Changing schemas, interfaces, state machines, or scenarios is. Unit-level detail lives in slice SPECs (`sdd/slices/NNN-name/`, attached to ROADMAP milestones); slice SPECs refine this document and never contradict it.

---

## 1. Process architecture

One Electron app, split brain/body (D31). **Main process = the brain** (daemon): HTTP server, session table, affect engine, character package management, config, tray — contains no renderer knowledge; everything it emits is renderer-neutral (§8). **Renderer process = the body** (stage): transparent overlay window subscribing to the performance feed (§8) and translating it for its renderer — pixi-live2d-display behind the runtime interface, per-frame parameter synthesis, hit-testing. One body in v1; a future 3D body attaches at the same feed. **Hook forwarder**: a bundled script executed by the app binary under `ELECTRON_RUN_AS_NODE`; stateless, no imports beyond Node built-ins.

Module map (brain): `server/` (routes, MCP), `sessions/`, `affect/` (pure, zero Electron imports, vitest-covered), `characters/`, `scenario/`, `config/`. Body: `stage/` (window, feed subscription), `synth/` (feed → per-frame parameter synthesis), `runtime/` (pixi-live2d-display adapter).

## 2. Ingress

**Discovery file** `~/.lares/runtime.json`, written on listen, deleted on clean exit: `{ version, port, pid }`. No auth (D27): the server binds `127.0.0.1` only; port 21473 *(default)*, override in config. Port taken ⇒ fail loudly (no server, no discovery file, visible error) — never scan for a free port: registered MCP URLs bake the port in, so a moved port is a half-broken daemon pretending to be healthy (004-D4). Browser-origin defense instead of tokens: any request carrying an `Origin` header is rejected, and POST routes require `Content-Type: application/json` (forces browsers into a failing CORS preflight). Local processes are outside the threat model — anything running as the user could have read a token file anyway.

**Event route** `POST /v1/events` — envelope: `{ v: 1, harness: "claude-code" | "codex", session_id, cwd?, pid?, event: <harness-native JSON passthrough> }`. The forwarder adds the envelope and stamps `pid: process.ppid` — its parent is the harness process, which gives §3 liveness its probe target; `pid` stays optional because MCP-only session knowledge never has one (004-D5). All interpretation is server-side (adapter modules per harness). Responses: `202` accepted, `403` origin-rejected, `422` unparseable. Forwarder behavior: read discovery file; if absent or connection refused, exit 0 silently within 50ms (agents degrade gracefully, P3/D14); never block the harness beyond a 500ms *(default)* total budget.

**MCP** — streamable HTTP at `POST /v1/mcp` (no token, D27). The server's MCP `instructions` field is the primary emote-adoption vector (D26): Context7-style trigger/anti-trigger guidance — emote at meaningful beats (session start, state change, third consecutive failure, recovery, completion), never per tool call — and tool descriptions are themselves written as triggers. Tools:
- `emote(cue?, params?, intensity?, duration_s?, queue?, label?)` — the one expression tool, both branches (004-D2): exactly one of `cue` | `params`, both or neither ⇒ tool error. Cue branch: package cue, affect nudge `(Δv, Δa) · intensity` (§4). Params branch (freeform `{paramId: value}`): drives knobs directly, nudges nothing; `intensity` ignored-with-warning, `label` names the composition for `status()` and the authoring bridge.
- `list_cues()` → cues with affect coordinates and source (bundled | authored | raw)
- `status()` → active character, session summary, protocol version
- Authoring (D25 loop; ships M4, 004-D1): `list_parameters()` (id, name, min, max, default — from the active body's reported inventory, §8), `preview_expression(params)` (renders on the live Lar, auto-reverts after 5s), `save_expression(name, params)` (writes pending; activates only after user acceptance in-app).

**Caps (all server-enforced, P7):** intensity ∈ [0,1]; duration ≤ 30s, default 6s; queue depth ≤ 4 (append rejected beyond, `429`-equivalent tool error); freeform ≤ 24 params, each clamped to its range in the body-reported inventory (§8), unknown paramIds dropped; emote rate ≥ 2s spacing *(default)* per source — excess is coalesced, not rejected: the affect nudge still applies (saturation-scaled, §4), no new expression is enqueued, and the tool response says so (004-D6); `save_expression` ≤ 20 pending.

## 3. Sessions

Table row: `{ session_id, harness, cwd, state, since, last_event_at, subagents: n, pid? }`. Created on SessionStart (or first event), removed on Stop/SessionEnd; **liveness**: rows with a known pid are reaped when the pid dies; rows without, after 30min *(default)* of silence.

**States and priority:** `awaiting_input (100) > error (80) > working (60) > thinking (50) > done (30) > idle (10)`. Displayed baseline = max priority across live sessions (P10). `done` decays to `idle` after 60s *(default)*; no events across all sessions for 90s → idle; idle for 10min → sleep sequence.

**Event→state mapping (normative for v1 adapters):**

| Harness event | State |
|---|---|
| SessionStart / UserPromptSubmit | thinking |
| PreToolUse / PostToolUse | working |
| PermissionRequest (Codex) / Notification-permission (Claude Code) | awaiting_input |
| Stop (turn end, no error) | done |
| PostToolUseFailure (Claude Code) / tool-failure equivalent (Codex — verify in M3) | error |
| SubagentStart / SubagentStop | working + subagent count |

Adapters may refine within a state (e.g., tool name in the session card) but not add states without a SPEC-delta.

## 4. Affect engine

**State:** `E = (valence ∈ [-1,1], arousal ∈ [0,1])` (emotion, fast) and `M` (mood, slow), both vectors. Rest point `E₀ = (0.1, 0.25)` *(default)*.

**Dynamics** (ticked at 10Hz in main):
- Decay: `E ← E₀ + (E − E₀) · 0.5^(Δt / t½)`, `t½ = 45s` *(default)*.
- Mood: exponential moving average of E, `τ = 15min` *(default)*; mood shifts the effective rest point: `E₀' = E₀ + 0.5·(M − E₀)`.
- Nudges: cue emotes apply the character package's `(Δv, Δa) · intensity`; baseline-state transitions apply small built-in nudges (error: (−0.3, +0.2); awaiting_input: (0, +0.15); done: (+0.25, −0.05)) *(defaults)*.
- **Saturation:** the nth same-cue nudge inside 60s is scaled by `0.5^(n−1)`; counters reset on a different cue or after 60s quiet. Counters are scoped per source — harness `session_id` for hook nudges, `Mcp-Session-Id` for MCP emotes, one shared bucket for anonymous HTTP clients — so independent sessions don't discount each other's feelings.

**Expression stack:** active expressions are `(cueOrFreeform, weight, expiry)`; queue plays FIFO with cross-fade; a new `awaiting_input`/`error` baseline preempts the queue (current expression fades over 300ms, queue preserved and resumed unless expired). Cue selection when the engine (not the agent) needs an expression: nearest available cue by Euclidean affect distance with 0.1 hysteresis to prevent flapping. The expression queue is a single global resource in v1 — all sessions share it; interleaving is by design (D11).

**Performance feed (brain→body, §8)** (IPC, on-change or ≤10Hz): `{ E, M, baselineState, expressionStack, beats: [motionTriggers] }` — renderer-neutral: expressions ride as cue names or opaque knob sets, never renderer asset references; cue→asset resolution is body-side. A *knob* is a model-declared control (a Live2D parameter today; a blendshape or bone channel in a future body) — the brain carries knob values but never interprets them. The body's `synth/` owns per-frame values: breath rate = `base · (0.7 + 0.6·arousal)`; blink interval = `base / (0.6 + 0.8·arousal)`; idle sway amplitude scaled by arousal; brow/mouth/eye-openness trend curves driven by valence *(all defaults, per-character overridable in `idleModulation`)*. **No inference anywhere in this section's path (P4).**

## 5. Character package

`lar.character.json`, `format: "lares/1"`:

```jsonc
{
  "format": "lares/1",
  "identity": { "name", "author", "license", "persona" },
  "expressions": { "<cue>": { "valence": n, "arousal": n } },
  "renderers": {
    "live2d": {
      "model": "<path to .model3.json>",
      "cues": { "<cue>": { "expression": "<exp3 name>" } | { "motion": "<group[:index]>" } | { "params": {…} } },
      "idleModulation": { "breath"?: paramId, "blink"?: …, "swayScale"?: n },
      "hitAreas"?: ["Body", "Head"]
    }
  }
}
```

Identity and `expressions` are renderer-neutral (P5). Import validation: schema check; every cue in `expressions` resolvable in the active renderer block (or explicitly marked degraded); referenced files exist; params within the body-reported inventory ranges (§8), checked once the body loads the model. Bundled-expression auto-import (D25 rung 1) generates the initial `cues` mapping at import time; agent-authored expressions (rung 2) append `.exp3.json` files under the package's `authored/` directory after user acceptance.

## 6. Harness adapters

**Claude Code:** managed block in `~/.claude/settings.json` (marker-delimited, idempotent re-sync on app launch, clean uninstall; registration is silent in v1 alpha per D29 — Claude Code imposes no trust gate on user-level hooks; consent UX revisited before public launch). Hooks registered: SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, PostToolUseFailure, Notification (matcher: `permission_prompt`), Stop, SubagentStart, SubagentStop — each `ELECTRON_RUN_AS_NODE=1 "<appPath>" "<forwarder.js>" claude-code`. The full set was verified present in Claude Code 2.1.219 during M2a recon (failure payloads carry `error`, successes `tool_response`); permission `Notification`s do not fire in headless `-p` runs, so M3b's verification needs an interactive session. `idle_prompt` notifications are deliberately not registered — waiting-for-next-prompt is done/idle territory, already covered by Stop + decay. The same managed write registers the Lares MCP server (user scope, URL from the configured port). Hooks written while a session is live take effect on the next session (Claude Code snapshots hook config at session start); adapter UX says so. Skill file is reinforcement only (D26): sparse emoting, meaningful beats, ≥1 per state change max, prefer `list_cues` result, freeform when none fit.

**Codex:** hooks written to Codex's hooks config for the same event set plus PermissionRequest; registration surfaces Codex's trust flow with guided instructions (never bypassed). Fallback: if hooks are untrusted/unavailable, tail `~/.codex/sessions/*.jsonl` for state inference (poll 2s *(default)*); fallback is state-only. MCP server entry written to Codex config pointing at `http://127.0.0.1:<port>/v1/mcp` (no token, D27; written once, re-synced only on port change). Codex failure-event coverage is an M3 verification item — if none exists, Codex's `error` state degrades to JSONL-fallback quality.

## 7. Scenario player

Scenario file: `{ name, timeScale, events: [{ at_ms, envelope | emote }] }`. Player injects through the same ingress path as real traffic (in-process, past the §2 origin checks). Golden scenarios ship in-repo: `brutal-debugging-session`, `smooth-build`, `long-wait-for-input`, `recovery-arc`. UI: pick scenario, scrub, speed 1×/8×/64×, record (export via OS screen capture guidance, no built-in encoder in v1). Default Lar size — the normative judging size in §9 (S1, S5) — is the model rendered 400 logical px tall, DPI-scaled.

## 8. Interfaces (the P6 seam)

**Performance feed — the P6 seam (D31).** The brain↔body channel is the renderer-neutral contract; nothing renderer-specific crosses it (cue names cross, asset references don't). Brain→body: `affect:update` (§4 feed), `authoring:preview`/`authoring:revert` (opaque knob sets), `scenario:*`. Body→brain: `stage:pointer` (hit results → click-through toggling), `body:inventory` (knob list — id, name, min, max, default — reported on model load; the brain validates freeform and authoring traffic against it and never interprets knob meaning — cached per active character so validation survives a DND hide; before any inventory exists, freeform and authoring calls fail with a tool error, per P7). Known limitation, accepted: freeform compositions are body-specific by nature — knob names come from the loaded model; `status()` reports the active body, richer mode feedback deferred (D31). The body never receives raw ingress events.

**IRuntime (body-internal):** `load(modelPath)`, `parameters(): ParamInfo[]`, `setParams(batch, weight?)`, `resetParams()` (the inverse of `setParams` — restores model defaults and drops driven-param ownership; `setParams` is a merge and cannot undo itself), `applyExpression(ref|params, weight, fadeMs)`, `playMotion(group, index?, priority)`, `hitTest(x, y): area[]`. pixi-live2d-display is the sole v1 implementation; nothing outside `runtime/` imports it. An implementation detail of the v1 body, not a cross-body contract.

## 9. Acceptance scenarios (GWT)

**S1 — History-dependence (public-launch-blocking, P8/D28).** GIVEN the recovery-arc scenario at 1× WHEN the third `error` within 5min lands THEN the A/B recording at default Lar size reads visibly more dejected than the first error (forced-choice panel); the ≥15% delta on ≥2 emotion-mapped params is diagnostic instrumentation, not the pass bar.

**S2 — Continuity.** GIVEN any golden scenario WHEN any transition occurs THEN no driven parameter changes by more than its full range within a single frame, and error→done passes through an intermediate positive-valence, decaying-arousal window ≥800ms before celebration.

**S3 — Temporal texture.** GIVEN 10min simulated heavy session vs fresh launch WHEN both reach idle THEN breath rate, blink interval, and sway amplitude distributions differ measurably and visibly.

**S4 — Decay.** GIVEN a single frustrated(1.0) emote and silence WHEN 45s elapse THEN |E − E₀'| has halved; WHEN 3min elapse THEN expression reads neutral on recording.

**S5 — Legibility.** GIVEN pet-only recordings of the four goldens at default Lar size WHEN shown to ≥5 uninvolved viewers THEN working/stuck/needs-input/done identified ≥80%.

**S6 — Aggregation (P10).** GIVEN session A working and session B awaiting_input WHEN both live THEN displayed baseline is awaiting_input; WHEN B resolves THEN working resumes ≤1s.

**S7 — Queue & preemption.** GIVEN a 3-expression queue playing WHEN awaiting_input arrives THEN current expression fades ≤300ms, the alert presents, and the unexpired queue resumes after resolution.

**S8 — Saturation.** GIVEN five frustrated(1.0) emotes in 60s THEN total valence displacement < 2× a single emote's.

**S9 — Daemon-down grace.** GIVEN the app closed WHEN a hook fires THEN the forwarder exits 0 within 50ms and the harness turn proceeds unaffected; WHEN an MCP emote is attempted THEN the agent receives connection-refused and its instructions (D26) tell it to continue silently.

**S10 — Untrusted ingress (P7).** GIVEN a freeform emote with 40 params, values 10× out of range, an unknown paramId, and duration 999 THEN the daemon clamps ranges, drops unknowns, caps duration at 30s, rejects params beyond 24 — and never interpolates agent strings into anything executable.

## 10. Non-functional budget

Hook fire → visible reaction ≤250ms (forwarder spawn ≤120ms, POST ≤10ms, ingest ≤5ms, IPC ≤16ms, onset ≤100ms) — this budget is load-bearing for legibility and stays hard. Forwarder total ≤500ms hard budget, silent-exit path ≤50ms. Renderer targets 30fps flat (ticker cap). Footprint numbers (idle ~3% of one core, <300MB RSS combined) are soft targets, not milestone gates — optimization is explicitly not a v1 focus; frame-rate governor and occlusion-paused rendering are parked post-v1. Zero network beyond §2 loopback and the disclosed update check.
