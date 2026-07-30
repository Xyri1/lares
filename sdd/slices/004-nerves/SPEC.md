# Slice 004 — Nerves · SPEC

**Artifact:** Slice SPEC · **Slice:** 004-nerves (= ROADMAP M3a) · **Status:** Closed

**Why / gate.** The daemon grows its ingress: agents can reach the Lar.
Exit gate (ROADMAP M3a): *synthetic clients over real loopback HTTP
(event route + MCP) drive the Lar end-to-end — caps enforced (S10-class
checks), daemon down/up degrading gracefully (S9).* Closing this freezes
the wire contract before any adapter is written against it (M3b).

Refines root SPEC §2/§3 and D14/D26/D27; carries four root-SPEC deltas
(004-D2/D4/D5/D6, applied to root §2 in the same commit that opens this
slice). Binding within the slice; root SPEC stays source of truth.

---

## 1. Scope

**In:** loopback HTTP server in main (one `node:http` listener,
path-routed): `POST /v1/events` + streamable-HTTP MCP at `POST /v1/mcp`;
discovery file lifecycle; D27 defenses; session table with pid liveness
and P10 aggregation; ingress→affect wiring (baseline nudges, emote
nudges, saturation scoping, rate coalescing); the unified `emote` tool
plus `list_cues` and `status`; D26 MCP `instructions` draft; the
embedded-Node hook forwarder; scenario player rerouted through the real
ingress path (root §7 mandate).

**Out (fence):** harness adapters and any settings-file writes (M3b);
the authoring tool trio `list_parameters` / `preview_expression` /
`save_expression` and its pending-store (M4, 004-D1); character package
schema work (M4); tray/settings (M5a); auth of any kind (D27); port
scanning (004-D4).

## 2. Server and defenses (004-D3)

One `node:http` server bound `127.0.0.1`, port 21473 *(default)*, config
override. MCP protocol handling via the official
`@modelcontextprotocol/sdk` (pinned) — `McpServer` +
`StreamableHTTPServerTransport`; sessions stateful so `Mcp-Session-Id`
exists for saturation scoping (root §4).

Defense placement: our own guard rejects **any** request bearing an
`Origin` header (403) in front of both routes — the SDK's allowlist
options can't express "reject all origins" and are deprecated in favor
of exactly this kind of external middleware. Content-Type
`application/json` is checked by us on `/v1/events` and by the SDK (415)
on `/v1/mcp`. Nothing agent-supplied is ever interpolated into anything
executable (P7, S10).

**Port collision = fail loudly (004-D4).** `EADDRINUSE` ⇒ no server, no
discovery file, visible failure (log + dialog); the Lar still stands.
No port scanning: registered MCP URLs bake the port in, so a moved port
is a half-broken daemon pretending to be healthy. Single-instance lock
(M1b) already covers self-collision.

**Discovery file** `~/.lares/runtime.json` `{ version, port, pid }`:
written on successful listen, deleted on clean exit. Stale file from a
crash is tolerated — clients hit connection-refused and treat it as
down (S9).

## 3. Event route and envelope (004-D5)

`POST /v1/events`, envelope:
`{ v: 1, harness: "claude-code" | "codex", session_id, cwd?, pid?, event }`.
**Delta:** `pid?` is new — the forwarder stamps `process.ppid` (its
parent *is* the harness process), giving the session table a liveness
probe target. Optional: MCP-only knowledge of a session never has one.
Responses: `202` accepted, `403` origin-rejected, `422` unparseable.
All interpretation server-side (root §2); the event field is
harness-native passthrough mapped by the §3 normative table.

## 4. Sessions

Root §3 verbatim, plus the pid mechanics: rows with a pid are probed
every 30s *(default)* with a zero-signal `process.kill(pid, 0)`; probe
says dead ⇒ row reaped immediately. Rows without a pid fall to the
30-min silence reaper. No create-time matching, no process-table scans
— research says the bare probe plus timeout backstop is the proven
shape and cleverness here has burned real projects (004-D5). Displayed
baseline = max priority across live rows (P10); recompute on every row
change; S6 timing (≤1s) binds. Stop retains its row as `done` so the
60s decay is observable; SessionEnd removes it. After 90s without
events, working/thinking/done display as idle, while live
awaiting_input/error rows remain loud (P10).

## 5. MCP tools (004-D2)

Three tools in this slice; the authoring trio ships M4 (004-D1).

- **`emote(cue?, params?, intensity?, duration_s?, queue?, label?)`** —
  the unified expression tool; `express_freeform` is renamed away
  (never shipped). Exactly one of `cue` | `params`; both or neither ⇒
  tool error. Cue branch: package cue, affect nudge `(Δv, Δa) ·
  intensity` per root §4. Params branch (freeform): knob values
  validated against the body-reported inventory — ≤24 params, unknown
  ids dropped, values clamped, tool error if no inventory exists yet;
  drives the face directly, nudges nothing; `intensity` here is
  ignored-with-warning, `label` names the composition for `status()`
  and M4's save bridge. Both branches: duration ≤30s (default 6s),
  shared global queue depth ≤4 (reject beyond), same expression-stack
  path (root §4). `queue` defaults true; false clears pending
  non-preempting expressions and plays this expression next.
- **`list_cues()`** — cues with affect coordinates and source.
- **`status()`** — active character, session summary, protocol version.

**Rate coalescing (004-D6).** ≥2s spacing *(default)* per source. An
emote inside the window is *coalesced, not rejected*: its affect nudge
still applies (saturation-scaled, §4), no new expression is enqueued,
and the tool response says "coalesced" so the agent learns the rhythm.
The 2s cap protects the face from strobing; it does not discard
feeling. Saturation counters scope per source (harness `session_id` /
`Mcp-Session-Id` / one anonymous bucket) per root §4.

**Instructions (D26).** The server's `instructions` field carries the
trigger/anti-trigger guidance: emote at meaningful beats (session
start, state change, third consecutive failure, recovery, completion),
never per tool call; prefer a `list_cues` cue, compose `params` only
when nothing fits; on connection-refused, continue silently. Tool
descriptions restate their own triggers. Wording is a draft here —
M3b's real-session density measurement calibrates it.

## 6. Hook forwarder

Bundled script run by the app binary under `ELECTRON_RUN_AS_NODE`;
stateless, Node built-ins only (root §1). Reads the discovery file,
wraps stdin's harness-native JSON in the envelope (stamping
`pid: process.ppid`), POSTs. Discovery file absent or connection
refused ⇒ exit 0 silently within 50ms of in-script time (script entry →
exit, self-measured — spawn cost sits outside the figure, 004-D8);
total budget 500ms hard including spawn, then exit 0 regardless (never
block a harness turn — S9, P3).

## 7. Scenario player reroute

The player now injects through the real ingress path in-process (past
the origin checks), per root §7 — same envelope parsing, same session
table, same caps. The M2a direct-to-engine path is deleted, not kept as
a second seam.

## 8. Acceptance (GWT)

**A1 — Origin wall.** GIVEN any route WHEN a request carries any
`Origin` header THEN 403, nothing processed.

**A2 — Content-type wall.** GIVEN `/v1/events` WHEN POST without
`Content-Type: application/json` THEN rejected; MCP route returns 415
via the SDK.

**A3 — Envelope.** GIVEN malformed / wrong-version / unknown-harness
envelopes THEN 422; GIVEN a valid envelope THEN 202 and a session row
with the mapped state, `pid` stored when present.

**A4 — Unified emote branches.** GIVEN both `cue` and `params`, or
neither THEN tool error; GIVEN `intensity` with `params` THEN applied
as if absent, response warns; GIVEN `params` before any body inventory
THEN tool error (P7).

**A5 — Caps (S10).** GIVEN a params emote with 40 params, values 10×
out of range, an unknown paramId, duration 999 THEN >24 rejected,
values clamped, unknown dropped, duration capped 30s; GIVEN queue depth
4 THEN a fifth append is rejected.

**A6 — Coalescing (004-D6).** GIVEN two emotes 1s apart from one source
THEN one expression enqueued, both nudges applied with the second
saturation-scaled, second response marked coalesced; GIVEN the same
pair from two different sources THEN no coalescing between them.

**A7 — Sessions & aggregation (S6).** GIVEN session A working and B
awaiting_input THEN baseline awaiting_input; WHEN B resolves THEN
working within 1s. GIVEN a row with a dead pid THEN reaped on the next
probe; GIVEN a pid-less row silent past the reap window THEN reaped.

**A8 — Down/up grace (S9).** GIVEN no daemon WHEN the real forwarder
script fires THEN exit 0 with ≤50ms in-script time (004-D8) inside the
500ms spawn-inclusive hard budget; WHEN the daemon returns THEN the
next event lands — no client-side state needed. GIVEN a port collision
THEN the failure is loud and no discovery file is written (004-D4).

**A9 — MCP end-to-end.** GIVEN the official SDK *client* over real
loopback HTTP THEN initialize succeeds, `instructions` text arrives,
all three tools round-trip, and an `emote` visibly plays on the Lar
with the app open.

**A10 — One ingress.** GIVEN the scenario player driving a golden
scenario THEN traffic flows through the same envelope/session/caps path
as A3 — no bypass seam remains.

A1–A8 headless (vitest, real server on an ephemeral port — the 004-D7
harness); A9/A10's visible halves are the thin app-open smoke with the
synthetic-client script, eyes on the Lar.
