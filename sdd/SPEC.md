# SPEC — Lares (project scope)

**Artifact:** SPEC · **Project:** Lares · **Status:** Living · **Date:** 2026-07-24

The technical contract for v1. Numeric values marked *(default)* are tunable constants in one config module; changing them is not a contract change. Changing schemas, interfaces, state machines, or scenarios is. Unit-level detail lives in slice SPECs (`sdd/slices/NNN-name/`, attached to ROADMAP milestones); slice SPECs refine this document and never contradict it.

---

## 1. Process architecture

One Electron app, split brain/body (D31). **Main process = the brain** (daemon): HTTP server, session table, affect engine, character package management, config, tray — contains no renderer knowledge; everything it emits is renderer-neutral (§8). **Renderer process = the body** (stage): transparent overlay window subscribing to the performance feed (§8) and translating it for its renderer — pixi-live2d-display behind the runtime interface, per-frame parameter synthesis, hit-testing. One body in v1; a future 3D body attaches at the same feed. **Hook forwarder**: a bundled script executed by the app binary under `ELECTRON_RUN_AS_NODE`; stateless, no imports beyond Node built-ins.

Module map (brain): `server/` (routes, MCP), `sessions/`, `affect/` (pure, zero Electron imports, vitest-covered), `characters/`, `scenario/`, `config/`. Body: `stage/` (window, feed subscription), `synth/` (feed → per-frame parameter synthesis), `runtime/` (pixi-live2d-display adapter).

## 2. Ingress

**Discovery file** `~/.lares/runtime.json`, written on listen, deleted on clean exit: `{ version, port, pid }`. No auth (D27): the server binds `127.0.0.1` only; port 21473 *(default)*, override in config. Port taken ⇒ fail loudly (no server, no discovery file, visible error) — never scan for a free port: registered MCP URLs bake the port in, so a moved port is a half-broken daemon pretending to be healthy (004-D4). Browser-origin defense instead of tokens: any request carrying an `Origin` header is rejected, and POST routes require `Content-Type: application/json` (forces browsers into a failing CORS preflight). Local processes are outside the threat model — anything running as the user could have read a token file anyway.

**Event route** `POST /v1/events` — envelope: `{ v: 1, harness: "claude-code" | "codex", session_id, cwd?, pid?, event: <harness-native JSON passthrough> }`. The forwarder adds the envelope and stamps a captured harness pid when the hook shell exposes one (`$PPID` on POSIX). Windows `cmd` exposes no parent pid, so the forwarder omits it rather than stamping the short-lived shell; `pid` stays optional and §3's silence reap covers Windows and MCP-only session knowledge (004-D5, 005-D9). All interpretation is server-side (adapter modules per harness). Responses: `202` accepted, `403` origin-rejected, `422` unparseable. Forwarder behavior: read discovery file; if absent or connection refused, exit 0 silently within 50ms (agents degrade gracefully, P3/D14); never block the harness beyond a 500ms *(default)* total budget.

**MCP** — streamable HTTP at `POST /v1/mcp` (no token, D27). The server's MCP `instructions` field is the primary emote-adoption vector (D26): Context7-style trigger/anti-trigger guidance — emote at meaningful beats (session start, state change, third consecutive failure, recovery, completion), never per tool call — and tool descriptions are themselves written as triggers. Tools:
- `emote(cue?, params?, intensity?, duration_s?, queue?, label?)` — the one expression tool, both branches (004-D2): exactly one of `cue` | `params`, both or neither ⇒ tool error. Cue branch: package cue, affect nudge `(Δv, Δa) · intensity` (§4). Params branch (freeform `{paramId: value}`): drives knobs directly, nudges nothing; `intensity` ignored-with-warning, `label` names the composition for `status()` and the authoring bridge. `queue` defaults true; false clears pending non-preempting expressions and plays this expression next.
- `list_cues()` → cues with affect coordinates and source (bundled | authored | raw)
- `status()` → active character, session summary, protocol version
- Authoring (D25 loop; ships M4, 004-D1): `list_parameters()` (id, name, min, max, default — from the active body's reported inventory, §8), `preview_expression(params)` (renders on the live Lar, auto-reverts after 5s), `save_expression(name, params)` (writes pending; activates only after user acceptance in-app).

**Caps (all server-enforced, P7):** intensity ∈ [0,1]; duration ≤ 30s, default 6s; queue depth ≤ 4 (append rejected beyond, `429`-equivalent tool error); freeform ≤ 24 params, each clamped to its range in the body-reported inventory (§8), unknown paramIds dropped; emote rate ≥ 2s spacing *(default)* per source — excess is coalesced, not rejected: the affect nudge still applies (saturation-scaled, §4), no new expression is enqueued, and the tool response says so (004-D6); `save_expression` ≤ 20 pending.

## 3. Sessions

Table row: `{ session_id, harness, cwd, state, since, last_event_at, subagents: n, pid? }`. Created on SessionStart (or first event); Stop retains the row in `done`, while SessionEnd removes it. **Liveness:** rows with a known pid are reaped when the pid dies; rows without, after 30min *(default)* of silence.

**States and priority:** `awaiting_input (100) > error (80) > working (60) > thinking (50) > done (30) > idle (10)`. Displayed baseline = max priority across live sessions (P10). `done` decays to `idle` after 60s *(default)*; after 90s without events, working/thinking/done display as idle, but live awaiting_input/error rows remain loud (P10); idle for 10min → sleep sequence.

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

Codex ships no dedicated failure event; the M3b recon looks for a failure signal in its PostToolUse payload. If none exists, Codex sessions never enter `error` — failures read as `working` until Stop — a documented degradation accepted under P11 (005-D6), never patched by inference or file-reading.

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

**Claude Code:** silent launch-time registration (D29), re-run idempotently on every launch and on port change. Hooks: user-scope `~/.claude/settings.json`, owned by content-recognition — JSON has no comment markers, so a Lares entry is *defined* as any hook whose command references the bundled forwarder (any path variant, which also catches stale entries from moved installs); re-sync removes every recognized entry and appends the current set, preserving all other content byte-for-byte in structure (the field pattern — claude-pet, code-notify; 005-D1). Hooks registered: SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, PostToolUseFailure, Notification (matcher: `permission_prompt`), Stop, SubagentStart, SubagentStop — each runs the app binary with `ELECTRON_RUN_AS_NODE=1`, the bundled forwarder path, and harness tag `claude-code`; POSIX commands also capture `LARES_HARNESS_PID=$PPID`, while Windows commands clear it (005-D9). The full set was verified present in Claude Code 2.1.219 during M2a recon (failure payloads carry `error`, successes `tool_response`); permission `Notification`s do not fire in headless `-p` runs, so M3b's verification needs an interactive session. `idle_prompt` notifications are deliberately not registered — waiting-for-next-prompt is done/idle territory, already covered by Stop + decay. MCP entry: `mcpServers.lares` in `~/.claude.json` — the only file Claude Code reads user-scope MCP servers from — direct-edited, write-only-if-different with atomic rename (the stable port means one write per install, ever); file missing or unparseable ⇒ skip + log, never create or repair it (005-D2). Safety on both files: parse failure ⇒ abort loudly, touch nothing; `~/.claude/` absent ⇒ Claude Code isn't installed, skip silently, re-check next launch; a one-time backup is written before the first-ever modification and never overwritten after. Uninstall is the removal pass alone — a dev script in M3b; tray and installer entry points attach to the same function at M5a (005-D3). Hooks written while a session is live take effect on the next session (Claude Code snapshots hook config at session start); adapter UX says so. Skill file follows in the post-M3b skills pass (reinforcement only, D26).

**Codex:** a Lares plugin — a directory with a `.codex-plugin/plugin.json` manifest bundling the hook set (same events plus PermissionRequest) and the streamable-HTTP MCP entry (`http://127.0.0.1:<port>/v1/mcp`, no token — D27), skills slot filled post-M3b — hosted in the Lares GitHub repo as a plugin marketplace; the user adds the marketplace and installs via `/plugins`, passing Codex's own trust flow (guided, never bypassed — D29). The plugin stays thin — hook commands and the baked URL, no logic — so repo-HEAD stays compatible with any installed daemon (the wire contract froze at M3a). Plugin hook commands can't bake a per-machine app path, so they invoke a launcher shim the app maintains at a stable path (`~/.lares/bin/`), re-stamped with the current app binary on every launch (005-D8). No fallback of any kind: push-only sensing (P11, amending D15) — a Codex without the plugin is unsensed, and failure mapping degrades per §3 if recon finds no failure signal. **Known harness gap (D15, 2026-07-28):** current Codex builds trust-review plugin hooks but never execute them (`plugin_hooks` removed-and-off), so the plugin delivers MCP only — emotes work, baseline states don't. The design-around — an app-written user-level `~/.codex/hooks/hooks.json` under the Claude Code writer discipline, Codex's trust review still gating — is post-005 work; tripwire to revert is Codex shipping plugin-hook execution.

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

Hook fire → visible reaction ≤250ms (forwarder spawn ≤120ms, POST ≤10ms, ingest ≤5ms, IPC ≤16ms, onset ≤100ms) — this budget is load-bearing for legibility and stays hard. Forwarder total ≤500ms hard budget, spawn included; the silent-exit path's ≤50ms binds in-script time only (script entry → exit, self-measured) — process startup alone exceeds 50ms on real machines (bare Node median 51.8ms, Electron-as-Node ~100–118ms; 004-D8), and the harness turn proceeds regardless. Renderer targets 30fps flat (ticker cap). Footprint numbers (idle ~3% of one core, <300MB RSS combined) are soft targets, not milestone gates — optimization is explicitly not a v1 focus; frame-rate governor and occlusion-paused rendering are parked post-v1. Zero network beyond §2 loopback and the disclosed update check.
