# Lares for Codex

The plugin provides Lares's baseline lifecycle hooks, its local MCP server, and an `emoting` skill that reinforces the server's emote guidance. The hooks call the `~/.lares/bin/lares-forwarder` shim the desktop app maintains, so the plugin works across app updates without machine-specific paths.

## Install

In Lares, choose **Configure Agent Integrations…** from the tray and
confirm. If the Codex CLI is not discoverable from Lares, run:

```sh
codex plugin marketplace add Xyri1/lares --json
codex plugin add lares@lares --json
```

Start a new task in the Codex CLI or the ChatGPT desktop app, then trust the Lares hooks when Codex asks or review them with `/hooks`.

## Uninstall

Remove the plugin through `/plugins`. Uninstalling the desktop app does not remove the plugin; without the app the hooks and MCP entry point at nothing, so remove the plugin too.
