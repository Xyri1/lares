---
name: calibrate-lar
description: >-
  Set up an imported Lares character by mapping its performances onto the
  six canonical cues (discovery, uncertainty, concern, frustration, relief,
  satisfaction) through the `lares` MCP server. Explicit setup workflow —
  run it only when the user asks to calibrate, map or finish setting up a
  Lar's expressions.
---

# Calibrate Lar

Requires the `lares` MCP server, which the Lares desktop app serves. Every
check and every write below goes through its tools. Never edit a character
manifest, an asset or any file directly, and never run a helper script:
the daemon is the only validator.

`map_cue` and `save_expression` persist immediately, so an interrupted run
resumes from stored state on reinvocation.

## 1. Check the ground

Call `status` first, before anything else.

- `protocol_version` is not `2` — tell the user to update the Lares desktop
  app, then stop. Do not guess at older tool names.
- No `active_character` — ask the user to select or import a character in
  Lares, then stop. Change nothing.
- `missing_cues` is empty — the character is already fully mapped. Report
  that and stop, unless the user explicitly asked to remap.
- Connection refused or transport error — the app is not running. Say so
  once and stop. No retries, no filesystem edits, no unrelated changes.

## 2. Inventory the performances

Call `list_performances` and sort what comes back into three groups:

- **clear** — the name states what it shows, in any language (`Smile`,
  `怒り`, `pleased-nod`)
- **ambiguous** — opaque, coded or numeric (`exp_03`, `f04`, `motion_b`)
- **non-emotive** — idle, physics, tap reactions, blinks

Non-emotive performances stay exactly as they are. Never delete or rename
anything.

## 3. Fill only the missing cues

`status.cue_mappings` holds this character's confirmed mappings. Keep them.
Work through `missing_cues` in the order given. Overwrite an existing
mapping only when the user explicitly asked to remap that cue.

`map_cue` rejects a performance whose `affect` is `null`, so give a clear
performance coordinates first with `update_expression({name, affect})`.
Judge the category, not the degree — never ask the user for a number:

| Reads as | valence (−1…1) | arousal (0…1) |
|---|---|---|
| bright, pleased | 0.6 | 0.5 |
| calm, warm, relieved | 0.4 | 0.25 |
| startled, alert | 0.2 | 0.85 |
| unsure, hesitant | −0.2 | 0.4 |
| tense, worried | −0.4 | 0.6 |
| angry, blocked | −0.6 | 0.8 |

Then `map_cue({cue, performance})`. Reuse one performance for several cues
when the character's range is sparse — that is expected, not a shortfall.

## 4. Ask only about what you cannot see

Before the first preview, tell the user to keep the Lar visible on screen.

For an ambiguous performance, call `preview_expression({performance})` and
ask the user what it visibly conveys. Wait for the answer before assigning
affect or mapping it. Never guess an opaque visual from its name.

A `kind: "motion"` performance plays once and does not loop. Warn the user
in the same message, immediately before you preview one, so they are
looking when it fires.

## 5. Author only as a last resort

If a cue has no suitable performance at all, use the existing authoring
path: `list_parameters`, compose values, `preview_expression({params})`,
and describe what you built. Call `save_expression({name, params, affect})`
only after the user accepts that preview. Then `map_cue` it like any other
performance.

## 6. Verify

Call `status` again. Report completion only when `missing_cues` is empty —
six of six, confirmed by the daemon, never inferred from the names you just
sent. If cues remain, name exactly which ones and what blocked each.
