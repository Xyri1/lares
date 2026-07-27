# Lares for Codex

Lares forwards Codex lifecycle events to the local Lares app and provides its local MCP server.

## Install

```sh
codex plugin marketplace add Xyri1/lares
```

Start Codex, then use `/plugins` to install and enable Lares. Review and trust its hooks through Codex's standard hook trust flow with `/hooks`.

Start a new Codex session after enabling the plugin so its hooks are loaded.
