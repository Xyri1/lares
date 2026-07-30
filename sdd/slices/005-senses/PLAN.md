# Slice 005 — Senses · PLAN

Execution notes; disposable after the gate closes. Steps ordered by
dependency; each ends in something runnable. Tests land with their
step, not in a trailing phase.

---

## 1. Codex recon (§4 — before adapter code)

Against the installed Codex version: plugin manifest shape and
hooks-in-plugin support; confirm `~` expansion in `command` and
`%USERPROFILE%` expansion in `commandWindows` (docs say shell
execution + per-platform override; 005-D8's invocation form assumes
both); PostToolUse failure signal (settles whether 005-D6's
degradation applies); marketplace-add syntax for the guided wording.
Claude Code gets a sanity pass only (settings/`~/.claude.json` shapes
against the current release). Output: notes here.

**Recon.** Installed Codex is `codex-cli 0.134.0`.
Plugins load `hooks/hooks.json` and gate changed command hooks through
the standard `/hooks` trust review. Hook commands run through
`%COMSPEC% /C` on Windows and `$SHELL -lc` elsewhere, confirming
`%USERPROFILE%` / `~` expansion; JSON uses `commandWindows`
(camelCase — `command_windows` is TOML-only). `PostToolUse` exposes an
arbitrary `tool_response` but no standardized failure field, so
005-D6 stands. Marketplace syntax is
`codex plugin marketplace add <repository-owner>/lares`. Claude Code
`2.1.219` confirms the expected user MCP `{ type, url }` shape.
Both harnesses shell-wrap command hooks; 005-D9 records the
consequence and the shared-boundary fix.

## 2. Claude Code writer module (005-D1/D2)

`adapters/claude-code/` in main, zero Electron imports (path deps
injected, the `server/`/`sessions/` discipline): settings.json
recognize/remove/append pass, `~/.claude.json` compare-then-write,
backup-once, parse-abort, atomic writes. Vitest over temp-dir
fixtures: A1, A2, A3's removal half.

Implemented in `src/main/adapters/claude-code/`; the writer and the
dev-script entry both run against temp-home fixtures.

## 3. Registration wiring + shim + dev script (005-D3/D8)

Launch-time re-sync call (both files), port-change re-sync, the
`~/.lares/bin` shim writer (re-stamp every launch), and
`pnpm adapter:remove`. The shim writer is shared plumbing — Claude
Code's managed block bakes appPath directly; only the plugin needs the
shim — but writing it here keeps step 4 pure content. Vitest: shim
content on both platforms (path quoting), A3's script half.

Implemented at app launch after the ingress port binds. The shim is
atomically re-stamped on every launch; `pnpm adapter:remove` calls the
same Claude removal pass.

The real-shell regression check covers POSIX harness-pid capture,
Windows pid omission, and Windows profile paths containing spaces.

## 4. Codex plugin + marketplace (005-D4)

Committed plugin dir per recon'd format: manifest, hook set (root §3
events incl. PermissionRequest, commands invoking the shim with
harness tag `codex`), MCP entry with configured-port URL; marketplace
JSON at the repo location Codex expects. A validity check runs in
vitest against the recon'd schema (A4's headless half); guided install
wording lands in README-adjacent docs.

Implemented under `plugins/lares/`, with the repo marketplace at
`.agents/plugins/marketplace.json` and install guidance beside the
plugin. The committed Vitest contract check targets the installed
Codex shape. An isolated temporary-home install with Codex 0.134.0
lists the bundled `lares` MCP server enabled at the baked endpoint.

## 5. Density instrumentation (005-D7)

Dev-flag JSONL log in the daemon: one line per received emote
(timestamp, source, cue/params, coalesced?), one per baseline state
change. Trivial by design; no UI.

Implemented as `LARES_DENSITY_LOG=<path>`; the file is JSONL and is
created only when the flag is set. The real-session verdict remains
part of step 6.

**Automated gate:** 182 tests and the production build pass
on Windows and macOS. A5–A7 remain the interactive gate below.

## 6. Live smoke + density session + gate

Checklist order matters: fresh app launch (registration runs) →
*then* start sessions. Interactive Claude Code session + Codex session
with the plugin installed and trusted, simultaneously: A5 (states,
emotes from both, `status()`, cross-harness P10), A6 down/up
mid-session, then the 30–60min density session doubling as Claude
Code soak (A7). Verdict + any D26 rewording recorded here; both OSes
per the standing pattern — Windows first, macOS smoke on the maintainer's
machine.

## Standing risks

- The Codex plugin surface can drift; the implemented shape is pinned
  by recon and an isolated install against Codex 0.134.0. If a future
  version stops bundling hooks, reopen the shape question instead of
  improvising config surgery.
- `~/.claude.json` is Claude Code's internal state file with no
  public schema promise; the writer touches only `mcpServers.lares`
  and must survive unknown surrounding content verbatim.
- Hook-config snapshotting makes smoke ordering load-bearing
  (register before session start) — a checklist note, or A5 fails
  mysteriously.
- 005-D8's invocation form is verified on installed Codex 0.134.0:
  shell execution plus JSON `commandWindows`, with home expansion on
  both platforms.
- The density verdict is a judgment call on one session; resist
  turning it into a threshold mid-slice — reword, re-run once if
  egregious, and move on (M5b's §9 pass is the real bar).
