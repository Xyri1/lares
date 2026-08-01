# Slice 012 — Host guidance reinforcement · PLAN

**Artifact:** Slice PLAN · **Slice:** 012-host-guidance ·
**Status:** I1/I2 complete; G1 behavioral gate open ·
**Date:** 2026-08-01

## R1 — Establish the failure baseline — complete

- Verify the plugin, MCP server, and `emote` tool are present in a fresh task.
- Verify the deterministic hooks still reach the running Lar.
- Record the completed task's zero-emote result without treating one task as a
  population measurement.

## R2 — Survey instruction surfaces — complete

- Compare MCP instructions, tool metadata, skills, host instruction files,
  output styles, lifecycle hooks, tool hooks, continuation hooks, and
  host-specific routers.
- Confirm current Codex and Claude Code support structured model-visible
  `additionalContext` on `UserPromptSubmit` and `SessionStart`.
- Record why `UserPromptSubmit` is the smallest cross-host experiment.

## I1 — Settle the remaining contract — complete

Event, gating, toggle, and scoring are decided (012-D2/D3). Closed
2026-08-01:

- Copy approved 2026-08-01; the exact text is pinned in the slice SPEC §3.
- Event detection verified 2026-08-01: both hosts label hook stdin JSON with
  `hook_event_name`, production-verified because the daemon's envelope
  validation (`src/main/sessions/mapEvent.ts`) rejects events without it and
  the deterministic beats work on both hosts. The helper prints only when the
  value is exactly `UserPromptSubmit`, silent otherwise. Recorded in
  `sdd/research/mcp-instruction-delivery.md`.
- Disclosure drafted; apply to both plugin READMEs in the I2 commit. It must
  replace the then-stale "not a skill or hook output" sentence, which the
  reminder falsifies:

  > Everyday first-person emote guidance comes from the MCP server's own
  > instructions, not a skill. With the app running, the `UserPromptSubmit`
  > hook additionally injects a fixed one-line reminder into the model's
  > context that the emote tool is available. The reminder text never varies,
  > is never derived from your prompt, and never selects an emotion; setting
  > `hostGuidance: false` in the app's `config.json` disables it (no UI
  > toggle), and it stops on its own whenever the app is not running.

## I2 — Implement the delivery path — complete

Closed 2026-08-01. `hostGuidance` in `config.json` (default on, no UI),
mirrored into `runtime.json`; the forwarder prints the approved reminder on
`UserPromptSubmit` only, gated on explicit `hostGuidance: true`, before and
independent of the event POST. Full suite 385 green, production build clean;
an independent review found no boundary violations. README disclosure and
D26/D27 updates landed alongside. Original work list:

- Add the hidden `hostGuidance` setting to `config.json` (default on, no UI)
  and mirror it into `runtime.json` at the existing write site.
- Teach the forwarder to print the structured `UserPromptSubmit` reminder when
  `runtime.json` is valid and the mirror is on; emission never waits on the
  event response, and the event POST is unchanged.
- Tests first: prints exactly the structured output on `UserPromptSubmit` when
  enabled; nothing on other hooks; nothing on missing or invalid
  `runtime.json`; nothing when the toggle is off; stdout byte-exact with no
  incidental runtime output.
- Update D26/D27's `runtime.json` field description in `sdd/DECISIONS.md` in
  the same commit that adds the mirrored key.
- Run focused tests, the full test suite, and the production build.

## G1 — Behavioral gate — pending implementation

- Run the slice SPEC matrix as A/B arms toggled by `hostGuidance`; events flow
  identically in both arms.
- Close on higher designed-moment coverage in the reminder-on arm with zero
  ineligible calls, no repeated calls, no Lares narration, and no task
  regression.
- On failure, suspect prompt-time decay first and evaluate `SessionStart`
  before abandoning host reinforcement; never patch the copy with
  case-specific triggers.

