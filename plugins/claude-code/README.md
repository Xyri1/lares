# Lares for Claude Code

The plugin provides Lares's baseline lifecycle hooks, its local MCP server, and the `calibrate-lar` skill. Everyday emote guidance comes from the MCP server's own instructions, not a skill. The hooks call the `~/.lares/bin/lares-forwarder` shim the desktop app maintains, so the plugin works across app updates without machine-specific paths.

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

Plugin 0.2.0 needs Lares MCP protocol v2 (`emote` takes one of six canonical
cues and `list_cues` is gone), so upgrade both together. The new skill and tool
snapshot appear only in a new session or after `/reload-plugins`, and Claude
Code may ask you to trust the hooks again.

## Calibrate

An imported character has no cue mappings until you run
`/lares:calibrate-lar`. The skill is user-invoked only — Claude never starts it
on its own — and it maps the character's performances onto the six canonical
cues through the Lares MCP server. Until all six are mapped, the tray shows
`Expression mapping n/6` and cue playback stays off.

## Uninstall

`/plugin uninstall lares@lares`. Uninstalling the desktop app does not remove the plugin; without the app the hooks and MCP entry point at nothing, so remove the plugin too.
