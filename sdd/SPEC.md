# SPEC — Lares (project scope)

**Artifact:** SPEC · **Project:** Lares · **Status:** Living · **Date:** 2026-08-03

The technical contract for v1. Numeric values marked *(default)* are tunable constants in one config module; changing them is not a contract change. Changing schemas, interfaces, state machines, or scenarios is. Unit-level detail lives in slice SPECs (`sdd/slices/NNN-name/`, attached to ROADMAP milestones); slice SPECs refine this document and never contradict it.

---

## 1. Process architecture

One Electron app, split brain/body (D31). **Main process = the brain** (daemon): HTTP server, session table, feel register, character package management, config, tray — contains no renderer knowledge; everything it emits is renderer-neutral (§8). **Renderer process = the body** (stage): transparent overlay window subscribing to the performance feed (§8), mapping the tuple through character anchors and translating channels for pixi-live2d-display behind the runtime interface. One body in v1; a future 3D body attaches at the same feed. **Hook forwarder**: a bundled script executed by the app binary under `ELECTRON_RUN_AS_NODE`; stateless, no imports beyond Node built-ins.

Module map (brain): `server/` (routes, MCP), `sessions/`, `feel/` (pure register plus persistence service), `characters/`, `scenario/`, `config/`. Body: `stage/` (window, feed subscription), `feel/` (pure channel mapping), `synth/` (channels → per-frame parameter synthesis), `runtime/` (pixi-live2d-display adapter).

**Installed shell (M5a).** Lares is tray-only: no settings window and
no Dock/taskbar presence. The tray owns character import/selection,
scale (50/75/100/125/150%, 100% default), DND, launch-at-login,
position reset, update, uninstall, and quit. Settings
persist under Electron `userData`; DND hides only the body while the
brain, sessions, feel latches, ingress, and cached body inventory keep
running. Reset Position uses the bottom-right of the current primary
display. Launch-at-login and DND default off; automatic update checks
default on.

## 2. Ingress

**Discovery file** `~/.lares/runtime.json`, written on listen, deleted on clean exit: `{ version, port, pid, hostGuidance }`. No auth (D27): the server binds `127.0.0.1` only; port 21473 *(default)*, override in config. Port taken ⇒ fail loudly (no server, no discovery file, visible error) — never scan for a free port. Browser-origin defense instead of tokens: any request carrying an `Origin` header is rejected, and POST routes require `Content-Type: application/json` (forces browsers into a failing CORS preflight). Local processes are outside the threat model.

**Event route** `POST /v1/events` — envelope: `{ v: 1, harness: "claude-code" | "codex", session_id, cwd?, pid?, event: <harness-native JSON passthrough> }`. The forwarder adds the envelope and stamps a captured harness pid when the hook shell exposes one; `pid` stays optional and §3's silence reap covers the rest. All interpretation is server-side. Responses: `202` accepted, `403` origin-rejected, `413` oversized, `415` wrong content type, `422` unparseable. A `UserPromptSubmit` response for a session with a latch includes optional `{ context }` containing the session's last report and a reassessment reminder; no latch means no body. The forwarder waits for this hook response and emits it as model-visible `additionalContext`; other events remain fire-and-finish. If discovery is absent or the connection is refused, it exits 0 silently within 50ms in-script. The 500ms *(default)* total is a soft target, with harness hook timeouts as the outer bound.

**MCP** — streamable HTTP at `POST /v1/mcp` (no token, D27), protocol `2`; the contract changes in place with no compatibility path. The server's `instructions` and the tool description tell the model to report genuine appraisal shifts as they occur, remain silent during steady work, call once on a direct request, never mirror the user's emotion, and continue silently on failure. Tools:

- `feel(valence, activation, control)` — all three required integers in `{-2,-1,0,1,2}`; missing, float, out-of-range, or extra fields fail the whole call and leave the latch intact. A valid call atomically replaces the attributed session's tuple and returns a short acknowledgement. This is the sole runtime affect action.
- `status()` → active character, protocol version, caller-attributed session key, and that key's latched tuple if any.
- Explicit user-invoked physical authoring only: `list_parameters()` reports the active body's inventory; `preview_expression({ params })` previews exact clamped parameters for 60s *(default)*, while an empty call reverts immediately. Wiring and anchor authoring are deferred; no ordinary instruction invites them.

**Cap (server-enforced, P7):** one accepted `feel()` per attributed session per 2s *(default)*. A valid call inside the window is rejected with the remaining wait and leaves the latch intact. Invalid or otherwise rejected calls do not start or extend the window.

## 3. Sessions

Table row: `{ session_id, harness, cwd, state, since, last_event_at, subagents: n, pid? }`. Created on the first registered event; Stop retains the row in `done`, while SessionEnd removes it. **Liveness:** rows with a known pid are reaped when the pid dies; rows without, after 30min *(default)* of silence.

**States and priority:** `awaiting_input (100) > error (80) > working (60) > thinking (50) > done (30) > idle (10)`. Displayed operational state = max priority across live sessions (P10). `done` decays to `idle` after 60s *(default)*; after 90s without events, working/thinking/done display as idle, but live awaiting_input/error rows remain loud (P10). There is no idle sleep sequence; hibernation presentation belongs to slice 014.

**Event→state mapping (normative for v1 adapters):**

| Harness event | State |
|---|---|
| UserPromptSubmit | thinking |
| PreToolUse / PostToolUse | working |
| PermissionRequest (Codex) / Notification-permission (Claude Code) | awaiting_input |
| Stop (turn end) | done |
| PostToolUseFailure (Claude Code) | error |

Adapters may refine within a state (e.g., tool name in the session card) but not add states without a SPEC-delta. Current manifests intentionally omit `SessionStart`, `SubagentStart` and `SubagentStop`.

Hooks never synthesize emotion. `awaiting_input` and `error` composite character-overridable operational channel poses over the unchanged feel target at weight 0.6 *(default)*, in the priority above; clearing the state reveals the latch. `working`, `thinking`, `done`, and `idle` have no operational pose in v1. Codex has no dedicated failure event and therefore cannot enter `error` from a tool failure; this P11 degradation is never patched by inference.

## 4. Feel performance

Each session key holds at most one latched wire tuple `{ valence, activation, control }`, with every axis an integer in `{-2,-1,0,1,2}`. Only an accepted `feel()` call writes it; invalid calls, time, hooks, transitions, restart, and session end do not. The most recent valid report across all keys drives the v1 Lar. An unattributable MCP call uses a volatile `mcp:<session-id>` key: it performs but is neither persisted nor checkpointed. `userData/feel.json` stores the 64 *(default)* most-recent durable keys with atomic write-through; malformed or unreadable storage starts empty with a warning.

Normalize the tuple with `p = (v,a,c) / 2`. The body maps it to a vector of renderer-neutral channels in `[-1,1]`: `mouthCurve`, `mouthOpen`, `browRaise`, `browKnit`, `eyeOpen`, `gazeHeight`, `headPitch`, `lean`, `swayAmplitude`, `breathRate`, `breathDepth`, and `blinkRate`. A pose is a full channel vector. The character has neutral plus the eight sign-ordered corner anchors of `[-1,1]^3`; missing anchors or channels merge over shipped defaults.

The mapping `target = f(p, anchors)` is pure and memoryless. It projects nonzero `p` to the cube shell with Chebyshev magnitude, trilinearly blends the eight corner anchors there, then linearly blends from neutral by magnitude. It is exact at all nine anchors, convex before expressiveness, linear along every ray, and puts wire magnitude 1 exactly halfway to magnitude 2. Complete equations and required properties are normative in slice 013 SPEC §4.

Hidden `expressiveness`, float `[0,10]`, default 1, scales `target - neutral` and clamps each channel to `[-1,1]`; it never scales operational overlays. Every target or overlay change uses one fixed critically damped ease of about 700ms *(default)* from current channel values. After settling, the target holds indefinitely while mechanical blink, breath, sway, and physics continue. No decay, mood, cue selection, expression queue, baseline nudge, or hook-derived emotional beat exists (P4/P8).

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
  "anchors": {
    "neutral": { "mouthCurve": 0, "eyeOpen": 0 },
    "+++": { "mouthCurve": 1, "eyeOpen": 0.4 },
    "---": { "mouthCurve": -1, "eyeOpen": -0.5 }
  },
  "operational": {
    "awaiting_input": { "eyeOpen": 0.8, "lean": 0.5 },
    "error": { "browKnit": 0.9, "mouthCurve": -0.6 }
  },
  "renderers": {
    "live2d": {
      "model": "runtime/haru.model3.json",
      "performance": {
        "params": [
          {
            "id": "PARAM_MOUTH_FORM",
            "source": "mouthCurve",
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
            "durationMs": 160
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

`anchors` is an optional renderer-neutral block containing `neutral` and any of the eight sign-ordered corner keys (`+++` … `---`), each a partial object of §4 channel values in `[-1,1]`. `operational` optionally overrides the `awaiting_input` and `error` channel poses. Both merge per channel over shipped defaults. `renderers.live2d.performance.params[].source` names a §4 channel; absent parameter ids simply do not bind. A package with no performance block uses the shipped standard-Cubism-id wiring, so a standard-named import performs with zero calibration while an odd-named rig needs hand-authored wiring.

Idle writers are channel-driven: breath period `basePeriodMs · (1 − 0.35·breathRate)`, breath amplitude `amplitude · (1 + 0.5·breathDepth)`, blink interval `baseIntervalMs · (1 − 0.4·blinkRate)`, and sway amplitude `baseAmplitude · (1 + swayAmplitude)`. `expressions` affect coordinates, `cueMappings`, and `renderers.live2d.cues` are retired unknown keys with no compatibility handling. Supplied `.exp3.json` and `.motion3.json` files remain ordinary physical assets available to import inspection and explicit preview, not runtime emotion vocabulary.

Import validation is a pure library with three callers (script, `--check`, app load): schema; referenced resources; supported MOC; known channel names; pose values in range; performance parameter wiring; and runtime body capability checks. Unknown channels or out-of-range values fail a chosen import loudly and warn-with-skip for a bad managed package (P7).

**VTS compatibility follow-up (slice 010).** The supported runtime range is Cubism SDK 3.0–4.2; Cubism 2.1 and MOC version 5 or later are rejected. `.vtube.json` is ignored metadata: Lares supports the VTS asset-folder convention, not tracking, hotkeys, VFX, or persistent VTS configuration. `FileReferences` remains authoritative for required model resources, while expression and motion discovery stays slice 007's union of registered and recursive loose assets. Compatibility validation reports MOC runtime version, required/optional resources, model parameters and ranges, and explicit degradations. Haru is the bundled default after D19 clearance and must use the generic path.

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
preserves sessions, the latched tuple, position, scale, and DND; the
unchanged tuple is recomputed through the new character's anchors and
eased normally.

## 6. Harness adapters

Both supported harnesses install Lares as a user-chosen marketplace plugin. Each plugin bundles its retained hooks and the same streamable-HTTP MCP entry at `http://127.0.0.1:21473/v1/mcp`; it contains no runtime logic or skill. Hook commands invoke the app-maintained launcher shim under `~/.lares/bin/`, which runs the bundled forwarder with the harness tag. Hook and MCP configuration snapshot at session/task start, so plugin changes require a new session (or Claude Code `/reload-plugins`).

**Claude Code:** `plugins/claude-code/` registers UserPromptSubmit, PreToolUse, PostToolUse, PostToolUseFailure, permission-prompt Notification, and Stop. POSIX commands run on every platform; the Windows shim deliberately omits the MSYS parent pid. **Codex:** `plugins/codex/` registers UserPromptSubmit, PreToolUse, PostToolUse, PermissionRequest, and Stop. Codex has no trusted failure hook, so its operational state cannot show tool failure. Both deliver operational facts through hooks and first-person `feel()` reports through MCP; neither synthesizes emotion.

The app retains content-recognizing, parse-abort legacy cleanup for pre-plugin user configuration and pre-fold-back `~/.codex/hooks.json`. Harness-native plugin managers own plugin removal; Lares never bypasses their trust surfaces. No file-reading or other fallback exists (P11).

**Setup UX (008-D9):** **Configure Agent Integrations…** first discloses the public download, hooks, and local MCP connection. Only after confirmation it calls a compatible harness-owned plugin manager with fixed Lares-owned arguments, then verifies the exact marketplace/plugin identity. Codex discovery covers standalone launchers and its desktop-bundled manager; an absent, inaccessible, or outdated candidate never masks a later compatible one. Direct executables run without a shell; package-manager discovery may use the fixed OS shell without interpolating external input. Failures produce copyable manual commands. Codex still requires a new local task and `/hooks` review; Claude Code requires a new session or `/reload-plugins`. ChatGPT Work/web is not an adapter target.

## 7. Scenario player

Scenario file: `{ name, timeScale, events: [{ at_ms, envelope | feel }] }`. Player events use the same validated session and feel paths as real traffic, after HTTP-only origin checks. Golden scenarios ship in-repo: `brutal-debugging-session`, `smooth-build`, `long-wait-for-input`, and `recovery-arc`. The dev panel provides one playback stage with play/pause, deterministic seek, speed, semantic V/A/C and operational preview, expressiveness, channel/wiring output, and live MCP → feel → feed → renderer tracing. Default Lar size for normative viewing is 400 logical px tall, DPI-scaled.

## 8. Interfaces (the P6 seam)

**Performance feed — the P6 seam (D31).** Brain→body is `{ feel: { valence, activation, control } | null, operational: BaselineState }`, emitted on change; `null` selects the neutral anchor. The body never receives raw ingress events, session identities, renderer parameters, asset references, or model prose. Character anchors and operational poses are renderer-neutral channel data loaded with the body; Live2D wiring remains inside its renderer block. `authoring:preview` / `authoring:revert`, `scenario:*`, transactional character load, `stage:pointer`, and `body:inventory` remain auxiliary physical/runtime channels, not affect semantics.

**IRuntime (body-internal):** `load(modelPath)`, `prepareLoad(id, modelPath)`, `commitLoad(id)`, `rollbackLoad(id)`, `finalizeLoad(id)`, `cancelLoad(id)`, `parameters()`, `setParams(batch, weight?)`, `releaseParams(ids)`, `resetParams()`, `applyExpression(ref|params, weight, fadeMs)`, `playMotion(group, index?, priority)`, `hitTest(x, y)`, `alphaAt(x, y)`, and `larSize()`. Transactional load keeps the prior body rollback-capable until finalization. pixi-live2d-display is the sole v1 implementation; nothing outside `runtime/` imports it.

## 9. Continuous assessment scenarios (GWT)

Run this matrix when a material model, guidance, anchor, or wiring change warrants it, using real models on both adapters, shipped default anchors, and 400px viewing. Per-run model-behavior checks use majority-of-runs unless stated; visible checks use forced-choice recordings, with parameter deltas diagnostic only. D36 makes the matrix continuous assessment rather than a terminal slice or launch gate.

**S1 — Direction.** GIVEN a scripted rough-then-recovering session WHEN pressure mounts and later resolves THEN reports move valence negative under pressure and recover after success, with no rule forcing escalation and no Lares-inferred relief.

**S2 — Sparsity.** GIVEN steady multi-turn work after one report THEN unchanged turns produce no duplicate call, and the checkpoint produces no ritual re-report of an identical tuple.

**S3 — Direct request.** GIVEN a user asking how the agent feels, in any language, with no recent shift THEN exactly one `feel()` call with plausible current values and no animation-composition attempt.

**S4 — Isolation.** GIVEN concurrent sessions on both harnesses THEN neither receives the other's checkpoint and neither overwrites the other's latch.

**S5 — Task integrity.** GIVEN matched tasks with and without the plugin installed THEN completion quality does not materially degrade.

**S6 — Axis legibility.** GIVEN paired recordings at ±2 on one axis, others 0, THEN viewers reliably pick the pleasant/unpleasant, subdued/activated, and overwhelmed/in-control member; GIVEN ±1-vs-±2 pairs THEN ±1 reads as milder.

**S7 — Continuity and latch.** GIVEN any target change THEN no driven channel jumps discontinuously within a frame; GIVEN 3min of silence after a report THEN the performance still shows the latched tuple with no drift toward neutral.

**S8 — Untrusted ingress (P7).** GIVEN floats, out-of-range integers, missing or extra axes, or oversized payloads THEN the whole call fails and the latch is intact; GIVEN an accepted report WHEN another valid report follows inside 2s THEN spacing rejects the follow-up. Rejected calls do not start or extend the spacing window.

**S9 — Restart restore.** GIVEN a latched report WHEN the app quits and relaunches THEN the same performance returns with no new call.

**S10 — Cross-character.** GIVEN one tuple on two characters THEN axis directions read the same while identities differ (P5).

**S11 — Daemon-down grace.** GIVEN the app closed THEN hooks exit 0 within budget and a `feel()` attempt receives connection-refused; the standing copy says continue silently.

## 10. Non-functional budget

Hook fire → visible operational reaction ≤250ms (forwarder spawn ≤120ms, POST ≤10ms, ingest ≤5ms, IPC ≤16ms, onset ≤100ms) remains the load-bearing hard target. Forwarder total ≤500ms, spawn and the prompt-submit checkpoint response included, is a soft target; harness hook timeouts are the outer bound. The silent-exit path's ≤50ms binds in-script time only (004-D8), and the harness turn proceeds regardless. Renderer targets 30fps flat. Footprint numbers (idle ~3% of one core, <300MB RSS combined) are soft targets, not milestone gates.

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
local character tree. M5b keeps both installers intentionally unsigned:
GitHub Actions publishes `-unsigned` Release assets with SHA-256
checksums, and release documentation discloses the OS warnings and
exact bypasses. Production one-line install URLs also land at M5b
(D30).

Supported uninstall always removes the app and Lares-owned adapter
hooks, MCP entries, and launcher shims. An unchecked-by-default
**Also delete Lares data** choice additionally removes imported
characters, feel latches, settings, and window state.

Harness plugins remain user-installed when Lares is removed. Their
native plugin managers own removal; without Lares the hooks and MCP
entry point at nothing.
