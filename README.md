<p align="center">
  <img src="resources/icon.png" width="140" alt="Lares — a hooded house spirit">
</p>

# Lares

Open-source desktop companion that gives AI agents a face. A Live2D character (a **Lar**) expresses the emotional arc of the agent sessions it watches — thinking, stuck, recovering — through continuously driven animation, not pre-baked clips.

Agents report feelings in the first person (MCP / local HTTP). Deterministic
hooks supply the baseline heartbeat. Nothing leaves the machine except the
disclosed GitHub update check.

**Status:** M5a implementation complete; clean-machine macOS/Windows gate
pending — see [`sdd/slices/008-ship/`](sdd/slices/008-ship/).

**Stack:** Electron + TypeScript (electron-vite, pnpm); Live2D via pixi-live2d-display.

## Setup

```bash
pnpm install
pnpm fetch-assets   # once after clone — Cubism Core + Hiyori sample
pnpm dev            # Electron app; renderer on 127.0.0.1:5300
```

## Commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | Run the app in development |
| `pnpm build` | Typecheck + production build |
| `pnpm test` | Vitest (main-side pure logic) |
| `pnpm fetch-assets` | Download Live2D Core + Hiyori into gitignored paths |
| `pnpm package:preflight` | Validate local distribution inputs |
| `pnpm package:mac` | Build the unsigned universal macOS DMG |
| `pnpm package:win` | Build the unsigned Windows x64 NSIS installer |

## Docs

Product and design truth lives under [`sdd/`](sdd/):

- [`sdd/PRD.md`](sdd/PRD.md) — why this product exists
- [`sdd/SPEC.md`](sdd/SPEC.md) — contracts and invariants
- [`sdd/ROADMAP.md`](sdd/ROADMAP.md) — what's next
- [`AGENTS.md`](AGENTS.md) — repo map for contributors and coding agents
- [`docs/character-format.md`](docs/character-format.md) — import and map a Live2D character package
- [`docs/distribution.md`](docs/distribution.md) — manual unsigned builds and the unclaimed clean-machine gate
