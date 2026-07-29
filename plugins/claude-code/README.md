# Lares for Claude Code

The plugin provides Lares's baseline lifecycle hooks and its local MCP server; skills arrive later. The hooks call the `~/.lares/bin/lares-forwarder` shim the desktop app maintains, so the plugin works across app updates without machine-specific paths.

## Install

```
/plugin marketplace add Xyri1/lares
/plugin install lares@lares
```

Start the Lares app, then restart Claude Code (or run `/reload-plugins`) so the hooks and MCP server load.

## Uninstall

`/plugin uninstall lares@lares`. Uninstalling the desktop app does not remove the plugin; without the app the hooks and MCP entry point at nothing, so remove the plugin too.
