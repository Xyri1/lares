# Lares for Claude Code

The plugin provides six heartbeat hooks (`UserPromptSubmit`, `PreToolUse`,
`PostToolUse`, `PostToolUseFailure`, permission-prompt `Notification`, `Stop`)
and Lares's local MCP server. Hooks drive the operational state — working,
awaiting input, error, done; the Lar's felt state comes only from the model's
own `feel(valence, activation, control)` reports.

Everyday first-person guidance comes from the MCP server's own instructions,
not a skill. While the app runs, Lares maintains a one-line standing rule at
`~/.claude/rules/lares.md` — written at app start, removed at quit and on
uninstall — reminding the model the `feel` tool is available. The rule text
never varies, is never derived from your prompts, and never selects an
emotion; setting `hostGuidance: false` in the app's `config.json` disables it
(no UI toggle). At the start of a turn, the `UserPromptSubmit` hook may return
the session's last reported feel so the model reassesses from it instead of
re-reporting it. Hooks call the `~/.lares/bin/lares-forwarder` shim the
desktop app maintains, so the plugin works across app updates without
machine-specific paths.

## Install

In Lares, choose **Configure Agent Integrations…** from the tray and
confirm. If the Claude Code CLI is not discoverable from Lares, run:

```
claude plugin marketplace add Xyri1/lares --scope user
claude plugin install lares@lares --scope user
```

Start the Lares app, then restart Claude Code (or run `/reload-plugins`) so the hooks and MCP server load.

## Upgrade

**Configure Agent Integrations…** also upgrades a stale plugin. Manually:

```
claude plugin marketplace update lares
claude plugin update lares@lares --scope user
```

Plugin 0.2.0 drops the cue tools for `feel` and retires the `calibrate-lar`
skill, so upgrade the app and the plugin together. The new tool snapshot
appears only in a new session or after `/reload-plugins`, and Claude Code may
ask you to trust the hooks again.

## Characters

Imported characters need no calibration: a package without its own anchors
performs the shipped default anchor set. Wiring and anchors are hand-authored
JSON in the character package.

## Uninstall

`/plugin uninstall lares@lares`. Uninstalling the desktop app does not remove the plugin; without the app the hooks and MCP entry point at nothing, so remove the plugin too.
