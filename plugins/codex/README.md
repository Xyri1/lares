# Lares for Codex

The plugin provides six heartbeat hooks (`SessionStart`, `UserPromptSubmit`,
`PreToolUse`, `PostToolUse`, `PermissionRequest`, `Stop`), Lares's local MCP
server, and the
`calibrate-lar` skill. Routine hooks drive baseline state; Lares may derive a
deterministic satisfaction beat after a successful tool-bearing turn. Codex has
no dedicated failure hook, so Lares does not guess failure or recovery beats
from transcript text or undocumented payload fields.

Everyday first-person emote guidance comes from the MCP server's own
instructions, not a skill. When a task starts while the app is running, the
`SessionStart` hook injects a fixed one-line reminder into the model's context
that the emote tool is available — once per task, never per turn. The reminder
text never varies, is never derived from your prompt, and never selects an
emotion; setting `hostGuidance: false` in the app's `config.json` disables it
(no UI toggle), and it stays silent whenever the app is not running. When the
user directly asks the agent
to express its current appraisal, the guidance calls for exactly one
semantically appropriate cue even without a transition—never a phrase match or
the user's emotion. Hooks call the `~/.lares/bin/lares-forwarder` shim the
desktop app maintains, so the plugin works across app updates without
machine-specific paths.

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

Plugin 0.2.0 needs Lares MCP protocol v2 (`emote` takes one of six canonical
cues and `list_cues` is gone), so upgrade both together. The new skill and tool
snapshot appear only in a new task, and Codex may ask you to trust the hooks
again.

## Calibrate

An imported character has no cue mappings until you run the **Calibrate Lar**
skill (`$lares:calibrate-lar` when typed). It never activates implicitly — the
plugin sets `allow_implicit_invocation: false` — and it maps the character's
performances onto the six canonical cues through the Lares MCP server. Until
all six are mapped, the tray shows `Expression mapping n/6` and cue playback
stays off.

## Uninstall

Remove the plugin through `/plugins`. Uninstalling the desktop app does not remove the plugin; without the app the hooks and MCP entry point at nothing, so remove the plugin too.
