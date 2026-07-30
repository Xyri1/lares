<p align="center">
  <img src="resources/icon.png" width="140" alt="Lares — a hooded house spirit">
</p>

<h1 align="center">Lares</h1>

<p align="center">
  <strong>Give your AI agent a face.</strong><br>
  A local Live2D companion for Claude Code and Codex.
</p>

<p align="center">
  <a href="LICENSE"><img alt="Apache 2.0 license" src="https://img.shields.io/badge/license-Apache--2.0-blue.svg"></a>
  <img alt="Early alpha" src="https://img.shields.io/badge/status-early_alpha-orange.svg">
  <img alt="macOS and Windows" src="https://img.shields.io/badge/platform-macOS_%7C_Windows-lightgrey.svg">
</p>

<p align="center">
  <strong>English</strong> · <a href="README.zh-CN.md">简体中文</a>
</p>

## What it is

Lares turns an agent session into a continuously animated desktop character —
a **Lar**. You can see it thinking, getting stuck, waiting, recovering, and
finishing without opening another activity panel.

Instead of reading transcripts or guessing sentiment, Lares lets agents report
feelings in the first person over MCP. Deterministic lifecycle hooks provide the
baseline heartbeat, while emotion and mood carry history across the session.

`agent hooks + MCP → local affect engine → Live2D performance`

> [!IMPORTANT]
> Lares is early alpha. M5a is implemented, but clean-machine acceptance on
> macOS and Windows is still pending. Installers are intentionally unsigned.

## How to use

1. Start Lares. Your Lar appears on the desktop and its controls live in the
   tray.
2. Choose **Configure Agent Integrations…** and confirm the Claude Code or
   Codex plugin installation.
3. Start a new agent session so its hooks and local MCP connection load.
   Claude Code can reload with `/reload-plugins`; Codex will ask you to review
   and trust the Lares hooks.
4. Work normally. The Lar follows the session's state and the agent's
   first-person emotes; use the tray to change characters, scale, or DND.

See the [Claude Code](plugins/claude-code/README.md) and
[Codex](plugins/codex/README.md) plugin guides for manual setup.

## What it does

- Lives on your desktop in a transparent, draggable, always-on-top overlay.
- Connects to Claude Code and Codex through their native plugin systems.
- Keeps the runtime local: the daemon binds only to loopback and no transcript
  leaves your machine.
- Imports extracted VTube Studio-style Cubism SDK 3.0–4.2 model folders and
  maps their expressions into a portable Lar package.

The only app-initiated network request is the disclosed GitHub update check.
Agent plugin downloads happen only after you request and confirm them.

## Run from source

```sh
pnpm install
pnpm fetch-assets
pnpm dev
```

`fetch-assets` downloads Live2D Cubism Core and the Haru sample into gitignored
paths. The Electron renderer runs on `127.0.0.1:5300` during development.

## Bring your own Lar

Choose **Import Character…** from the tray and select an extracted Live2D model
folder. Lares copies it into the managed character library, validates it before
switching, and leaves the original untouched.

See the [character package guide](docs/character-format.md) for compatibility,
the `lares/1` manifest, expression mapping, and the command-line import flow.

## Development

| Command | What it does |
| --- | --- |
| `pnpm dev` | Run Lares in development |
| `pnpm test` | Run the main-side Vitest suite |
| `pnpm build` | Typecheck and build the production app |
| `pnpm fetch-assets` | Download Cubism Core and Haru into gitignored paths |
| `pnpm package:preflight` | Validate local distribution inputs |
| `pnpm package:mac` | Build the unsigned universal macOS DMG |
| `pnpm package:win` | Build the unsigned Windows x64 NSIS installer |

## Project docs

Product and design truth lives under [`sdd/`](sdd/):

- [`sdd/PRD.md`](sdd/PRD.md) — why Lares exists
- [`sdd/SPEC.md`](sdd/SPEC.md) — contracts and invariants
- [`sdd/ROADMAP.md`](sdd/ROADMAP.md) — milestones and current scope
- [`AGENTS.md`](AGENTS.md) — repository map for contributors and coding agents
- [`docs/distribution.md`](docs/distribution.md) — unsigned builds and
  clean-machine gates

## License

[Apache 2.0](LICENSE). Live2D Cubism Core and bundled character assets retain
their own terms; see [NOTICE](NOTICE).
