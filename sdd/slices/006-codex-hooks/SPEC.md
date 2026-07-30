# Slice 006 — Codex hooks · SPEC

**Artifact:** Slice SPEC · **Slice:** 006-codex-hooks (completes ROADMAP M3b's gate) · **Status:** Closed

**Why / gate.** The 005 live smoke proved Codex trust-reviews
plugin-bundled hooks but never executes them (`plugin_hooks` removed
upstream — D15 as amended). Slice 005 is frozen as
implemented; this slice carries the remaining half of the M3b gate:
Codex baseline states via an app-written user-level
`~/.codex/hooks.json`, plus the A6/A7 live checks 005 left
unrun. Exit gate: the M3b gate as originally written, now closeable —
both harnesses drive the Lar simultaneously (baseline states via
hooks, emotes via MCP), daemon down/up degrading gracefully, density
verdict recorded.

Everything here executes the design already recorded in root D15;
no wire, server, or affect changes. The Claude Code adapter is
untouched.

---

## 1. Scope

**In:** a Codex hooks writer targeting user-level
`~/.codex/hooks.json` (runs under Codex's stable `hooks`
feature), wired into launch-time re-sync, port-change re-sync, and
`pnpm adapter:remove`; plugin README/guided-install wording updated to
match reality (hooks are not delivered by the plugin); the deferred
live checks — Codex baseline states, cross-harness aggregation,
down/up (005's A6), density session (005's A7).

**Out (fence):** any change to the frozen 005 implementation or docs;
touching the plugin's bundled `hooks/hooks.json` (kept in-repo for the
D15 fold-back tripwire); enabling or documenting the removed
`plugin_hooks` flag; consent UI (still M5a/M5b, D29); any wire change;
any third harness.

**Failure branches (pre-authorized, 006-D4):** user-level hooks
failing to execute on *both* installed channels ⇒ Codex baseline
sensing is unsupported (P11) — no writer ships, A4 is reworded to
Claude-Code-only baselines plus both-harness emotes, ROADMAP records
M3b closed-with-exception, and the D15 tripwire gains "Codex ships any
working hook execution ⇒ reopen." Working on one channel only ⇒ the
writer ships, the live gate runs on the working channel, M3b closes
non-degraded with the split recorded.

## 2. The writer (006-D1/D2)

Same discipline as the Claude Code settings writer, same recognition
convention, different file:

- **Target:** `~/.codex/hooks.json`. A Lares entry is any hook
  whose command references the launcher shim (`lares-forwarder`, any
  path variant). Re-sync removes all recognized entries and appends
  the current set, preserving everything else; second run on an
  unchanged config is a byte-identical no-op.
- **Entries:** identical in shape and content to the plugin's bundled
  `hooks/hooks.json` — root §3 events, `command` (POSIX, `$PPID`
  capture) + `commandWindows` (`call`-quoted, pid cleared per 005-D9),
  both invoking the shim the app already re-stamps every launch.
- **Safety:** unparseable ⇒ abort loudly, touch nothing; `~/.codex/`
  absent ⇒ Codex isn't installed, skip silently, re-check next launch;
  one-time backup (`hooks.json.lares-backup`) before first-ever
  modification of a pre-existing file — a file the writer itself
  created gets no backup. The file MAY be created if `~/.codex/`
  exists but `hooks.json` doesn't — unlike `~/.claude.json`, this file
  is additive user config, not harness-owned internal state.
- **Trust is never bypassed:** Codex's hook review still gates
  execution — a single session-start prompt covering everything
  pending (trust-all available; `/hooks` works too). Trust is keyed by
  normalized-content hash (`[hooks.state]` in `config.toml`) —
  verified live: byte-identical rewrites never re-prompt — so
  write-only-if-different keeps approvals stable. Keys are also
  positional (absolute path + event + entry indices), so a user's own
  edits around our entries can force re-review of unchanged Lares
  hooks; that's Codex's property, documented, not disciplined away.
  The guided wording tells the user to expect one review prompt
  listing the Lares entries twice (the plugin's inert copy and the
  live user-level set — trust all).
- **Uninstall:** the removal pass joins `pnpm adapter:remove`; if
  stripping the Lares entries leaves the `hooks` object empty, the
  file is deleted.

## 3. Prelim research (settled)

Run against standalone codex-cli 0.145.0 (macOS) during the slice
grilling. Per the maintainer's ruling the CLI core behaves identically across
macOS and Windows (one Rust engine; only the shell wrapper differs,
verified at 005), so the findings carry — `commandWindows` is still
exercised by the Windows live gate. Remaining live question: the
desktop-bundled channel, folded into the §4 live gate.

1. **Shape + execution — confirmed.** The canonical user-level file is
   `~/.codex/hooks.json` (upstream `discovery.rs` joins each config
   layer's folder with `hooks.json`; a project layer
   `.codex/hooks.json` also exists, higher precedence). Same parser
   and shape as the plugin bundle (`HookHandlerConfig`:
   `command`/`commandWindows`/`timeout`…, PascalCase event keys).
   Trusted hooks execute; the payload arrives on hook stdin as JSON
   (`session_id`, `cwd`, `hook_event_name`, `model`,
   `permission_mode`, `source`).
2. **Snapshot semantics.** The hook engine initializes on the first
   turn — a session that never takes a turn emits nothing. Mid-session
   file-change pickup untested; write-only-if-different makes it
   near-irrelevant.
3. **Trust — confirmed.** Review is a single session-start prompt with
   trust-all (`/hooks` works too). The hash survives byte-identical
   rewrites (verified live); any content change reads "Modified —
   review required". User-scope state keys embed the absolute file
   path, event, and entry indices. Untrusted hooks report "Completed"
   without executing — a debugging trap noted for the live smoke.
4. **`SessionEnd` — never fires** (clean `codex exec` exit, TUI quit
   with and without a turn; 0.145.0). No ninth entry; the 30-minute
   silence reap stands. (`SessionEnd` timeouts clamp to 3s — moot.)

## 4. Acceptance (GWT)

**A1 — Writer.** GIVEN fixtures — no `hooks.json`; a file with
user entries; stale Lares entries under a different shim path — WHEN
the writer runs THEN the Lares set is present exactly once, user
entries untouched, stale entries gone; WHEN run again THEN
byte-identical; GIVEN broken JSON THEN abort, untouched, loud log;
backup exists after first modification of a pre-existing file only —
a file the writer created gets no backup.

**A2 — Removal.** GIVEN mixed Lares and user entries WHEN
`pnpm adapter:remove` runs THEN only Lares entries are gone, the rest
byte-preserved; GIVEN a file holding only Lares entries THEN the file
is deleted.

**A3 — Trust stability (live).** GIVEN the entries approved once in
the trust review WHEN the app relaunches (re-sync no-op) THEN no
re-approval is prompted and hooks still execute.

**A4 — Live gate (eyes on, completes M3b).** GIVEN a fresh app launch
and then an interactive Claude Code session and a Codex session
working simultaneously THEN both drive baseline states, an emote from
each plays, `status()` lists both harnesses, and P10 aggregation holds
across them.

**A5 — Down/up (005's A6).** GIVEN both sessions live WHEN the daemon
is killed THEN both harnesses continue unbothered; WHEN relaunched
THEN the next events land with no client-side reconfiguration.

**A6 — Density (005's A7).** GIVEN the 005 §5 session (dev-flag JSONL,
30–60min interactive Claude Code work) THEN the verdict is recorded in
the 006 PLAN and any D26 rewording is committed with before/after.

A1–A2 headless (vitest, temp-dir fixtures); A3–A6 live smoke.
