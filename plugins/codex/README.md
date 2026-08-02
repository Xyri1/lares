# Lares for Codex

The plugin provides six heartbeat hooks (`SessionStart`, `UserPromptSubmit`,
`PreToolUse`, `PostToolUse`, `PermissionRequest`, `Stop`) and Lares's local MCP
server. Hooks drive the operational state — working, awaiting input, done; the
Lar's felt state comes only from the model's own
`feel(valence, activation, control)` reports. Codex has no dedicated failure
hook, so Lares does not guess failure from transcript text or undocumented
payload fields.

Everyday first-person guidance comes from the MCP server's own instructions,
not a skill. When a task starts while the app is running, the `SessionStart`
hook injects a fixed one-line reminder into the model's context that the
`feel` tool is available — once per task, never per turn. The reminder text
never varies, is never derived from your prompt, and never selects an emotion;
setting `hostGuidance: false` in the app's `config.json` disables it (no UI
toggle), and it stays silent whenever the app is not running. At the start of a
turn, the `UserPromptSubmit` hook may return the session's last reported feel
so the model reassesses from it instead of re-reporting it. Hooks call the
`~/.lares/bin/lares-forwarder` shim the desktop app maintains, so the plugin
works across app updates without machine-specific paths.

## Install

In Lares, choose **Configure Agent Integrations…** from the tray and
confirm. If the Codex CLI is not discoverable from Lares, run:

```sh
codex plugin marketplace add Xyri1/lares --json
codex plugin add lares@lares --json
```

Start a new task in the Codex CLI or the ChatGPT desktop app, then trust the Lares hooks when Codex asks or review them with `/hooks`.

## Upgrade

**Configure Agent Integrations…** also upgrades a stale plugin. Manually:

```sh
codex plugin marketplace upgrade lares --json
codex plugin remove lares@lares --json
codex plugin add lares@lares --json
```

Plugin 0.2.0 drops the cue tools for `feel` and retires the **Calibrate Lar**
skill, so upgrade the app and the plugin together. The new tool snapshot
appears only in a new task, and Codex may ask you to trust the hooks again.

## Characters

Imported characters need no calibration: a package without its own anchors
performs the shipped default anchor set. Wiring and anchors are hand-authored
JSON in the character package.

## Uninstall

Remove the plugin through `/plugins`. Uninstalling the desktop app does not remove the plugin; without the app the hooks and MCP entry point at nothing, so remove the plugin too.
