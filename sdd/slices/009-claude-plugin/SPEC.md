# Slice 009 — Claude Code plugin · SPEC

**Artifact:** Slice SPEC · **Slice:** 009-claude-plugin (re-scopes ROADMAP M5a's open gate) · **Status:** Implemented; live gate folded into 008's A8/A9

**Why / gate.** Claude Code ships an official plugin surface —
manifest, `hooks/hooks.json`, `.mcp.json`, `skills/`, distributed
through repo-hosted marketplaces — and unlike Codex it *executes*
plugin hooks. The overlooked consequence: Lares's silent
settings-writer registration (D29) was never the only channel, and the
plugin channel is the one that matches the Codex adapter's install
story (owner/repo marketplace add, harness-native trust surface).
This slice migrates the Claude Code adapter to a marketplace plugin
delivering hooks + MCP, demotes the settings writer to a legacy
cleaner, and re-scopes 008's clean-machine gate to verify the new
install story once. Decided by the maintainer in the slice grilling;
forks recorded in this slice's DECISIONS.

---

## 1. Scope

**In:** `plugins/claude-code/` (manifest, nine-event
`hooks/hooks.json` invoking the launcher shim, `mcpServers`-wrapped
`.mcp.json`, README) plus the repo-root `.claude-plugin/marketplace.json`;
`plugins/lares` → `plugins/codex` rename (009-D4); the shared
forwarder shim gains a harness argument and a Windows sh variant
(009-D5); the Claude Code writer's registration path is deleted and
its removal pass runs at every launch as legacy cleanup; SPEC §6 /
D15 / D29 / ROADMAP updated.

**Out (fence):** skills in either plugin (deferred beyond M5a — D15
stands, 009-D3) — *fence lifted for both plugins:* each
ships the same `skills/emoting/SKILL.md`, emote-only reinforcement of
the D26 instructions (009-D3 as amended); any Codex adapter behavior
change — *fence lifted:* the maintainer's live re-smoke confirmed Codex executes
plugin-bundled hooks, the D15 fold-back tripwire fired, and the
`~/.codex/hooks.json` writer was deleted within this slice (PLAN §3);
any wire change (frozen at M3a); consent UI (the marketplace
install *is* the consent surface for Claude Code — D29 as amended);
port configurability in plugin artifacts (baked 21473, 004-D4 parity
with the Codex plugin).

## 2. Delivery (009-D1/D2)

- **Channel:** the Lares repo doubles as a Claude Code marketplace via
  root `.claude-plugin/marketplace.json` (entry `lares`, source
  `./plugins/claude-code`), alongside the existing Codex
  `.agents/plugins/marketplace.json`. Install:
  `/plugin marketplace add <repository-owner>/lares` → `/plugin install lares@lares`.
  Slice 008-D9 later made these exact operations a consented tray
  action while retaining them as the manual fallback.
- **Plugin owns hooks.** Same nine events the writer registered
  (SessionStart, UserPromptSubmit, PreToolUse, PostToolUse,
  PostToolUseFailure, Notification matcher `permission_prompt`, Stop,
  SubagentStart, SubagentStop), each a POSIX command —
  `LARES_HARNESS_PID=$PPID ~/.lares/bin/lares-forwarder claude-code` —
  since Claude Code runs hook commands through Git Bash on every
  platform. MCP entry: `mcpServers.lares`, streamable HTTP,
  `http://127.0.0.1:21473/v1/mcp`.
- **The writer dies; the cleaner stays.** Launch-time `syncAdapters`
  now runs the removal pass (recognized-content hooks out of
  `~/.claude/settings.json`, `mcpServers.lares` out of
  `~/.claude.json`) so pre-009 installs never double-fire once the
  plugin is enabled. Same pass serves uninstall, unchanged.

## 3. Shim (009-D5)

One shim, both harnesses: the sh shim execs the forwarder with
`"${1:-codex}"` — existing Codex hook entries (no argument) keep
meaning `codex`; the Claude Code plugin passes `claude-code`. On
win32 the app writes *both* `lares-forwarder.cmd` (Codex
`commandWindows`, unchanged) and the sh file (Claude Code's Git
Bash), the sh variant clearing `LARES_HARNESS_PID` because Git Bash
reports MSYS pids (005-D9 truthful-or-absent).

## 4. Acceptance (GWT)

**A1 — Artifacts.** GIVEN the repo THEN
`.claude-plugin/marketplace.json` points `lares` at
`./plugins/claude-code`; both plugin dirs hold their harness manifest,
hooks, `.mcp.json`, README, and the same `emoting` skill (fence lift —
emote-only, no authoring mention per D32); Claude hooks carry
the nine events with the shim
command (`Notification` matcher `permission_prompt`); `.mcp.json`
carries the wrapped fixed endpoint. Codex keeps its eight-event hook
dialect and flat fixed endpoint.

**A2 — Shim.** GIVEN POSIX THEN one executable sh shim taking the
harness argument with `codex` default; GIVEN win32 THEN both files,
sh variant clearing the pid; re-runs re-stamp the current app path.

**A3 — Cleaners, both harnesses.** GIVEN legacy-registered fixtures —
Claude settings/config files, and a `~/.codex/hooks.json` from
pre-fold-back builds — WHEN the app launches THEN only recognized
Lares content is removed, user content byte-preserved, backup-once
honored, broken JSON aborts loudly, nothing is ever created (the
Codex file is deleted when only Lares entries remained); second run
is a no-op.

**A4 — Shell path.** GIVEN the committed plugin's SessionStart
command run through Git Bash with the shim installed THEN the daemon
ingests a `harness: "claude-code"` envelope (pid present on POSIX,
absent on Windows).

**A5 — Live gate (folds into 008 A8/A9).** GIVEN a clean machine WHEN
the documented tray setup runs (app + consent + compatible
harness-owned plugin manager) THEN hooks execute after plugin
enablement, an emote plays over the plugin's MCP entry, and app
uninstall plus `/plugin uninstall` leaves no Lares residue.

A1–A4 headless (vitest); A5 rides the 008 clean-machine run, once,
after this slice lands.
