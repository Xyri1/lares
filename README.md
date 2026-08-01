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
  <strong>English</strong> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.ja.md">日本語</a>
</p>

## What it is

Lares turns an agent session into a continuously animated desktop character —
a **Lar**. You can see it think, get stuck, wait, recover, and finish. You do
not need to open another activity panel.

Lares does not read transcripts. It does not guess sentiment. Agents report
feelings in the first person over MCP. Deterministic lifecycle hooks give the
baseline heartbeat. Emotion and mood keep history across the session.

`agent hooks + MCP → local affect engine → Live2D performance`

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

A newly imported model then needs calibration. Run the **Calibrate Lar**
skill from your agent — `/lares:calibrate-lar` in Claude Code,
`$lares:calibrate-lar` in Codex. The agent previews the model's expressions
on your desktop, asks you about what it cannot see, and maps them onto the
six canonical cues. Keep the Lar visible while it runs. Until all six are
mapped, the tray shows `Expression mapping n/6` and the affect engine does
not play cues on its own.

See the [character package guide](docs/en/character-format.md) for
compatibility, the `lares/1` manifest, expression mapping, and the
command-line import flow.

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