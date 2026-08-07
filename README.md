<p align="center">
  <img src="resources/icon.png" width="140" alt="Lares — a hooded house spirit">
</p>

<h1 align="center">Lares</h1>
<p align="center"><em>/ˈlɛəriːz/</em> · LAIR-eez</p>

<p align="center">
  <strong>Give your AI agent a face.</strong><br>
  A local Live2D companion that turns your agent's own appraisal into a living performance.
</p>

<p align="center">
  <a href="LICENSE"><img alt="Apache 2.0 license" src="https://img.shields.io/badge/license-Apache--2.0-blue.svg"></a>
  <img alt="Early alpha" src="https://img.shields.io/badge/status-early_alpha-orange.svg">
  <img alt="macOS and Windows" src="https://img.shields.io/badge/platform-macOS_%7C_Windows-lightgrey.svg">
</p>

<p align="center">
  <strong>English</strong> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.ja.md">日本語</a>
</p>

## What it is

Lares turns an agent session into a continuously animated desktop character —
a **Lar**. You can see it think, get stuck, wait, recover, and finish. You do
not need to open another activity panel.

## Why Lares is different

Typical agent pets map lifecycle events to fixed reactions: working means
busy, failure means sad, and completion means happy. They show what happened,
but not how the model appraises the work.

Lares keeps lifecycle events as an operational heartbeat, then adds a separate
first-person channel. The model projects its contextual appraisal through
`feel(valence, activation, control)` — unpleasant to pleasant, subdued to
energized, and overwhelmed to in control. Lares turns that small report into
a continuous, character-specific performance.

`model appraisal → feel(v, a, c) → local deterministic performance → Lar`

Lares does not read transcripts or model internals. The model reports its own
appraisal; hooks report only operational facts such as working or awaiting
input.

That expressiveness is intentionally cheap. Fixed event-driven pets need almost
no model output but are limited to canned reactions. Asking an agent to author
expressions, parameters, or animation curves would offer more freedom, but
would burn tokens and could produce inconsistent motion. Lares asks for three
bounded values when the agent's appraisal meaningfully changes; unchanged
feelings produce no call. Everything continuous happens locally — no animation
prompts, keyframes, or per-frame model inference.

> Broad emotional range from sparse three-value reports — not a fixed reaction
> list or a stream of animation tokens.

## Install

Download the installer for your system from the
[latest release](https://github.com/Xyri1/lares/releases/latest).

> [!IMPORTANT]
> Lares is early alpha and the installers are **unsigned** — the developer
> cannot afford the signing fees. Broke-ass economics, not a security
> feature. Each system interrupts you once. The steps below are the
> supported way through.

### macOS

Open the DMG and drag **Lares.app** into **Applications**. The first launch is
then refused outright:

> Apple could not verify "Lares" is free of malware that may harm your Mac or
> compromise your privacy.

The only action offered is **Move to Trash**. Do not take it — dismiss the
dialog, then:

1. Open **System Settings → Privacy & Security**.
2. Scroll down to **Security**. A line reads *"Lares" was blocked to protect
   your Mac*.
3. Click **Open Anyway**.
4. Authenticate, then confirm in the last prompt.

macOS remembers the decision. Every later launch opens normally.

### Windows

Run the installer. SmartScreen shows **Windows protected your PC**. Click
**More info**, then **Run anyway**. Windows then asks to allow an app from an
**unknown publisher** — choose **Yes**, and the installation proceeds.

That is the whole difference an unsigned build makes. Each release also ships
a SHA-256 checksum if you want to verify the download first.

## Connect your agent

Start Lares. Your Lar shows on the desktop, and the tray holds the controls.

From the tray, choose **Configure Agent Integrations…**. Confirm the Claude
Code plugin or the Codex plugin when the installer asks.

Start a new agent session so the hooks and the local MCP connection can load.
Claude Code can reload plugins with `/reload-plugins`. Codex will ask you to
review the Lares hooks. Trust them when Codex asks.

Then work as usual. The Lar shows the session's operational state and the
agent's first-person feeling reports. Use the tray to change the character,
the scale, or Do Not Disturb.

For manual setup, see the [Claude Code](plugins/claude-code/README.md) and
[Codex](plugins/codex/README.md) plugin guides.

## What it does

- Lives on your desktop in a transparent, draggable, always-on-top overlay.
- Connects to Claude Code and Codex through their native plugin systems.
- Turns a three-axis feeling report into continuous performance instead of
  selecting from a fixed emote list.
- Keeps the runtime local. The daemon binds only to loopback. No transcript
  leaves your machine.
- Imports extracted VTube Studio-style Cubism SDK 3.0–4.2 model folders into
  a portable Lar package.

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

Third-party model import is not available in this release. The tray keeps a
disabled **Import Character — Coming Soon** item while the workflow is finished;
Lares currently uses its bundled Haru character.

See the [character package guide](docs/en/character-format.md) for
compatibility, the `lares/1` manifest, anchor and wiring authoring, and the
command-line development flow.

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

Human-facing guides live under [`docs/`](docs/), in English and 简体中文:

- [`docs/en/usage.md`](docs/en/usage.md) — install, connect an agent, read
  your Lar
- [`docs/en/development.md`](docs/en/development.md) — architecture, dev
  loop, and the rules a change must follow

Product and design truth lives under [`sdd/`](sdd/):

- [`sdd/PRD.md`](sdd/PRD.md) — why Lares exists
- [`sdd/SPEC.md`](sdd/SPEC.md) — contracts and invariants
- [`sdd/ROADMAP.md`](sdd/ROADMAP.md) — milestones and current scope
- [`AGENTS.md`](AGENTS.md) — repository map for contributors and coding agents
- [`docs/en/distribution.md`](docs/en/distribution.md) — unsigned builds and
  clean-machine gates

## License

[Apache 2.0](LICENSE). Live2D Cubism Core and bundled character assets keep
their own terms. See [NOTICE](NOTICE).

## Acknowledgments

Lares is built on the work of these projects:

- [Live2D Cubism SDK](https://www.live2d.com/en/sdk/about/) — Cubism Core
  and Framework, © Live2D Inc., under Live2D's own license terms (see
  [NOTICE](NOTICE)). The bundled Haru sample is a Live2D sample model.
- [pixi-live2d-display](https://github.com/guansss/pixi-live2d-display) —
  Live2D model rendering on PixiJS.
- [PixiJS](https://pixijs.com/) — the WebGL renderer behind the stage.
- [Electron](https://www.electronjs.org/) — the desktop shell, with
  [electron-vite](https://electron-vite.org/) and
  [electron-builder](https://www.electron.build/) for the dev loop and
  packaging.
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
  — the Model Context Protocol server that receives first-person feeling
  reports.
- [Zod](https://zod.dev/) — schema validation at every ingress point.
