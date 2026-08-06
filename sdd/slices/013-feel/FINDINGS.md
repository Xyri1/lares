# Slice 013 — feel: working findings

**Status:** research only · **Date:** 2026-08-02

This file captures the current synthesis before slice drafting. It is not a
SPEC, decision record, implementation plan, or amendment to existing project
principles.

## Direction

Replace agent-authored animation with one compact first-person report:

```text
feel(valence, activation, control)
```

The three required values describe the agent's current functional appraisal:

| Axis | Low | High |
|---|---|---|
| Valence | unpleasant, dissatisfied | pleasant, satisfied |
| Activation | subdued, depleted, still | energized, tense, excited |
| Felt control | overwhelmed, blocked, powerless | capable, influential, in control |

Use `activation`, not everyday `arousal`, and define `control` as felt ability
to influence what happens next. Do not call it dominance, social power,
responsibility, agency, confidence, or certainty.

Three is the smallest space that currently holds. Valence and activation have
the strongest support in both human and LLM research. Felt control adds the
important distinction between such states as activated anger and activated
fear. A fourth novelty/unpredictability axis has human support but no
demonstrated product need. Named emotions would introduce a larger,
language-sensitive ontology.

Treat the values as coarse anchored judgments rather than precise measurements.
The exact wire scale remains open.

## Ownership

`feel()` is an absolute current-state report, not a delta and not an animation
command. The agent never names an expression, motion, duration, easing curve,
or renderer parameter.

The agent owns semantic history. It decides whether accumulating pressure means
a deeper feeling, whether a breakthrough means relief, and whether it has
returned toward neutral. Lares does not infer escalation, recovery,
habituation, saturation, or the meaning of a trajectory.

Lares retains only the latest tuple for each agent session. That value is a
level register, not an emotional history. A semantically memoryless performance
mapping consumes the current tuple and character definition. Mechanical
continuity—interpolation, blink phase, physics, and the current rendered
parameters—is renderer state, not appraisal memory.

This direction intentionally conflicts with current P8, **History over
events**. Any later slice decision must amend or replace P8 explicitly rather
than quietly implementing around it. P2, first-person emotion, and P4, the LLM
appraises but never animates, remain aligned.

## Prompt-submit feedback

The user-prompt-submit hook closes the loop without moving appraisal into
Lares. It injects the session's latest tuple into the agent's next-turn context:

```text
Agent --feel()--> latest session value --prompt-submit reminder--> Agent
                         |
                         +--> memoryless performance mapping
```

The reminder must call the tuple the **last report**, not the current feeling.
It should ask the agent to form the current absolute tuple, compare it with the
last report, and call `feel()` only when an integer differs or the user directly
asks. It must not tell the agent to preserve or intensify automatically; that
would create anchoring and runaway escalation.

A compact working form is:

```text
[Lares] Last report: valence=-1, activation=2, control=-2. This is comparison
state, not a current claim. Form your current absolute tuple. If it differs,
call feel once; if unchanged, stay silent unless the user directly asks how
you feel.
```

The hook carries only the three latest values. Stable instructions define the
axes elsewhere. A session with no prior `feel()` receives no reminder. Session
keying is mandatory so one agent cannot inherit another agent's report.

This reminder also restores the checkpoint when earlier tool calls have left
the active context. Context loss may reduce the agent's nuance, but absolute
values prevent mathematical state corruption.

## Interface and renderer seam

The working pipeline is:

```text
agent context and appraisal
          |
          v
feel(valence, activation, control)
          |
          v
Lares: current-state register + deterministic performance mapping
          |
          v
renderer adapter
          |
          v
Live2D model
```

Live2D is a model-specific scalar rig, not an emotion system. Parameters, part
opacity, expressions, motions, blinking, gaze, breath, lip sync, physics, and
pose all ultimately affect the same model. Renderer-specific parameter IDs do
not belong in `feel()`.

## Research reports

- `research/human-feeling-space.md` — human evidence for valence, activation,
  and felt control, plus the limits of three-dimensional affect.
- `research/llm-emotion-representation.md` — contextual activation geometry,
  causal affect directions and why three values are a wire format rather than
  the model's native representation.
- `research/live2d-control-surface.md` — the Cubism control layers and the
  actual Haru rig inventory.

## Questions deliberately left open

- The discrete or continuous value scale and anchors.
- Exact model instructions and behavioral compatibility gates.
- Prompt-submit delivery mechanics for each supported harness.
- Session lifecycle behavior when no further agent turn occurs.
- The character-owned translation from three axes to renderer-neutral
  performance controls.
- How the current fixed-cue and freeform contracts retire or coexist during
  migration.

These belong to later slice drafting. No implementation shape is implied yet.
