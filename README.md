<p align="center">
  <img src="resources/icon.png" width="140" alt="Lares — a hooded house spirit">
</p>

<h1 align="center">Lares</h1>
<p align="center"><em>/ˈlɛəriːz/</em> · LAIR-eez</p>

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
a **Lar**. You can see it think, get stuck, wait, recover, and finish. You do
not need to open another activity panel.

Lares does not read transcripts. It does not guess sentiment. Agents report
feelings in the first person over MCP. Deterministic lifecycle hooks give the
baseline heartbeat. Emotion and mood keep history across the session.

`agent hooks + MCP → local affect engine → Live2D performance`

## Quickstart

Download the installer from the
[latest release](https://github.com/Xyri1/lares/releases/latest), install it,
and start Lares. Your Lar shows on the desktop. The tray holds the controls.

> [!IMPORTANT]
> Lares is early alpha, and the installers are unsigned — the developer
> cannot afford the signing fees. Broke-ass economics, not a security
> feature. Gatekeeper on macOS and SmartScreen on Windows will warn you;
> that is expected. Use the bypass steps in the
> [distribution guide](docs/distribution.md).

From the tray, choose **Configure Agent Integrations…**. Confirm the Claude
Code plugin or the Codex plugin when the installer asks.

Start a new agent session so the hooks and the local MCP connection can load.
Claude Code can reload plugins with `/reload-plugins`. Codex will ask you to
review the Lares hooks. Trust them when Codex asks.

Then work as usual. The Lar follows the session state and the agent's
first-person emotes. Use the tray to change the character, the scale, or Do
Not Disturb.

For manual setup, see the [Claude Code](plugins/claude-code/README.md) and
[Codex](plugins/codex/README.md) plugin guides.

## What it does

- Lives on your desktop in a transparent, draggable, always-on-top overlay.
- Connects to Claude Code and Codex through their native plugin systems.
- Keeps the runtime local. The daemon binds only to loopback. No transcript
  leaves your machine.
- Imports extracted VTube Studio-style Cubism SDK 3.0–4.2 model folders and
  maps their expressions into a portable Lar package.

The only app-initiated network request is the disclosed GitHub update check.
Agent plugin downloads start only after you request them and confirm them.

## Run from source

```sh
pnpm install
pnpm fetch-assets
pnpm dev
```

`fetch-assets` downloads Live2D Cubism Core and the Haru sample into
gitignored paths. During development, the Electron renderer runs on
`127.0.0.1:5300`.

## Bring your own Lar

From the tray, choose **Import Character…**. Select an extracted Live2D model
folder. Lares copies it into the managed character library. It validates the
package before it switches. It does not change the original folder.

See the [character package guide](docs/character-format.md) for compatibility,
the `lares/1` manifest, expression mapping, and the command-line import flow.

## Development

| Command                  | What it does                                        |
| ------------------------ | --------------------------------------------------- |
| `pnpm dev`               | Run Lares in development                            |
| `pnpm test`              | Run the main-side Vitest suite                      |
| `pnpm build`             | Typecheck and build the production app              |
| `pnpm fetch-assets`      | Download Cubism Core and Haru into gitignored paths |
| `pnpm package:preflight` | Validate local distribution inputs                  |
| `pnpm package:mac`       | Build the unsigned universal macOS DMG              |
| `pnpm package:win`       | Build the unsigned Windows x64 NSIS installer       |

## Project docs

Product and design truth lives under [`sdd/`](sdd/):

- [`sdd/PRD.md`](sdd/PRD.md) — why Lares exists
- [`sdd/SPEC.md`](sdd/SPEC.md) — contracts and invariants
- [`sdd/ROADMAP.md`](sdd/ROADMAP.md) — milestones and current scope
- [`AGENTS.md`](AGENTS.md) — repository map for contributors and coding agents
- [`docs/distribution.md`](docs/distribution.md) — unsigned builds and
  clean-machine gates

## License

[Apache 2.0](LICENSE). Live2D Cubism Core and bundled character assets keep
their own terms. See [NOTICE](NOTICE).