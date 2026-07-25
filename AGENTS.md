# AGENTS.md

## What this is
Lares is an open-source desktop companion that gives AI agents a face: a
Live2D character (a Lar) expresses the emotional arc of the agent sessions
it watches through continuously driven animation parameters — first-person
emotes over MCP/local HTTP, deterministic hooks as the baseline heartbeat.
State: pre-code — next milestone is M0 (license clearances). Stack (decided,
not yet built): Electron + TypeScript; Live2D via pixi-live2d-display.

## Repo minimap
sdd/        SDD artifacts — SPEC.md is the source of truth

## Commands
- `pnpm dev` — run the app
- `pnpm test` — run tests (vitest)
- `pnpm fetch-assets` — download Live2D assets (not yet run automatically)

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
