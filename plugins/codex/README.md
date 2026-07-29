# Lares for Codex

The plugin provides Lares's baseline lifecycle hooks and its local MCP server; skills arrive later. The hooks call the `~/.lares/bin/lares-forwarder` shim the desktop app maintains, so the plugin works across app updates without machine-specific paths.

## Install

```sh
codex plugin marketplace add Xyri1/lares
```

Start the Lares app, then use `/plugins` to install and enable Lares in Codex. At the next session start, trust the Lares hooks when Codex asks, or review them with `/hooks`.

## Uninstall

Remove the plugin through `/plugins`. Uninstalling the desktop app does not remove the plugin; without the app the hooks and MCP entry point at nothing, so remove the plugin too.
