# Slice 009 — Claude Code plugin · DECISIONS

Slice-scoped forks, all put to the maintainer in the slice grilling.
Root D15 and D29 carry the amendments; this file records what
executing them forked.

---

**009-D1 — Marketplace channel, mirroring Codex.** *Chosen:* the
Claude Code plugin installs user-run from the repo-hosted marketplace
(`/plugin marketplace add <repository-owner>/lares`), exactly the Codex install
shape. *Rejected:* an app-written skills-directory plugin
(`~/.claude/skills/lares/` auto-loads with no install step — would
have preserved D29's silent registration and was the grilling's
recommended option; the maintainer chose channel parity instead). *Rejected:*
keeping the settings writer for hooks with the plugin carrying MCP
only (the Codex split exists there by necessity — plugin hooks never
execute; on Claude Code they do, so the split would be by choice and
the plugin structurally incomplete). *Consequence:* Claude Code
baseline sensing becomes opt-in behind the install; D29's consent
revisit is resolved by Claude Code's own plugin surface. *Status:*
decided by the maintainer. *UX superseded by 008-D9:*
Lares now supplies the explicit initial consent and invokes that same
plugin surface as a convenience; plugin ownership and harness-native
trust are unchanged.

**009-D2 — Plugin owns hooks; the writer is demoted, not deleted.**
*Chosen:* registration paths (`syncClaudeCode`, hook-set append, MCP
entry add) are deleted; the removal pass runs at every launch as
legacy cleanup and keeps serving uninstall. Double-fire is the
hazard this kills: a pre-009 install that adds the plugin would
forward every event twice until the old settings block is gone.
*Rejected:* plugin detection with conditional writer (reads Claude
Code's plugin state — P11-adjacent — and leaves a double-fire
window). *Status:* decided by the maintainer.

**009-D3 — Skills stay deferred; sync means structure.** *Chosen:*
both plugins ship MCP + hooks; no `skills/` in either. "In sync on
the three parts" reads as: mirrored part-for-part where the harness
allows — the skills part is an identical-format drop-in later (the
`SKILL.md` layout is byte-compatible across both systems, the one
part that is). D15's reinforcement-only wording stands; emote
guidance already reaches agents through the MCP server (D26).
*Status:* decided by the maintainer. *Amended by
the maintainer:* both plugins ship the same `skills/emoting/SKILL.md`,
emote-only reinforcement of the D26 instructions (beats, cue-first,
silent degradation; no authoring surface — D32). Reinforcement-only
stands: the MCP instructions remain the primary vector.

**009-D4 — Two self-contained sibling dirs.** *Chosen:*
`plugins/codex/` (renamed from `plugins/lares/`) and
`plugins/claude-code/`, each holding its own manifest, hooks,
`.mcp.json`, README; the rename is free pre-launch and stops being
free after. *Rejected:* one shared dir with manifest-pointed
harness-specific files — both systems auto-read the *same* default
filenames (`.mcp.json`, `hooks/hooks.json`) in mutually unreadable
dialects (`mcpServers` camelCase wrapper vs flat/`mcp_servers`;
`PermissionRequest`+`commandWindows` vs
`Notification`/`PostToolUseFailure`), default-vs-manifest precedence
is undocumented, and the failure mode is Codex-dialect hooks
executing inside Claude Code (`PermissionRequest` is a real Claude
Code event). Verified against both vendors' current docs.
*Status:* decided by the maintainer.

**009-D5 — One shim, harness argument, dual files on win32.**
*Chosen:* the sh shim (`~/.lares/bin/lares-forwarder`) execs the
forwarder with `"${1:-codex}"`; the Claude Code plugin passes
`claude-code`; argument-less Codex entries keep working. Win32
writes the `.cmd` (Codex `commandWindows`) *and* the sh file —
Claude Code has no `commandWindows` key and runs hook commands
through Git Bash even on Windows — with the sh variant clearing
`LARES_HARNESS_PID` (MSYS pids, 005-D9). Engineering fork stated in
the grilling, unobjected. *Rejected:* a second harness-named shim
(two files to re-stamp on POSIX for no gain). *Status:* decided.
