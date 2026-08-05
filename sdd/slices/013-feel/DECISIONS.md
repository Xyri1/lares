# Slice 013 — Feel · DECISIONS

**Artifact:** Slice DECISIONS · **Slice:** 013-feel ·
**Status:** Historical design draft; implemented contract lives in root
artifacts and slice SPEC · **Date:** 2026-08-03

These rows record the proposals that produced the implemented contract. Their
original proposal labels are preserved as design history; root DECISIONS and
SPEC now bind. D36 makes the behavioral matrix continuous assessment.

**013-D1 — One three-axis first-person feeling action.** *Draft choice:*
replace the model-facing cue/freeform emotion interface with
`feel(valence, activation, control)`. Valence runs unpleasant→pleasant;
activation runs subdued→energized; control runs overwhelmed→able to influence
what happens next. All three are required. The tool describes a functional
first-person appraisal and makes no claim about subjective experience. It is
the sole runtime action by which a model reports affect; character calibration
and authoring remain separate user-invoked work. *Rejected:* a fixed list of
emotion or appraisal names (bounded vocabulary and language/category
instability); natural-language emotion descriptions (require a second semantic
interpreter); raw renderer parameters, expression names, motions, duration, or
queues (make the model animate); hidden-activation access or transcript
classification (non-portable observer inference); a fourth novelty axis
without a demonstrated failure of three. *Rationale:* human research supports
valence, activation, and felt control as a compact reporting space, while LLM
research supports rich internal affect geometry but no portable latent
coordinates. The model performs the lossy projection once; Lares receives a
small stable wire representation. *Status:* proposed.

**013-D2 — Five coarse absolute levels per axis.** *Draft choice:* each axis
uses the integer set `{-2, -1, 0, 1, 2}` with semantic anchors from strongly
low through midpoint to strongly high. A `feel()` call supplies all three
values and replaces the tuple atomically. It never means “change the previous
value by this amount.” Immediately below that boundary, the deterministic
pipeline normalizes each coordinate with `n(x) = x / 2`, placing the five
anchors at `{-1, -0.5, 0, 0.5, 1}` inside `[-1, 1]³`. It may interpolate within
that internal space and use continuous physical values for motion and
calibration. Those values are not valid `feel()` inputs. *Rejected:* continuous
floats at the model-facing boundary (false emotional precision and weaker
cross-model calibration); verbose string enums (more tokens without more
semantic information); relative deltas (require Lares to remember and
accumulate history, make retries non-idempotent, and corrupt state after a
missed call); optional axes (ambiguous defaults). *Rationale:* a five-point
ordinal judgment is expressive enough to distinguish magnitude while remaining
cheap and easy to anchor. Internal normalization preserves conventional
signed-vector math and continuous animation without asking a stochastic
semantic reporter to distinguish values such as `0.58` and `0.63`. Absolute
replacement keeps the protocol robust under retry, reconnection, and context
compaction. *Status:* proposed; anchor wording must pass the slice's behavioral
evaluation before sealing.

**013-D3 — The agent owns emotional history; Lares keeps one current tuple.**
*Draft choice:* each agent session has at most one latest valid `feel` tuple.
The agent uses whatever work context and previous reports remain available to
decide escalation, recovery, persistence, and return to neutral. Lares restores
only the last tuple after older context is compacted; it does not reconstruct
the missing semantic history. Lares does not retain the tuple sequence or
compute emotional decay, mood, momentum, saturation, habituation, relief, or
trajectory meaning. Identical current tuples have identical semantic meaning
regardless of their path. Renderer interpolation, blink phase, physics, and
current parameter values are mechanical state and are not prohibited.
*Rejected:* engine-owned emotion/mood history (competes with first-person
appraisal); deriving relief or frustration from coordinate transitions; keeping
a hidden event ledger solely to vary the same report; literal zero persistence
after a call (would make the value last only one frame). *Rationale:* the agent
already has the causal context required for appraisal. Lares should render its
latest claim, not reinterpret that claim through a second emotional model.
Trajectory meaning stays expressible because the agent itself reports
intermediate states as a situation evolves; Lares never interprets the gap
between two reports. One level register is the minimum persistence needed to
display the report and recover it later. *Status:* proposed by explicit maintainer direction; requires
replacement of P8 and retirement of D07/D28's affect-memory thesis if accepted.

**013-D4 — Prompt-submit returns the last report to its originating agent.**
*Draft choice:* on every user prompt after a session has stored a tuple, the
plugin hook adds compact model-visible context containing only that tuple while
it remains the latest report.
The copy calls it the **last reported feeling**, asks the model to reassess from
there, allows a new `feel()` call only after meaningful change or a direct user
request for the current report, says values are absolute, and forbids ritual
repetition or automatic preservation/intensification.
No tuple means no reminder. The reminder is strictly session-keyed. *Rejected:*
“your current feeling is” (asserts that a stale report remains true); “go
deeper” as an unconditional instruction (runaway escalation); the entire
history (token cost and anchoring); fixed per-turn adoption copy (habituation);
a Lares-selected update (moves appraisal into the hook). *Rationale:* the hook
turns the one stored tuple into a context checkpoint. It repairs compaction and
keeps the arc model-owned while adding only a few dynamic tokens on turns where
a prior report exists. *Status:* proposed by explicit maintainer direction;
supersedes 012-D4's ban on per-turn injection only for this dynamic,
session-specific checkpoint. Session-start standing guidance remains a
different concern.

**013-D5 — Memoryless semantic mapping; renderer owns only physical execution.**
*Draft choice:* the semantic transformation is conceptually
`performanceTarget = f(currentFeel, character)`. It receives no earlier feel
tuple. Character-owned data defines how the shared axes become a
renderer-neutral performance target; the Live2D adapter translates that target
into the active rig and performs interpolation, procedural motion, physics, and
drawing. The agent never crosses this seam. *Rejected:* model-authored
animation; renderer-side emotion interpretation; universal hard-coded Live2D
parameter IDs; treating supplied expression or motion assets as the affect
space; feeding animation outcomes back into appraisal. *Rationale:* Live2D's
true control surface is a model-specific numeric rig. A small semantic
interface above a deterministic, character-specific mapping keeps the model
portable and the renderer replaceable while allowing a rich performance from
three cheap values. *Status:* proposed; exact performance target and mapping
belong to SPEC, and the PRD requires their output to make axis direction and
intermediate levels human-legible at normal Lar size.

**013-D6 — Retire synthetic emotion rather than layer `feel()` over it.**
*Draft choice:* `feel()` becomes the only source of first-person affect.
Existing lifecycle hooks may continue to report operational facts such as
working, awaiting input, and session end, but they do not choose affect values
or synthesize concern, frustration, relief, satisfaction, mood, or decay. The
old model-facing `emote(cue | params)` branches, fixed semantic cue vocabulary,
and cue-selection engine are removed rather than kept as parallel compatibility
paths. User-invoked character calibration may retain expression or motion asset
names and renderer controls because they are physical authoring material, not
runtime semantic cues. *Rejected:* layering `feel()` above the current affect
engine (two competing truths); keeping named cues as either a second
model-facing action or a hidden engine taxonomy; translating old cues into
hidden tuples indefinitely (migration becomes architecture); preserving D35's
failure-history emotional beats (Lares would still own part of the arc).
*Rationale:* one model-facing action and one source of semantic truth are the
smallest coherent system. Operational sensing and character assets can remain
useful without preserving a fixed emotion list or pretending that a failed tool
determines how the agent feels. *Status:* proposed; migration order belongs to
PLAN and root artifacts remain unchanged until acceptance. Maintainer
direction 2026-08-02: retirement proceeds without adoption de-risking at this
phase — no first-call nudges and no test-before-delete gate against `feel()`
silence.

**013-D7 — The reported performance is latched until replaced.** *Draft
choice:* a valid `feel()` call atomically replaces the session's tuple and its
derived semantic performance target. That target remains active until a later
valid `feel()` call replaces it during runtime for a fixed character
definition. Time passing, idle periods, prompt hooks, operational or lifecycle
events, session end, disconnect, app restart, and completion of a supplied
expression or motion do not clear it or return it to neutral; reconnect and
restart restore it. An invalid update leaves the prior latch intact. The
renderer continues blink, breathing, physics, interpolation, and procedural
motion around the target, so persistence does not freeze a frame. An explicit
user-invoked character or calibration change may recompute the performance
target from the unchanged tuple; this setup-time exception does not change the
reported feeling. *Rejected:* timeout or decay to neutral; visual age or
staleness cues on an awake session's latched performance; lifecycle-selected
expressions that replace the reported state; returning to a model's default
pose when an expression or motion finishes; requiring duplicate `feel()` calls
merely to keep the state visible. *Rationale:* absence of a new first-person
report is not evidence of an emotional change. Holding the last claim is the
only behavior that neither invents an appraisal nor burns tokens refreshing
it. *Status:* proposed by explicit maintainer direction; exact durable storage
belongs to slice 013 SPEC, while same-harness multi-session selection remains
separately deferred.

**013-D8 — Binding direction is fixed; its specification belongs to a future
`0xx` slice.** *Draft choice:* slice 013 changes the feeling contract without
adding harness or Lar identifiers to `feel()`. The deferred product direction
is to bind each Lar instance to one harness; a different harness requires a
different Lar instance. Lares launches every configured Lar
in a visually identifiable hibernation presentation and wakes the bound Lar on
its first valid invocation. Hibernation is operational presentation, not
`feel(0, 0, 0)`: it does not clear or replace a latched tuple, which becomes
visible again on wake unless the waking invocation validly replaces it.
*Rejected:* sharing one Lar instance across independent harnesses; letting the
agent select a Lar in each `feel()` call; launching only the most recently used
Lar; encoding hibernation as an inferred or synthetic feeling. *Rationale:*
exclusive binding prevents cross-harness state interference while keeping the
feeling action minimal. Deferring ownership and wake routing prevents slice 013
from mixing semantic protocol replacement with multi-Lar lifecycle work.
*Status:* proposed by explicit maintainer direction; binding identity,
invocation qualification, hibernation entry and re-entry, and storage of the
hibernation overlay belong to the future `0xx-lar-harness-binding` SPEC.
Durable `feel` storage remains a slice 013 concern. Same-harness concurrency
remains outside this decision. *Sequencing amended 2026-08-05:* authored
choreography takes slice 014; binding remains unnumbered until scheduled.

**013-D9 — Nine-anchor pose blend over renderer-neutral channels.** *Draft
choice:* the performance target is a vector of scalar channels in `[-1, 1]`
spanning five families — face, gaze/head, posture, movement energy, timing.
The mapping blends nine authored anchor poses: neutral at the cube center plus
the eight corners of `[-1, 1]³`. Corner weights are trilinear and evaluated at
the Chebyshev-projected direction `p/m`, and the neutral share is gated by the
Chebyshev magnitude `m = max(|v|, |a|, |c|)`, so a single axis at ±2 performs
at full strength and every ray from neutral ramps exactly linearly per channel
(the unprojected blend fails monotonicity and half-strength; caught by
numerical check 2026-08-02, before implementation). Every output is a convex combination of
authored poses, so no channel can leave authored range and no clamping layer
is needed. Lares ships default anchors in channel space; a character may
override any subset per anchor. The adapter wires channels to rig parameters
through per-character linear gain/offset entries and routes the dynamics
channels into the existing procedural idle writers, reusing the current
`performance` block shape. On target change the renderer eases every channel
with one fixed critically damped travel (`TRANSITION_MS ≈ 700 ms`, a
calibration constant); travel never depends on what changed or by how much.
Corner mnemonics — triumphant, giddy, serene, content, determined push, panic,
grim resolve, dejected — are authoring labels only and never cross the
model-facing boundary. *Rejected:* per-axis linear gains as the whole mapping
(cannot author axis interactions such as the opposite brow shapes of
`(-2, 2, 2)` anger and `(-2, 2, -2)` fear); a full 27-point anchor lattice
(authoring cost without demonstrated need); distance-weighted blends over
arbitrary anchor sets (unpredictable midpoints); Euclidean magnitude gating
(dilutes single-axis extremes toward neutral); endpoint- or history-shaped
travel (013-D3's trajectory ban). *Rationale:* whole authored poses make axis
interactions paintable rather than encoded in gain matrices; convex
interpolation makes intermediate levels read as intermediate (PRD F10) and
bounds every output; shipped defaults keep a new character's cost at wiring
channels to its rig. Formulas, the channel table, and a worked example live in
SPEC §§2–6. *Status:* proposed; channel names and anchor values are
calibration work, and the mapping must pass the slice's legibility acceptance
before sealing.

**013-D10 — Expressiveness multiplier: hidden config-file float
`[0, 10]`.** *Draft choice:* one scalar `expressiveness` `k`, float in
`[0, 10]`, default 1, a UI-less field in the app-config file (the 012-D2
`hostGuidance` pattern) — hand-editable on any install, packaged builds
included; validated and clamped into range at load, read at launch, never
exposed in runtime UI. Applied after the anchor
blend as `target' = neutral + k · (target − neutral)`, then clamped per
channel to `[-1, 1]`; the clamp binds only above 1, where the result can
leave the authored envelope. Below 1 it attenuates toward neutral with every
SPEC §4 property intact; above 1 it exaggerates until channels saturate
non-uniformly (useful headroom ends near 2–3 with shipped anchors). It never
scales operational overlay poses — `awaiting_input` stays loud at any `k`
(P10) — and a changed constant behaves as a calibration change under 013-D7:
latch untouched, target recomputed through the normal transition. *Rejected:*
a model-facing intensity argument on `feel()` (013-D2 forbids continuous
floats at the model-facing boundary, and tuple magnitude already encodes
intensity — two encodings of one claim); a user-facing dial (expression
legibility is a product guarantee, not a preference; maintainer scoped the
knob to development tuning); a per-character-only amplitude (already
expressible through wiring gains); an amplify-only `[1, 10]` floor (loses the
attenuation direction the same tuning sessions need). *Rationale:* a
calibration-phase amplitude experiment wants one knob that can push both
directions past the authored values without editing nine poses; keeping it
out of the UI keeps that power off the product surface while leaving it
reachable on an installed build. *Status:* proposed 2026-08-02 by maintainer
direction (config-file scope and range).

**013-D11 — Calibration workflow deferred; default wiring ships in-slice.**
*Draft choice:* slice 013 ships no calibration or authoring workflow. The
interim path for every calibratable surface — wiring for odd-named rigs,
anchor and operational-pose overrides — is hand-authored package JSON against
SPEC §13, checked with the surviving `list_parameters`/`preview_expression`
tools and the dev panel. A shipped default wiring (the successor of
`presets/default.json`: the same standard Cubism ids, re-sourced to channels)
applies to any package without a `performance` block, with ids absent from
the body inventory simply not binding, so standard-named imports perform the
shipped anchors with zero calibration. The interactive workflow — parameter
sweeps and match proposals from `cdi3` names/groups, exp3-inversion anchor
seeding, corner assignment, channel/tuple preview, package write tools, and
guidance — is a later slice with its own UX design (wizard vs conversation).
*Rejected:* building the workflow inside 013 (a real UX surface delaying the
migration for a convenience layer — calibration's only required judge is
human eyes on a preview, never the agent, which cannot see the render);
deferring the default wiring too (raw imports would regress from today's
default-preset fallback to a dead face). *Rationale:* the mechanical part
that gates import compatibility is a data file plus a load rule already
mirrored by today's preset fallback; the judgment part cannot be automated
past proposal anyway, so deferring its ergonomics costs capability to no one.
*Status:* proposed 2026-08-02 by maintainer direction ("defer").

## Applied supersession map

I6 applied the following changes to the root artifacts:

| Existing artifact | Slice 013 effect |
|---|---|
| P2 — First-person emotion | Preserved and strengthened |
| P4 / D06 — LLM appraises, never animates | Preserved and strengthened |
| P5 / P6 / D31 — portable character and performance seam | Preserved; feed shape will change in SPEC |
| P7 — untrusted ingress | Preserved; all three values remain validated and bounded |
| P8 — history over events | Replaced: emotional history belongs to the agent |
| P11 — push-only sensing | Preserved; the prompt hook pushes a checkpoint |
| D07 — two-timescale affect model | Retired |
| D09 — cue-first emote plus raw freeform | Retired; no fixed runtime cue taxonomy or freeform model input remains |
| D25 — expression sourcing and cue calibration | Physical asset sourcing/authoring preserved; runtime cue semantics retired |
| D26 / D34 — emote adoption and model-owned semantic action | Reframed around `feel()` |
| D28 — engine-history launch gate | Retired and replaced by model-behavior acceptance |
| D35 — deterministic emotional beats from hook history | Emotional synthesis retired; operational facts may remain |
| 012-D4 — session-only host guidance | Preserved for standing guidance; dynamic last-report checkpoint is per prompt |

## Deferred to later slice artifacts

- Lar-to-harness binding plus hibernation and wake presentation are owned by
  the future `0xx-lar-harness-binding` slice.
- Same-harness multi-session aggregation remains separately deferred.
- Presentation of disconnected, silent, or session-end operational status
  without altering the latch.
- Exact prompt-hook payloads and host-specific transport mechanics.
- Character anchor and wiring calibration values; the performance target
  shape itself is defined by 013-D9 and SPEC §§2–6.
- The interactive calibration/authoring workflow — wiring proposals, anchor
  seeding and corner assignment, channel/tuple preview, package write tools,
  guidance — is its own later slice (013-D11).
- Migration order and deletion list.
- Behavioral matrix, thresholds, and rollout gates.
