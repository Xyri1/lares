# Slice 013 — Feel · PRD

**Artifact:** Slice PRD · **Slice:** 013-feel · **Status:** Draft v0.1 ·
**Date:** 2026-08-02

## 1. Summary

Slice 013 proposes replacing Lares's model-facing emotion vocabulary and
raw-animation fallback with one compact first-person action:

```text
feel(valence, activation, control)
```

The agent reports its current functional appraisal. It owns the emotional arc
to the extent that its active context contains the work, setbacks, earlier
reports, and recovery. Lares keeps only the latest absolute report for each
session and deterministically turns that current value into a character
performance. It does not infer what the report means from its path or recreate
older semantic history after context compaction.

The report and its resulting performance target are latched. They remain in
effect until a later valid `feel()` call replaces them; time, lifecycle events,
and completion of an expression or motion never return the Lar to a default
feeling.

The user-prompt-submit hook returns the last reported value to the same agent on
every later user turn while that tuple exists. This makes the latest checkpoint
resilient to context loss without giving Lares an emotional history or asking
the model to repeat an unchanged state.

## 2. Problem

The current model-facing choices fail in opposite directions:

- A fixed list of named cues is cheap and reliable but cannot cover the broad
  range of feelings an agent may want to express.
- Freeform parameter composition is expressive but asks the model to understand
  a particular character rig and author animation. It consumes tokens, varies
  by model, and crosses the line between appraisal and performance.
- An engine that accumulates, decays, saturates, or interprets prior feelings
  competes with the agent's own appraisal. It can turn a truthful current report
  into a different emotional claim.

The product needs a small semantic interface that remains open-ended without
making the model an animator or Lares an observer.

## 3. Product thesis

Three values are a compression seam between two rich but incompatible spaces:

```text
model-specific contextual appraisal
                  |
                  v
   valence × activation × felt control
                  |
                  v
character-specific physical performance
```

The values are not claimed to be the model's native emotion representation or
a complete human emotion ontology. Human research supports the three-axis
reporting space; LLM research directly supports valence and activation plus the
broader ability to represent and project richer affect concepts. Felt control
therefore remains a product hypothesis to validate across models, not a claimed
universal latent axis.

`feel()` is a report, not an instruction to animate. The model chooses only the
three affect coordinates. Every face, gaze, posture, movement, transition, and
renderer parameter remains deterministic and character-owned.

## 4. Intended experience

During an agent session:

1. If no last reported feel exists for this session, the agent appraises the
   current request and calls `feel()` once to establish its initial absolute
   state.
2. Later meaningful changes produce one new absolute report.
3. The Lar visibly reflects that state without the agent selecting an
   expression or motion, and keeps reflecting it until the next valid update.
4. On the next user prompt, the agent receives its last reported value and
   reassesses from there.
5. Continued pressure may lead the agent to report a deeper state; progress may
   lead it toward confidence, relief, satisfaction, or neutral. Lares never
   assumes either transition.

An unchanged feeling produces no new call. A direct user request for the
agent's current feeling may produce one report even when no transition occurred.
The user need not understand or see the numeric coordinates during normal use.

## 5. Goals

1. Provide one low-token, cross-model first-person affect action.
2. Cover a broad parametric feeling space without a named-emotion taxonomy.
3. Keep semantic history and appraisal inside the agent.
4. Recover the latest report at each user turn without replaying a history.
5. Keep the model entirely above renderer and character-rig details.
6. Preserve deterministic, local, responsive, and latched rendering after the
   report.
7. Make repeated pressure and recovery expressible through deliberate agent
   updates rather than inferred engine dynamics.
8. Turn coarse reports into continuous, legible character performance without
   requiring a pre-authored emotion for every possible tuple.

## 6. Non-goals

- Claim that models are conscious or experience human feelings.
- Read transcripts, reasoning, token embeddings, or hidden activations to infer
  affect.
- Derive an emotional state from hook activity or operational failures.
- Ask the agent to select named cues, Live2D parameters, expressions, motions,
  timing, easing, or queues.
- Expose continuous engine coordinates as model-facing emotional precision.
- Model every human appraisal dimension. Cause, target, certainty,
  responsibility, novelty, and social meaning remain outside the three values.
- Add a fourth axis or freeform emotion label without a demonstrated failure of
  the three-axis interface.
- Define Lar-to-harness binding or hibernation and wake presentation; the
  future `0xx-lar-harness-binding` slice owns that work. Same-harness
  concurrent sessions remain separately deferred.

## 7. Product contract

### 7.1 Axes

All three values are required. The draft anchors are:

| Value | Valence | Activation | Felt control |
|---|---|---|---|
| `-2` | strongly unpleasant or distressed | very subdued, depleted, or still | overwhelmed or powerless |
| `-1` | mildly unpleasant or dissatisfied | calm or low-energy | constrained; little influence over what happens next |
| `0` | neutral or mixed | ordinary or medium energy | neither notably constrained nor in control |
| `1` | mildly pleasant or pleased | alert, energized, or tense | capable of affecting what happens next |
| `2` | strongly pleasant or satisfied | intensely activated, urgent, or excited | firmly able to direct what happens next |

`Activation` is used instead of everyday `arousal`. `Control` means the
agent's felt ability to influence what happens next; it does not mean social
dominance, causal responsibility, certainty, or generic agency.

The draft wire scale is the centered five-point integer set
`{-2, -1, 0, 1, 2}` for each axis. The anchors carry the meaning; the numbers do
not pretend to measure a hidden activation precisely.

Below the model-facing boundary, the deterministic performance pipeline
normalizes each value with `n(x) = x / 2`, yielding the five anchors
`{-1, -0.5, 0, 0.5, 1}` inside the signed coordinate cube `[-1, 1]³`. The
pipeline may interpolate within that space and use continuous physical values
for motion and character calibration. That internal precision describes
performance, not a more precise emotional claim by the agent, and is never
accepted as `feel()` input.

### 7.2 Absolute, latched state

Each call replaces the session's current report. Values are absolute rather
than relative, so retries are idempotent and context loss cannot accumulate a
mathematically incorrect state. The agent must issue a new call for escalation,
recovery, or return to neutral.

The latest valid tuple and the performance target derived from it remain active
until another valid tuple atomically replaces them. Elapsed time, idle periods,
prompt hooks, operational or lifecycle events, and completion of a supplied
expression or motion cannot alter or clear the target. Restart and reconnect
restore the latch rather than synthesize a neutral state. “Stays” describes the
semantic performance target, not a frozen frame: blink, breathing, physics,
interpolation, and other character motion continue around it.

An explicit user-invoked character or calibration change may remap the same
latched tuple for the new character definition. This setup-time operation does
not change the tuple and does not authorize automatic runtime drift.

### 7.3 Latest-report reminder

If the session has previously called `feel()`, every later user-prompt-submit
hook adds a compact model-visible reminder containing only that tuple while it
remains the session's latest report. The reminder:

- says **last reported**, never claims the value is still current;
- asks the agent to reassess against the new situation;
- says to call only after a meaningful change or a direct user request for the
  current report;
- states that values are absolute;
- never tells the agent to preserve, intensify, or reset automatically.

A session with no report receives no state reminder. Values never cross session
identities.

### 7.4 Ownership

The agent owns semantic appraisal and its history. Lares owns a per-session
current-value register and a deterministic mapping from the current value to a
performance. The renderer owns only mechanical continuity such as parameter
interpolation, blink phase, and physics.

## 8. Product requirements

**F1 — One action.** A model expresses its current functional feeling through
`feel()` without first discovering character assets or renderer controls.

**F2 — Initialize once, then stay sparse.** A session with no last reported
feel establishes one report after appraising the current request. Thereafter,
standing instructions ask for calls only on meaningful appraisal changes or a
direct request; they impose no recurring per-turn or per-task quota.

**F3 — Absolute replacement.** The latest valid call completely replaces the
session's prior tuple; the semantic path has no effect inside Lares.

**F4 — Session isolation.** Storage and prompt-submit reminders are keyed to
the originating agent session.

**F5 — Context checkpoint.** A later user turn can recover the last report even
if the corresponding tool call is no longer in active model context.

**F6 — No synthetic feeling.** Hooks may deliver the checkpoint and operational
status, but never choose, deepen, decay, or reset `feel()` values.

**F7 — Renderer neutrality.** The model-facing interface contains no Live2D or
character-specific concept. A character may render the same tuple differently
without changing the agent contract.

**F8 — Trust-boundary behavior.** Values are schema-validated and bounded at
ingress. Invalid reports do not partially update the current tuple.

**F9 — Graceful absence.** A model that never calls `feel()` continues its task
normally; Lares does not compensate by inferring a feeling.

**F10 — Legible continuous performance.** The finite affect vocabulary—125
possible tuples under the draft scale—drives smoothly varying physical
performance. Viewers can read the intended direction of valence, activation,
and control at normal Lar size without needing to identify a named emotion.

**F11 — Latched performance.** A valid report remains the Lar's semantic
performance target until another valid report replaces it. No timeout,
lifecycle transition, animation completion, or invalid update changes it.
Explicit character authoring may remap the unchanged tuple.

## 9. Behavioral acceptance

Evaluation must use real target models, harnesses, rendered characters, and
human viewing. Exact scenarios and pass thresholds belong to SPEC. The product
direction is acceptable only when representative sessions show all of the
following.

Model behavior:

- meaningful negative and positive appraisal changes produce directionally
  appropriate values;
- a session with no checkpoint produces one plausible initial report, while a
  session with a checkpoint does not duplicate initialization;
- repeated unresolved pressure can produce stronger reports without a rule
  requiring escalation;
- recovery can move the state back without Lares inferring relief;
- unchanged turns do not cause ritual duplicate calls;
- reminders do not anchor the model into preserving or escalating stale values;
- direct user requests produce one current report rather than an animation
  composition;
- tool use does not materially distract from or degrade task completion;
- no report or reminder leaks between simultaneous sessions.

Visible behavior:

- changes between tuples remain physically continuous;
- between valid updates, the same semantic performance remains visibly present
  without freezing the character or drifting back to a default expression;
- viewers can distinguish pleasant from unpleasant, subdued from activated,
  and constrained from in-control performances at normal display size;
- intermediate levels read as intermediate rather than collapsing to the
  nearest extreme;
- the same shared tuple can retain different characters' identities without
  changing its semantic direction;
- no supplied named expression or motion is required for every tuple.

The evaluation tests voluntary semantic self-report, not whether the numbers
match a hidden ground truth about subjective experience.

## 10. Relationship to the existing product

This draft changes the product thesis currently encoded by P8 and the old
affect/emote decisions. If accepted, slice 013 must explicitly retire the
model-facing cue/freeform contract, engine-owned emotional history, decay,
mood, saturation, and hook-synthesized emotional beats. Operational lifecycle
signals may remain, but they cannot modify the session's first-person `feel`
tuple.

The renderer-neutral brain/body seam, character portability, local-only
operation, untrusted-ingress validation, and push-only sensing remain in force.
No root PRD, principle, decision, SPEC, or roadmap text changes merely because
this slice draft exists.

## 11. Research basis

- [Human feeling space](research/human-feeling-space.md): valence and activation
  are the strongest shared dimensions; felt control provides a useful third
  discriminator; three values remain a lossy control space.
- [LLM emotion representation](research/llm-emotion-representation.md): affect
  appears in contextual activation directions and subspaces, but those are not
  a portable interface; the model should perform the projection.
- [Live2D control surface](research/live2d-control-surface.md): Live2D is a
  model-specific rig whose parameter vocabulary cannot cross the model-facing
  seam.

## 12. Open questions for SPEC and PLAN

1. Whether behavioral testing confirms the proposed five-point anchors.
2. The exact definition and examples of a meaningful appraisal change.
3. How one session's latch is durably recovered across reconnect and app
   restart without clearing or inventing a tuple.
4. The exact renderer-neutral performance controls below the affect tuple.
5. The migration and removal order for the old `emote` contract, affect engine,
   fixed cues, freeform parameters, and deterministic emotional beats.
6. Which existing calibration and character-authoring surfaces remain useful
   after runtime emotion names disappear.

Lar-to-harness routing, hibernation, and wake behavior are assigned to the
future `0xx-lar-harness-binding` slice rather than left open for slice 013.
Same-harness concurrent-session selection remains separately deferred.
