# Slice 006 — Codex hooks · PLAN

Execution notes; disposable after the gate closes.

---

## 1. Prelim research (SPEC §3 — before writer code)

**Done live during the slice grilling** (macOS, standalone
codex-cli 0.145.0; `hooks` feature stable + on by default,
`plugin_hooks` removed + false — reconfirming D15). Canonical
user-level target is `~/.codex/hooks.json` (upstream `discovery.rs`),
correcting the draft's `hooks/hooks.json`. Same parser and shape as
the plugin bundle. Trusted hooks execute with stdin JSON payloads;
trust is a single session-start review prompt with trust-all;
hash-keyed trust survives byte-identical rewrites (verified live);
user-scope state keys embed the absolute path + entry indices.
Untrusted hooks report "Completed" without executing (debugging
trap). `SessionEnd` never dispatches — no ninth entry. 006-D1/D2/D3
confirmed by the maintainer; failure branches pre-authorized
(006-D4). The maintainer's ruling: the CLI core behaves identically across
macOS/Windows, so findings carry. Remaining: the desktop-bundled
channel, checked at the §4 live gate.

## 2. Writer + wiring

`adapters/codex/hooks.ts` beside the shim writer, reusing the
claude-code writer's JSON helpers (export them rather than copying).
Entries imported from `plugins/lares/hooks/hooks.json` (006-D2).
Wire into `syncAdapters` and `scripts/remove-adapters.mjs`. Vitest
temp-dir fixtures: A1, A2.

## 3. Docs wording

Plugin README / guided install: the plugin delivers MCP (+skills
later); baseline sensing arrives via the app's hooks registration and
one session-start trust review (trust all — the Lares entries appear
twice; the plugin's copy is inert). No mention of `plugin_hooks`.

## 4. Live gate — closes M3b

Fresh app launch → then sessions. A3 trust stability, A4 both
harnesses simultaneously (states, emotes, `status()`, cross-harness
P10), A5 down/up mid-session, A6 the 30–60min density session +
verdict here. Windows first, macOS smoke on the maintainer's machine. On pass,
mark M3b closed in ROADMAP with close-out notes here.

**Close-out (maintainer, live).** A3–A5 pass on macOS and
Windows. The Codex side ran through the desktop app — settling
006-D4's remaining unknown: the desktop-bundled channel executes
user-level hooks (standalone CLI was already proven in §1), so both
channels work and M3b closes non-degraded, no split recorded.
**A6 verdict:** D26 density tuning deferred to post-demo; the
`instructions` wording stands unchanged (005-D7's judgment-call rule —
nothing egregious observed). M3b marked closed in ROADMAP.

## Standing risks

- The desktop-bundled channel remains unverified — if user-level
  hooks are gated or dead there, 006-D4's split rule applies (gate on
  the standalone channel, record the split). Standalone execution is
  already proven, so the both-fail branch is likely unreachable.
- Trust-hash churn: resolved — byte-identical rewrites verified not
  to re-prompt. Only legitimate content changes (e.g.
  shim path form) re-prompt, and that's one startup review.
- The density verdict stays a judgment call (005-D7 rules carry
  over): reword, re-run once if egregious, move on.
