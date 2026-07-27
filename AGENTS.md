# AGENTS.md

## What this is
Lares is an open-source desktop companion that gives AI agents a face: a
Live2D character (a Lar) expresses the emotional arc of the agent sessions
it watches through continuously driven animation parameters — first-person
emotes over MCP/local HTTP, deterministic hooks as the baseline heartbeat.
State: M3a (Nerves) closed 2026-07-27 — the wire contract is frozen.
M3b (Senses) implementation is frozen in sdd/slices/005-senses/; its
gate closes via slice 006 (sdd/slices/006-codex-hooks/ — the Codex
user-level hooks writer, open build slice). M2b (Performance) remains
the open human-paced tuning track. Stack:
Electron + TypeScript (electron-vite, pnpm); Live2D via pixi-live2d-display.

## Repo minimap
sdd/         SDD artifacts — SPEC.md is the source of truth
src/main     brain: manifest load, lares:// asset protocol, IPC, and the two
             windows — the desktop overlay (prod) + the dev control window
src/renderer body: stage/ (bootstrap, dev panel) + runtime/ (IRuntime over
             pixi-live2d-display — nothing else imports the Live2D packages)
scripts/     fetch-assets.mjs — downloads Core + Hiyori into gitignored paths
characters/  committed manifests; runtime/ asset dirs are gitignored
vendor/      gitignored — Cubism Core, fetched, never committed (D20 §6.8)

## Commands
- `pnpm dev` — run the app (dev server on 127.0.0.1:5300)
- `pnpm test` — vitest, main-side pure logic only
- `pnpm fetch-assets` — download Live2D Core + Hiyori (run once after clone)
- `pnpm build` — typecheck + production build

## Constitution
Stock — applies in any repo:
- Conventional commit messages: `type(scope): imperative summary`
  (feat / fix / chore / docs / refactor / test)

Product — one-line forms; full statements with teeth in sdd/PRINCIPLES.md,
binding on every change:
- P1  Emotion is functional — legibility is the floor, charm the ceiling.
- P2  First-person emotion — no transcript reading, no sentiment inference.
- P3  Nothing leaves the machine — sole network touch: disclosed update check.
- P4  The LLM appraises, never animates — no inference in the render path.
- P5  Character identity is portable — identity lives above any renderer.
- P6  One implementation, one clean seam — the brain↔body feed stays renderer-neutral.
- P7  Untrusted by default — all ingress validated, clamped, rate-bounded server-side.
- P8  History over events — same event under different history reads differently.
- P9  The fence holds — D03 non-goals bind until explicitly revised.
- P10 Aggregate loudly — a needs-input session is never visually masked.

## Where truth lives — read by task
Touching a contract, schema, or invariant  → sdd/SPEC.md (source of truth)
Working a milestone                        → sdd/slices/NNN-name/ (slice SPEC / DECISIONS / PLAN)
Checking a change against invariants       → sdd/PRINCIPLES.md (P-numbers)
Proposing or questioning a design choice   → sdd/DECISIONS.md; cite D-numbers
Scope questions (what's next, is X in)     → sdd/ROADMAP.md
Why this product exists                    → sdd/PRD.md

If `AGENTS.local.md` exists, read it last — environment/developer
overrides, wins on conflict.
