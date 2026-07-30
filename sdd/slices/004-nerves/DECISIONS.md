# Slice 004 — Nerves · DECISIONS

Slice-scoped forks; root DECISIONS.md holds anything that outlives the
slice. 004-D2/D4/D5/D6 are root-SPEC deltas, applied to root §2 in the
slice-opening commit.

---

**004-D1 — Authoring tool trio deferred to M4.** *Chosen:* M3a ships
`emote`, `list_cues`, `status` only; `list_parameters`,
`preview_expression`, `save_expression` (the D25 loop) ship with M4,
where their consumer — the expression-authoring skill — lives. Nothing
in the M3a gate or the M3b adapters calls them, so the wire-contract
freeze doesn't need them; cutting them also cuts the pending-store and
preview/revert IPC from this slice. *Rejected:* shipping them now
because the marginal cost is low ("low marginal cost" is how slices
bloat, and no gate check would catch an authoring bug here).
*Status:* decided by the maintainer.

**004-D2 — One `emote` tool for cues and freeform; `express_freeform`
renamed away.** *Chosen:* `emote(cue?, params?, intensity?, duration_s?,
queue?, label?)` — exactly one of `cue` | `params` (both/neither ⇒ tool
error); `intensity` cue-only (ignored-with-warning on params); `label`
params-only. One tool means one description can encode the two-idea
priority itself (prefer a cue; compose params only when nothing fits) —
D26 says tool descriptions are the adoption triggers, and a single
trigger beats hoping the agent picks the right one of two tools.
Freeform behavior is unchanged from the old spec: same caps, same
queue, drives the face but nudges no affect. *Rejected:* two tools
(splits the D26 guidance across descriptions); permissive both-fields
handling (P7 — no guessing). *Cost accepted:* union-shaped arguments
validate slightly weaker than two crisp schemas. `queue` defaults true;
false clears pending non-preempting expressions and plays the supplied
expression next — the smallest useful meaning for an opt-out from FIFO.
Root §2 delta.
*Status:* decided by the maintainer.

**004-D3 — Official MCP SDK; D27 origin guard stays ours, in front.**
*Chosen:* `@modelcontextprotocol/sdk` (pinned) with
`StreamableHTTPServerTransport` over plain `node:http` — no Express, no
Fastify; two routes don't justify a framework. The SDK is the reference
implementation of the contract we're freezing, handles the protocol
lifecycle and `Mcp-Session-Id` (which §4 saturation scoping keys on),
and carries the D26 `instructions` field. Verified against SDK source:
its origin options are allowlist-shaped (an empty list disables the
check — cannot express D27's "reject any Origin present") and all three
are `@deprecated` in favor of external middleware, so a ~3-line guard
of ours fronts both routes. Content-Type comes free on the MCP route
(SDK 415s non-JSON POSTs); we check it on the event route. *Rejected:*
hand-rolling streamable HTTP (protocol-drift bugs would read as "the
Lar ignores my agent" — the worst bug this product can have).
*Status:* decided by the maintainer.

**004-D4 — Port collision fails loudly; no scanning.** *Chosen:*
`EADDRINUSE` ⇒ no server, no discovery file, log + visible dialog; the
Lar still stands. The discovery file could carry a scanned port to
hooks, but MCP entries in harness configs bake the URL in (root §6), so
a moved port strands every registered MCP client — a scanned port is a
half-broken daemon pretending to be healthy. One honest failure state
beats a subtle one. Single-instance lock (M1b) covers self-collision;
config override covers a genuinely squatted port. *Rejected:*
scan-upward-and-rewrite (re-sync plumbing in two harnesses to heal a
rare state). Root §2 delta. *Status:* decided by the maintainer.

**004-D5 — Harness pid rides the envelope; forwarder stamps
`process.ppid`; bare probe + silence backstop.** *Chosen:* envelope
gains `pid?`; the forwarder is the harness's child, so `process.ppid`
*is* the harness pid — no configuration, no process-table scan. Daemon
probes stored pids every 30s *(default)* via `process.kill(pid, 0)`;
dead ⇒ reap now, else the 30-min silence reaper backstops (it's also
the only reaper for pid-less rows — MCP gives the server no client pid
anywhere in the protocol; timeout is the industry answer there).
Without this delta no row ever gets a pid and a crashed harness ghosts
the P10 aggregate for half an hour. *Rejected:* pid + create-time
matching to defeat pid reuse (a real project shipped that watchdog and
it killed live servers when the clock basis shifted; reuse is rare and
the silence reaper catches it). Root §2 delta. *Status:* decided
by the maintainer, after ecosystem research.

**004-D6 — Rate-cap excess coalesces: feel it, don't show it.**
*Chosen:* an emote inside the 2s window applies its affect nudge
(saturation-scaled, §4) but enqueues no new expression; the tool
response says "coalesced". The cap exists so the face doesn't strobe —
a display concern; discarding the feeling with the frame would delete
real beats (error→recovery inside 2s happens). This is also the only
reading that makes root §2's "excess coalesced into the saturation
rule" grammatical. *Rejected:* hard reject (punishes bursts D26 merely
discourages, loses the second beat of a quick cue change);
different-cue carve-out (replace the queued tail on a cue change — more
rules to explain to agents; revisit only if M2b/M3b recordings show
missed recovery beats). Root §2 clarification. *Status:* decided
by the maintainer.

**004-D7 — Two-layer verification: headless vitest is the gate's bulk;
the app-open smoke stays thin.** *Chosen:* `server/` and `sessions/`
written with zero Electron imports (the discipline `affect/` already
follows); vitest boots the *real* server on an ephemeral port and runs
real HTTP clients — including the official MCP SDK client and the
actual forwarder script against a dead port — covering A1–A8 headless
in CI. The end-to-end word is proven by a thin synthetic-client script
(`scripts/`) against the live app with eyes on the Lar (A9/A10).
*Rejected:* Playwright/Electron automation of the visible half (brittle
real work, and M2a's gate defect taught us the eye catches what
automation misses). *Status:* decided by the maintainer.

**004-D8 — A8's 50ms binds in-script time; spawn lives under the 500ms
budget.** *Chosen:* the silent-exit ≤50ms figure measures script entry
→ exit, self-measured by the forwarder (timing surfaced only under
`LARES_FORWARDER_TIMING`, for tests); the spawn-inclusive path is
governed solely by the existing 500ms hard budget. Evidence from the
gate run: spawn-inclusive 50ms is physically impossible — bare Node's
20-run median was 51.8ms before the script's first line, and
Electron-as-Node measured ~100–118ms on Windows; the original number
was written imagining in-process time. Root §10 delta. *Rejected:*
chasing a faster launch mechanism (system Node, precompiled binary) —
real work to shave a window nobody perceives, since the forwarder
never blocks the harness turn either way. *Status:* decided
by the maintainer.
