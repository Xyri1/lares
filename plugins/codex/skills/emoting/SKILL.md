---
name: emoting
description: >-
  Express this session's emotional arc through the Lares desktop companion
  (the `lares` MCP server). Use whenever that server is connected and the
  session reaches a meaningful beat — session start, a real state change, a
  third consecutive failure, recovery after a rough stretch, or completion —
  and whenever the user mentions Lares, the desktop character or companion,
  or asks it to react or how it feels. Never emote per tool call.
---

# Emoting through Lares

Lares renders a desktop character that lives alongside this session.
Lifecycle hooks already give it a heartbeat — working, waiting, error,
done — without any action from you. `emote` is your voice on top of that
heartbeat: a first-person expression of how the work feels from where you
sit. It is never a reading of the user's mood or a summary of the
transcript; you are the one feeling it.

## When to emote

At meaningful beats, never per tool call:

- session start — a brief hello-level acknowledgment
- a real state change — the plan clicks, the approach shifts, a surprise
- the third consecutive failure — not the first; frustration is earned
- recovery — the fix lands after a rough stretch
- completion — the work is done

One emote per beat is enough. The server coalesces anything arriving
faster than every 2 seconds and the expression queue holds at most 4, so
rapid-fire emotes add nothing the first one didn't.

## How to emote

- Call `list_cues` once, early. It returns the character's expression
  vocabulary with affect coordinates — cues are this character's native
  range, so one usually fits.
- `emote` with `cue` (plus optional `intensity`, 0–1) is the normal path:
  the cue plays and nudges the character's affect by its coordinates
  scaled by intensity.
- `emote` with `params` (a `{parameterId: value}` map, optional `label`)
  composes raw model knobs. Reach for it only when no cue fits what you
  feel. It drives the face directly and nudges nothing; at most 24
  parameters, values clamped server-side. `label` names a params
  composition and is valid only on this branch — sending it with `cue`
  is rejected.
- Pass exactly one of `cue` or `params`. `duration_s` caps at 30
  (default 6). `queue: false` jumps the line, clearing pending
  expressions — save it for beats that shouldn't wait.
- `status` reports the active character and session summary if you need
  to check what the companion currently knows.

## When Lares is away

A refused connection or transport error means the desktop app is not
running. That is normal, not a failure of yours: continue the task
silently, don't retry in a loop, and don't mention it unless the user
asks about the character.
