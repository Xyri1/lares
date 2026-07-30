# SPEC — Lares (project scope)

**Artifact:** SPEC · **Project:** Lares · **Status:** Living · **Date:** 2026-07-29

The technical contract for v1. Numeric values marked *(default)* are tunable constants in one config module; changing them is not a contract change. Changing schemas, interfaces, state machines, or scenarios is. Unit-level detail lives in slice SPECs (`sdd/slices/NNN-name/`, attached to ROADMAP milestones); slice SPECs refine this document and never contradict it.

---

## 1. Process architecture

One Electron app, split brain/body (D31). **Main process = the brain** (daemon): HTTP server, session table, affect engine, character package management, config, tray — contains no renderer knowledge; everything it emits is renderer-neutral (§8). **Renderer process = the body** (stage): transparent overlay window subscribing to the performance feed (§8) and translating it for its renderer — pixi-live2d-display behind the runtime interface, per-frame parameter synthesis, hit-testing. One body in v1; a future 3D body attaches at the same feed. **Hook forwarder**: a bundled script executed by the app binary under `ELECTRON_RUN_AS_NODE`; stateless, no imports beyond Node built-ins.

Module map (brain): `server/` (routes, MCP), `sessions/`, `affect/` (pure, zero Electron imports, vitest-covered), `characters/`, `scenario/`, `config/`. Body: `stage/` (window, feed subscription), `synth/` (feed → per-frame parameter synthesis), `runtime/` (pixi-live2d-display adapter).

**Installed shell (M5a).** Lares is tray-only: no settings window and
no Dock/taskbar presence. The tray owns character import/selection,
scale (50/75/100/125/150%, 100% default), DND, launch-at-login,
position reset, calibration, update, uninstall, and quit. Settings
persist under Electron `userData`; DND hides only the body while the
brain, sessions, affect, mood, ingress, and cached body inventory keep
running. Reset Position uses the bottom-right of the current primary
display. Launch-at-login and DND default off; automatic update checks
default on.

## 2. Ingress

**Discovery file** `~/.lares/runtime.json`, written on listen, deleted on clean exit: `{ version, port, pid }`. No auth (D27): the server binds `127.0.0.1` only; port 21473 *(default)*, override in config. Port taken ⇒ fail loudly (no server, no discovery file, visible error) — never scan for a free port: registered MCP URLs bake the port in, so a moved port is a half-broken daemon pretending to be healthy (004-D4). Browser-origin defense instead of tokens: any request carrying an `Origin` header is rejected, and POST routes require `Content-Type: application/json` (forces browsers into a failing CORS preflight). Local processes are outside the threat model — anything running as the user could have read a token file anyway.

**Event route** `POST /v1/events` — envelope: `{ v: 1, harness: "claude-code" | "codex", session_id, cwd?, pid?, event: <harness-native JSON passthrough> }`. The forwarder adds the envelope and stamps a captured harness pid when the hook shell exposes one (`$PPID` on POSIX). Windows `cmd` exposes no parent pid, so the forwarder omits it rather than stamping the short-lived shell; `pid` stays optional and §3's silence reap covers Windows and MCP-only session knowledge (004-D5, 005-D9). All interpretation is server-side (adapter modules per harness). Responses: `202` accepted, `403` origin-rejected, `422` unparseable. Forwarder behavior: read discovery file; if absent or connection refused, exit 0 silently within 50ms (agents degrade gracefully, P3/D14); never block the harness beyond a 500ms *(default)* total budget.

**MCP** — streamable HTTP at `POST /v1/mcp` (no token, D27). The server's MCP `instructions` field is the primary emote-adoption vector (D26): Context7-style trigger/anti-trigger guidance — emote at meaningful beats (session start, state change, third consecutive failure, recovery, completion), never per tool call — and tool descriptions are themselves written as triggers. Tools:
- `emote(cue?, params?, intensity?, duration_s?, queue?, label?)` — the one expression tool, both branches (004-D2): exactly one of `cue` | `params`, both or neither ⇒ tool error. Cue branch: package cue, affect nudge `(Δv, Δa) · intensity` (§4). Params branch (freeform `{paramId: value}`): drives knobs directly, nudges nothing; `intensity` ignored-with-warning, `label` names the composition for `status()` and the authoring bridge. `queue` defaults true; false clears pending non-preempting expressions and plays this expression next.
- `list_cues()` → cues with affect coordinates and source (bundled | authored | raw)
- `status()` → active character, session summary, protocol version
- Authoring (D25 loop; ships M4 — slice 007): `list_parameters()` (id, display name, min, max, default — from the active body's reported inventory, §8), `preview_expression(params | cue)` (exact render via the §8 `authoring:preview` channel, bypassing affect blending and idle drift; holds until replaced or explicitly reverted, 60s *(default)* timeout; a cue reference previews an existing expression or plays its motion), `save_expression(name, params, affect)` (create: writes `authored/<name>.exp3.json` plus the manifest cue entry and affect coords after conversational user acceptance; refuses any existing name), `update_expression(name, affect?, params?)` (update: affect coords for any cue, sliders for authored cues only; refuses unknown names). Calibration is pull-only — instructions never mention authoring (D32).

**Caps (all server-enforced, P7):** intensity ∈ [0,1]; duration ≤ 30s, default 6s; queue depth ≤ 4 (append rejected beyond, `429`-equivalent tool error); freeform ≤ 24 params, each clamped to its range in the body-reported inventory (§8), unknown paramIds dropped; emote rate ≥ 2s spacing *(default)* per source — excess is coalesced, not rejected: the affect nudge still applies (saturation-scaled, §4), no new expression is enqueued, and the tool response says so (004-D6); authored expressions ≤ 50 per package *(default)*.

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

**Performance feed (brain→body, §8)** (IPC, on-change or ≤10Hz): `{ E, M, baselineState, expressionStack, beats: [motionTriggers] }` — renderer-neutral: expressions ride as cue names or opaque knob sets, never renderer asset references; cue→asset resolution is body-side. A *knob* is a model-declared control (a Live2D parameter today; a blendshape or bone channel in a future body) — the brain carries knob values but never interprets them. The body's `synth/` owns per-frame values: breath rate = `base · (0.7 + 0.6·arousal)`; blink interval = `base / (0.6 + 0.8·arousal)`; idle sway amplitude scaled by arousal; brow/mouth/eye-openness trend curves driven by valence *(bindings and tuning are character-owned `renderers.live2d.performance` data; global presets are dev-panel overrides)*. **No inference anywhere in this section's path (P4).**

## 5. Character package

`lar.character.json`, `format: "lares/1"`. The Live2D renderer block
uses package-relative asset paths:

```jsonc
{
  "format": "lares/1",
  "identity": {
    "name": "Haru",
    "author": "Live2D Inc.; Lares package by ...",
    "license": "required notice and terms reference",
    "persona": "optional"
  },
  "expressions": {
    "focused": { "valence": 0.2, "arousal": 0.45 },
    "alert": { "valence": 0.05, "arousal": 0.7 },
    "pleased": { "valence": 0.55, "arousal": 0.45 },
    "weary": { "valence": -0.15, "arousal": 0.15 }
  },
  "renderers": {
    "live2d": {
      "model": "runtime/haru.model3.json",
      "cues": {
        "pleased": {
          "expression": "runtime/expressions/Smile.exp3.json"
        },
        "focused": {
          "motion": "runtime/motion/haru_m_01.motion3.json"
        },
        "alert": {
          "motion": "runtime/motion/haru_m_03.motion3.json"
        },
        "weary": {
          "params": { "PARAM_EYE_L_OPEN": 0.35 }
        }
      },
      "performance": {
        "params": [
          {
            "id": "PARAM_MOUTH_FORM",
            "source": "valence",
            "gain": 1,
            "offset": 0
          }
        ],
        "idle": {
          "breath": {
            "id": "PARAM_BREATH",
            "basePeriodMs": 4000,
            "amplitude": 1
          },
          "blink": {
            "ids": ["PARAM_EYE_L_OPEN", "PARAM_EYE_R_OPEN"],
            "baseIntervalMs": 3500,
            "durationMs": 160,
            "valenceGain": 0.15
          },
          "sway": {
            "id": "PARAM_BODY_ANGLE_X",
            "baseAmplitude": 6,
            "periodMs": 5000
          }
        }
      },
      "hitAreas": []
    }
  }
}
```

Identity and `expressions` are renderer-neutral (P5). The manifest is a mapping layer: cue entries reference expression/motion files by package-relative path and never copy their contents; cue keys default to the artist's names verbatim (CJK included — agents read them natively; renaming is optional polish). Auto-import (D25 rung 1, dev script — slice 007) harvests by directory scan; the model index is advisory only (VTube-Studio-convention models index nothing). Affect coords start null: null-coord cues are legal and emote-able with a zero nudge, invisible only to the engine's affect-distance selection until calibrated (`list_cues` marks them; `status()` counts them). Expression application is one brain-side path for bundled and authored alike: Lares parses the exp3 (Add/Multiply/Overwrite against model defaults, display names via `cdi3.json`) and drives sliders through the standard pipeline — artist files and the model index are never modified. Agent-authored expressions (rung 2) are real `.exp3.json` files under `authored/`, written by `save_expression` after conversational user acceptance (D32 governs initiation). Import validation is a pure library function — schema; every referenced file exists; coords in range; exp3 parseable; report of cues by source and calibration state — with three callers: the import script, its `--check` flag, and the app at load (loud, P7); params-vs-inventory checks run in-app once the body loads the model (§8).

Exactly one of `expression`, `motion`, or `params` appears in each Live2D cue target. Expression and motion values are package-relative file paths. `performance` is the existing synth-preset shape under character ownership.

**VTS compatibility follow-up (slice 010).** The supported runtime range is Cubism SDK 3.0–4.2; Cubism 2.1 and MOC version 5 or later are rejected. `.vtube.json` is ignored metadata: Lares supports the VTS asset-folder convention, not tracking, hotkeys, VFX, or persistent VTS configuration. `FileReferences` remains authoritative for required model resources, while expression and motion discovery stays slice 007's union of registered and recursive loose assets. Discovery creates callable null-coordinate cues, not emotional mappings; calibration assigns affect explicitly. Compatibility validation adds the MOC runtime version, required/optional resources, model parameters and ranges, and explicit degradations to the existing shared report. Haru is the bundled default after D19 clearance and must use the generic path; the Hiyori package was retired 2026-07-30 (its starter cue set survives as the scenario harness's frozen `SCENARIO_CUES` vocabulary).

**Installed character library (D33).** Managed packages live under
`app.getPath("userData")/characters`. If none exist on first run, the
app copies the build's explicitly selected, redistribution-cleared
default package; upgrades never overwrite managed files. Import
always copies an extracted directory: accept a ready Lares package or
a raw tree containing exactly one recursive `.model3.json`; reject
zero/multiple without guessing; preserve the tree and union indexed
with loose `.exp3.json`/`.motion3.json` files. ZIP extraction is out of
scope. Duplicate names coexist with numbered tray labels and no schema
change. Validation plus successful body load precedes the active
selection commit; failure leaves the current Lar running. Switching
preserves sessions, affect/mood, position, scale, and DND.

## 6. Harness adapters

**Claude Code:** a Lares plugin — `plugins/claude-code/` with a `.claude-plugin/plugin.json` manifest bundling the hook set and the streamable-HTTP MCP entry (`mcpServers.lares`, `http://127.0.0.1:21473/v1/mcp`, no token — D27) plus the `emoting` skill — hosted in the Lares GitHub repo as a plugin marketplace (root `.claude-plugin/marketplace.json`); the user adds the marketplace and installs via `/plugin`, Claude Code's own plugin install/trust surface gating (guided — D29 as amended, 009-D1). Unlike Codex, Claude Code *executes* plugin hooks, so the plugin delivers baseline states and emotes both. Hooks registered: SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, PostToolUseFailure, Notification (matcher: `permission_prompt`), Stop, SubagentStart, SubagentStop — POSIX commands on every platform (Claude Code runs hook commands through Git Bash even on Windows), each invoking the launcher shim with harness tag `claude-code` and `LARES_HARNESS_PID=$PPID` capture; the Windows sh shim clears the pid instead (MSYS pids — 005-D9, 009-D5). The full set was verified present in Claude Code 2.1.219 during M2a recon (failure payloads carry `error`, successes `tool_response`); permission `Notification`s do not fire in headless `-p` runs, so verification needs an interactive session. `idle_prompt` notifications are deliberately not registered — waiting-for-next-prompt is done/idle territory, already covered by Stop + decay. Hook and MCP config snapshot at session start; plugin changes take effect next session or after `/reload-plugins`; adapter UX says so. **Legacy cleanup (009-D2):** pre-009 builds wrote hooks into user-scope `~/.claude/settings.json` and `mcpServers.lares` into `~/.claude.json`; every launch now runs the removal pass — content-recognition (any hook command referencing the bundled forwarder), parse-abort, backup-once, never creates files (005-D1/D2) — so an upgraded install never double-fires beside the plugin. The same pass serves uninstall (005-D3); the plugin itself is user-removed via `/plugin uninstall`, documented in its README. Skill-file reinforcement ships as the plugin's `skills/emoting/SKILL.md` (009-D3 as amended): the D26 beats and tool guidance restated in skill form — emote-only, no authoring surface (calibration stays pull-only, D32) — written harness-neutral so the identical file drops into the Codex plugin when its skill lands. The MCP `instructions` remain the primary adoption vector; the skill is reinforcement, never a dependency.

**Codex:** a Lares plugin — a directory with a `.codex-plugin/plugin.json` manifest bundling the hook set (same events plus PermissionRequest), the streamable-HTTP MCP entry (`http://127.0.0.1:<port>/v1/mcp`, no token — D27), and the same `skills/emoting/SKILL.md` as Claude Code — hosted in the Lares GitHub repo as a plugin marketplace; the user adds the marketplace and installs via `/plugins`, passing Codex's own trust flow (guided, never bypassed — D29). The plugin stays thin — hook commands, the baked URL, and harness-neutral skill guidance, no logic — so repo-HEAD stays compatible with any installed daemon (the wire contract froze at M3a). Plugin hook commands can't bake a per-machine app path, so they invoke a launcher shim the app maintains at a stable path (`~/.lares/bin/`), re-stamped with the current app binary on every launch (005-D8); the shim is shared with the Claude Code plugin and takes the harness as its argument, defaulting to `codex` so argument-less entries keep working (009-D5). No fallback of any kind: push-only sensing (P11, amending D15) — a Codex without the plugin is unsensed, and failure mapping degrades per §3 if recon finds no failure signal. Plugin-bundled hooks execute after Codex's trust review (the 2026-07-28 gap closed 2026-07-29, live re-smoke — D15 as amended), so the plugin delivers baseline states and emotes both. The skill reinforces the MCP instructions and never becomes a dependency (D26). **Legacy cleanup:** pre-fold-back builds wrote a user-level `~/.codex/hooks.json`; every launch now runs the removal pass — content-recognition on the shim name, parse-abort, backup-once (006-D1) — deleting the file when only Lares entries remained. The same pass serves uninstall; the plugin itself is user-removed via `/plugins`, documented in its README.

**Setup UX (008-D9):** the tray's **Configure Agent Integrations…**
action first discloses the public download, hooks, and local MCP
connection. Only after confirmation it calls the official CLIs with
fixed arguments: `claude plugin marketplace add Xyri1/lares --scope
user` then `claude plugin install lares@lares --scope user`; `codex
plugin marketplace add Xyri1/lares --json` then `codex plugin add
lares@lares --json`. It uses no shell and never writes harness config
or bypasses hook trust. Exact JSON status checks make re-runs
idempotent; missing/failing CLIs produce copyable manual commands.
Claude needs a new session or `/reload-plugins`; Codex needs a new
local task and `/hooks` review. A CLI install is visible to the
ChatGPT desktop app's Codex surface when both use the same Codex home;
ChatGPT Work/web is not an adapter target.

## 7. Scenario player

Scenario file: `{ name, timeScale, events: [{ at_ms, envelope | emote }] }`. Player injects through the same ingress path as real traffic (in-process, past the §2 origin checks). Golden scenarios ship in-repo: `brutal-debugging-session`, `smooth-build`, `long-wait-for-input`, `recovery-arc`. UI: pick scenario, scrub, speed 1×/8×/64×, record (export via OS screen capture guidance, no built-in encoder in v1). Default Lar size — the normative judging size in §9 (S1, S5) — is the model rendered 400 logical px tall, DPI-scaled.

## 8. Interfaces (the P6 seam)

**Performance feed — the P6 seam (D31).** The brain↔body channel is the renderer-neutral contract; nothing renderer-specific crosses it (cue names cross, asset references don't). Brain→body: `affect:update` (§4 feed), `authoring:preview`/`authoring:revert` (opaque knob sets), `scenario:*`. Body→brain: `stage:pointer` (hit results → click-through toggling), `body:inventory` (knob list — id, name, min, max, default — reported on model load; the brain validates freeform and authoring traffic against it and never interprets knob meaning — cached per active character so validation survives a DND hide; before any inventory exists, freeform and authoring calls fail with a tool error, per P7). Known limitation, accepted: freeform compositions are body-specific by nature — knob names come from the loaded model; `status()` reports the active body, richer mode feedback deferred (D31). The body never receives raw ingress events.

**IRuntime (body-internal):** `load(modelPath)`,
`prepareLoad(id, modelPath): Promise<ParamInfo[]>`, `commitLoad(id)`,
`rollbackLoad(id)`, `finalizeLoad(id)`, `cancelLoad(id)`,
`parameters(): ParamInfo[]`, `setParams(batch, weight?)`,
`releaseParams(ids)` (drops selected sticky overrides back to native
motion/physics ownership), `resetParams()` (the full inverse of
`setParams` — restores all model defaults and drops all driven-param
ownership), `applyExpression(ref|params, weight, fadeMs)`,
`playMotion(group, index?, priority)`, `hitTest(x, y): area[]`,
`alphaAt(x, y)`, `larSize()`. The transactional load methods stage one
candidate by ID: prepare leaves the active body untouched, commit makes
the candidate rollback-capable, finalize is the one-way handoff, and
rollback/cancel retain the previous body. pixi-live2d-display is the
sole v1 implementation; nothing outside `runtime/` imports it. An
implementation detail of the v1 body, not a cross-body contract.

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

Hook fire → visible reaction ≤250ms (forwarder spawn ≤120ms, POST ≤10ms, ingest ≤5ms, IPC ≤16ms, onset ≤100ms) — this budget is load-bearing for legibility and stays hard. Forwarder total ≤500ms hard budget, spawn included; the silent-exit path's ≤50ms binds in-script time only (script entry → exit, self-measured) — process startup alone exceeds 50ms on real machines (bare Node median 51.8ms, Electron-as-Node ~100–118ms; 004-D8), and the harness turn proceeds regardless. Renderer targets 30fps flat (ticker cap). Footprint numbers (idle ~3% of one core, <300MB RSS combined) are soft targets, not milestone gates — optimization is explicitly not a v1 focus; frame-rate governor and occlusion-paused rendering are parked post-v1.

**Network exception (D21).** Beyond §2 loopback, Lares's sole
app-owned request is the disclosed GitHub Releases update check: every
app launch and every 24h while running when enabled, plus a manual
action. Requests are conditional with a persisted ETag; M5a only
notifies and opens the release page, never downloads or installs.
The separately confirmed §6 setup action may launch harness-owned
plugin managers for a user-initiated public download (P3).

## 11. Installation and removal

M5a's local gate is an unsigned macOS 13+ universal DMG and unsigned
Windows 10/11 x64 NSIS installer, built manually on their native OS.
Gatekeeper/SmartScreen bypass is documented and expected. Packaging
explicitly includes the forwarder, fetched Cubism Core, one selected
cleared default character, and required notices; it never globs the
local character tree. Signing/notarization, GitHub Actions/public
Release publication, and production one-line install URLs land at
M5b (D30).

Supported uninstall always removes the app and Lares-owned adapter
hooks, MCP entries, and launcher shims. An unchecked-by-default
**Also delete Lares data** choice additionally removes imported
characters, authored expressions, calibration, settings, and window
state.

Harness plugins remain user-installed when Lares is removed. Their
native plugin managers own removal; without Lares the hooks and MCP
entry point at nothing.
