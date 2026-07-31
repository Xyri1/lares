# Lares for Codex

The plugin provides Lares's baseline lifecycle hooks, its local MCP server, and the `calibrate-lar` skill. Everyday emote guidance comes from the MCP server's own instructions, not a skill. The hooks call the `~/.lares/bin/lares-forwarder` shim the desktop app maintains, so the plugin works across app updates without machine-specific paths.

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
