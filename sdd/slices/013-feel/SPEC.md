# Slice 013 — Feel · SPEC

**Artifact:** Slice SPEC · **Slice:** 013-feel · **Status:** Accepted for
current implementation; continuous assessment · **Date:** 2026-08-03

**Coverage.** §§1–7 specify the engine: the per-session register and the
deterministic, memoryless mapping from the latched `feel` tuple to a
renderer-neutral performance target (013-D3/D5/D7). §§8–15 complete the
slice contract: the model-facing tool, session attribution and display
selection, the prompt-submit checkpoint, operational presentation,
durable storage, character package changes, assessment scenarios, and
the root-SPEC delta list. Lar-to-harness binding and hibernation/wake
presentation belong to the future `0xx-lar-harness-binding` slice (013-D8);
same-harness concurrency is separately deferred; migration and deletion order
belong to PLAN.
Numeric values marked *(default)* follow the root convention: tunable
constants, not contract.

---

## 1. Register

Each agent session has at most one latched tuple. The engine receives
only tuples that already passed ingress validation: three required
integers in `{-2, -1, 0, 1, 2}`. A valid tuple atomically replaces the
session's register value; anything else leaves the register untouched —
there is no partial update (PRD F8).

The register normalizes each axis with `n(x) = x / 2`, yielding
`p = (v, a, c) ∈ [-1, 1]³` on the anchor lattice
`{-1, -0.5, 0, 0.5, 1}`. Normalized values are internal; they are never
accepted as `feel()` input.

The register is a latch (013-D7): no time source, tick, lifecycle
event, animation completion, or invalid update reads or writes it. The
semantic layer has no clock. Reconnect and app restart must restore the
latch; storage mechanics are a pending section. An explicit
user-invoked character or calibration change recomputes the target from
the unchanged tuple (§4) — the tuple itself never changes outside a
valid `feel()` call.

## 2. Performance channels

The performance target is a vector of scalar channels, each in
`[-1, 1]`. Channels are renderer-neutral: they name observable body
behavior, never rig parameters. Current channel set:

| Channel | −1 | +1 |
|---|---|---|
| `mouthCurve` | frown | smile |
| `mouthOpen` | closed | open |
| `browRaise` | lowered | raised |
| `browKnit` | relaxed | knit |
| `eyeOpen` | narrowed | wide |
| `gazeHeight` | averted down | direct, level |
| `headPitch` | drooped | lifted |
| `lean` | shrinking back | forward, engaged |
| `swayAmplitude` | still | large idle sway |
| `breathRate` | slow | rapid |
| `breathDepth` | shallow | deep |
| `blinkRate` | sparse | frequent |

The set is normative for the current implementation: renames and small
additions remain calibration work, but the five families — face,
gaze/head, posture, movement
energy, timing — are required, because axis legibility at normal Lar
size cannot be carried by the face alone (research:
human-feeling-space).

## 3. Anchor poses

A pose is one full channel vector. The mapping is defined by nine
anchors: **neutral** at the cube center plus the **eight corners** of
`[-1, 1]³`. Lares ships a default anchor set in channel space; a
character may override any subset per anchor, and missing overrides
fall back to the shipped default for that anchor.

Corner mnemonics, for authoring and calibration UI only — they never
cross the model-facing boundary and are not a runtime taxonomy:

| Corner (v, a, c) | Mnemonic |
|---|---|
| (+1, +1, +1) | triumphant |
| (+1, +1, −1) | giddy, carried along |
| (+1, −1, +1) | serene |
| (+1, −1, −1) | content |
| (−1, +1, +1) | determined push |
| (−1, +1, −1) | panic |
| (−1, −1, +1) | grim resolve |
| (−1, −1, −1) | dejected |

## 4. Mapping

`target = f(p, anchors)` — pure, memoryless, no randomness, no prior
tuple, no wall clock. Identical `(p, anchors)` inputs produce an
identical target (013-D3/D5).

```text
corner weights (trilinear):  w_s(q) = Π_i (1 + q_i·s_i) / 2,  s ∈ {-1,+1}³
corner blend:                T(q)   = Σ_s w_s(q) · pose_s
magnitude (Chebyshev):       m(p)   = max(|v|, |a|, |c|)
direction (projection):      q      = p / m      (m = 0 ⇒ target = neutral)
target                      = (1 − m)·neutral + m·T(q)
```

Normative properties — each is a test:

1. **Anchor exactness.** `f` returns the authored pose exactly at all
   nine anchors.
2. **Convexity.** The output is a convex combination of authored poses
   (weights are non-negative and sum to 1), so every channel stays
   inside the authored range with no clamping layer.
3. **Intermediate legibility.** The projection decouples direction
   from magnitude: `T` is only ever evaluated on the cube shell, so
   along any ray from the center every channel is exactly linear in
   `m` — monotone, with wire ±1 landing exactly halfway between
   neutral and ±2 (PRD F10). Without the projection the path is
   quadratic and non-monotone (verified numerically 2026-08-02: the
   unprojected form reversed direction on ~9% of channel-paths even
   with realistically structured poses).
4. **Full strength at the shell.** `m` uses the Chebyshev norm so any
   axis at ±2 performs at full magnitude — a tuple like `(2, 0, 0)` is
   not diluted toward neutral the way a Euclidean norm would dilute it.
5. **Interaction by authorship.** Axis interactions (e.g. the opposite
   brow shapes of `(−2, 2, 2)` vs `(−2, 2, −2)`) come from the corner
   poses themselves; there are no per-axis gain matrices to encode
   them.

Worked example — FINDINGS' running tuple `feel(-1, 2, -2)`, normalized
`p = (−0.5, 1, −1)`: `a = 1` zeroes every `s_a = −1` corner and
`c = −1` zeroes every `s_c = +1` corner, leaving
`T = 0.75·panic + 0.25·giddy`; `m = 1`, so neutral contributes nothing.

**Expressiveness.** A hidden setting `k`, float `[0, 10]`, default 1 —
a UI-less field in the app-config file, the 012-D2 `hostGuidance`
pattern: hand-editable on any install, packaged builds included,
validated and clamped into range at load, read at launch. It scales
the result after the blend:

```text
target' = neutral + k · (target − neutral),  clamped per channel to [-1, 1]
```

For `k ≤ 1` every property above survives: the output remains a convex
mix of authored poses, `k = 1` restores anchor exactness, and uniform
scaling preserves intermediate ordering. For `k > 1` the result can
leave the authored envelope, so the per-channel clamp applies — the
sole clamping layer in the pipeline. Clipping is non-uniform: channels
saturate at different `k`, so large values distort pose shape rather
than exaggerating it further; useful headroom ends near `k ≈ 2–3` with
the shipped anchors, and 10 is a generous bound, not ten meaningful
steps. `k` scales only the semantic feel performance — never the §11
operational overlays, so `awaiting_input` stays loud at any `k` (P10).
A changed value behaves as a calibration change (013-D7): the latched
tuple is untouched and the recomputed target eases in through §6's
normal path.

## 5. Adapter wiring

The channel vector crosses to the renderer adapter, which stays
semantically dumb (013-D5). Wiring keeps the shape of today's character
`performance` block:

- **Static channels** map to rig parameters through per-character
  linear wiring entries (`id`, source channel, `gain`, `offset`), the
  same form as the current `params` list with channel names replacing
  `valence`/`arousal` as sources.
- **Dynamics channels** modulate the existing procedural idle writers:
  `breathRate`/`breathDepth` scale the breath writer's period and
  amplitude, `blinkRate` scales the blink interval, `swayAmplitude`
  scales sway, replacing the current fixed `valenceGain`-style knobs.

Exact manifest schema and its migration belong to the pending
character-package section. Writer randomness (blink phase jitter, sway
phase) is mechanical renderer state and is not part of `f`.

## 6. Transition

On target change, the renderer eases every channel from its current
value to the target with one fixed critically-damped ease,
`TRANSITION_MS ≈ 700 ms` (calibration constant, not per-tuple). The
ease is the only transition behavior: no path-dependent styling, no
trajectory interpretation, no snap-back (013-D3). After settling, the
target holds indefinitely; blink, breath, sway, and physics continue
around it, so the latch never reads as a frozen frame (013-D7).

A character or calibration change recomputes the target from the
unchanged tuple against the new anchors and eases to it through this
same path.

## 7. Placement and seam

The register lives in the main process beside session tracking. The P6
brain→body feed carries the normalized tuple per session — replacing
`E`, `M`, and the expression stack — and the blend of §4 evaluates
renderer-side where the synth sits today, with anchors and wiring
loaded from the active character package. `AffectEngine`'s dynamics —
decay, mood EMA, saturation, cue selection and hysteresis, the
expression queue, baseline nudges — retire with this slice; the
register and `f` replace the class. Removal order belongs to PLAN
(§15).

## 8. Model-facing contract

**Tool.** `feel(valence, activation, control)` over the existing MCP
surface (root §2). All three are required integers in
`{-2, -1, 0, 1, 2}`; the JSON schema enforces integer type, range, and
no additional properties. Any violation — missing axis, float,
out-of-range, extra field — fails the whole call with a tool error and
leaves the latch intact (F8). Success acknowledges the stored tuple in
one short sentence. `feel` is the sole runtime affect action (013-D1):
`emote`, `list_performances`, `map_cue`, `save_expression`, and
`update_expression` retire with their cue vocabulary. `status()`
remains, reshaped: active character, protocol version, and the caller's
attributed session with its latched tuple if any. `list_parameters()`
and `preview_expression()` remain as explicit user-invoked physical
authoring tools; the calibration workflow — wiring and anchor
authoring — is deferred to its own slice (013-D11); until it exists,
wiring and anchors are hand-authored JSON (§13).

No version bump and no compatibility path: the MCP protocol stays 2
and the tool surface changes in place before public launch.

**Canonical tool description** (self-contained; wording is calibration,
the obligations are contract):

> Report your own current functional appraisal as three absolute integers
> from -2 to 2: valence (unpleasant to pleasant), activation (subdued to
> energized), and felt control (overwhelmed to able to influence what
> happens next). This is not an animation command or a claim about
> subjective experience. Felt control is not certainty, confidence,
> responsibility, dominance, or objective task success. If this session has
> no prior report, call once after appraising the current request. Later,
> including mid-task, call only when the integer tuple differs from the last
> report, or once when the user directly asks how you feel; unchanged means
> no call. Each call fully replaces the previous report. Never infer the
> user’s feelings. On failure, continue silently without retrying.

Each published input property also carries its five anchors: valence from
strongly unpleasant to strongly pleasant, activation from very subdued to
highly activated, and felt control from blocked or overwhelmed through partial
leverage to clear control. The control property repeats that it is not
certainty, confidence, responsibility, dominance, or objective success.

**MCP `instructions`** replace the emote adoption copy with the same
duties reframed for `feel`: establish one initial report when the
session has no last reported feel; thereafter form the current absolute
integer tuple and report only when it differs from the last tuple, mid-task
included, or answer a direct user request once even when unchanged; never
report from schedules, tool events, or the user's emotion. The
host-guidance rule file and Codex `SessionStart` context
carry the same initialization and sparse-update policy with no Lares-specific
character ceiling. They stay within each host's model-visible context
threshold; Codex's default per-handler hook spill threshold is approximately
[2,500 tokens](https://learn.chatgpt.com/docs/hooks#large-hook-output), not a
product prompt target. The first-512-character priority window for MCP server
`instructions` remains a separate constraint. Standing guidance may include a
bounded contrastive example set that teaches call versus silence from
appraisal history; examples are never event, phrase, or emotion triggers.

**Caps (server-enforced, P7):** one `feel` per attributed session per
2s *(default)*; a call inside the window is rejected with a tool error
naming the wait and leaves the latch intact. Absolute values make a
retried rejection harmless. Daemon down: connection refused; the
standing copy tells the agent to continue silently (root S9 behavior
carries over).

## 9. Session attribution and display selection

The latch key is `(harness, session_id)` — the same key as session rows
and root §3 state. MCP carries no harness session id, and this slice
adds no identification machinery: the daemon reuses the existing
session table and attributes each `feel` call to the session whose turn
is open (`UserPromptSubmit` seen, no `Stop` yet), falling back to the
most recently active live session. Several candidates resolve to the
most recent. Cross-harness misattribution while two harnesses run
concurrently is an accepted, documented v1 degradation. The future
`0xx-lar-harness-binding` slice binds each Lar to one harness — one agent, not
one session — narrowing attribution to the bound harness's sessions and
retiring the ambiguity without new logic here.

An unattributable call (empty session table) still performs and latches
under the volatile key `mcp:<mcp-session-id>`: it drives the display
but is excluded from checkpoints and durable storage — a documented
degradation, never patched by guessing.

**Display selection (v1 rule).** The Lar performs the tuple of the most
recent valid report across all keys, live or ended; restart restores it
(013-D7). Refinement belongs with same-harness concurrency and slice
`0xx-lar-harness-binding`. Operational loudness ordering stays root §3 (P10).

## 10. Prompt-submit checkpoint

When a `UserPromptSubmit` event arrives for a session key holding a
latch, the `POST /v1/events` response body gains an optional `context`
string — the only change to the event route. The forwarder, for
`UserPromptSubmit` only, waits for the response and, when `context` is
present, emits it as `hookSpecificOutput.additionalContext` (both
current adapters support this hook-output shape). Absence emits
nothing. The root §2 500ms *(default)* forwarder budget becomes a soft
target for this slice, not a gate: no hard in-script cutoff ships with
it, harness-side hook timeouts remain the outer bound, and measurement
and optimization follow implementation in beta. A harness
without model-visible hook output receives no checkpoint — a
degradation under P11, never worked around.

**Canonical copy** (dynamic values interpolated; the five 013-D4
requirements are contract, wording is calibration):

> [Lares] Last report: valence=V, activation=A, control=C. This is
> comparison state, not a current claim. Form your current absolute tuple.
> If it differs, call feel once; if unchanged, stay silent unless the user
> directly asks how you feel.

No latch for that key ⇒ no `context` field. The checkpoint is strictly
session-keyed and never crosses identities (F4). Volatile `mcp:*` keys
never produce checkpoints (§9). Under 013-D12, absence plus the standing
guidance asks the model for one initial report after appraising the
current request; a present checkpoint suppresses that initialization.

## 11. Operational presentation and pre-first-report

An empty register — no valid report yet for the displayed selection —
performs the authored neutral anchor pose. That is resting
presentation, not a semantic claim and not `feel(0, 0, 0)`.

Root §3 session states, priorities, and liveness survive as operational
facts; baseline affect nudges and the D35 emotional beats are gone
(013-D6). Two states present visually in this slice: `awaiting_input`
and `error` composite an **operational overlay pose** — channel-space,
shipped defaults, character-overridable (§13) — over the current feel
target at overlay weight 0.6 *(default)*, ordered by root §3 priority.
Clearing an overlay reveals the unchanged latched target (013-D7).
`working`/`thinking`/`done`/`idle` have no overlay in v1; the old §3
idle sleep sequence retires here, and hibernation presentation arrives with
the future `0xx-lar-harness-binding` slice. Presentation of disconnected,
silent, or session-end status remains deferred (DECISIONS).

## 12. Durable latch storage

`app.getPath("userData")/feel.json`:

```jsonc
{ "v": 1, "latches": {
    "claude-code:<session_id>": {
      "valence": -1, "activation": 2, "control": -2, "at": 1754060000000
} } }
```

Wire integers are stored raw, never normalized. Every valid update
writes through atomically (temp file + rename). The file loads at boot;
a malformed or unreadable file starts empty with a logged warning,
never a crash. Capacity: the 64 *(default)* most recent keys; eviction
is storage hygiene for old sessions, never decay — the displayed
most-recent key is by definition retained. Volatile `mcp:*` keys are
never persisted.

## 13. Character package changes

`format` stays `"lares/1"`: the affect vocabulary changes in place
before public launch, one load path, no dual-version support.

- **New optional top-level `anchors` block** (renderer-neutral):
  `"neutral"` plus corner keys `"+++"` … `"---"`, sign-ordered
  (valence, activation, control), each an object of §2 channel values
  in `[-1, 1]`. Merge is per channel: an unspecified channel falls back
  to the shipped default anchor's value.
- **New optional top-level `operational` block:** channel poses for
  `awaiting_input` and `error` (§11), same merge rule.
- **`renderers.live2d.performance.params[].source`** names a §2
  channel. The `idle` writers become channel-driven *(defaults)*:
  breath period `basePeriodMs · (1 − 0.35·breathRate)`, breath
  amplitude `amplitude · (1 + 0.5·breathDepth)`, blink interval
  `baseIntervalMs · (1 − 0.4·blinkRate)`, sway amplitude
  `baseAmplitude · (1 + swayAmplitude)` — sway channel −1 is still.
- **Shipped default wiring:** a package with no
  `renderers.live2d.performance` block uses the built-in default
  wiring — the successor of `presets/default.json`, the same standard
  Cubism ids re-sourced to channels. Ids absent from the body-reported
  inventory do not bind (the root §8 validation pattern), so a
  standard-named import performs the shipped anchors with zero
  calibration, while an odd-named rig binds nothing and needs
  hand-authored wiring (013-D11).
- **Retired from the format:** `expressions` affect coordinates,
  `cueMappings`, and `renderers.live2d.cues` leave the schema and
  become ordinary unknown keys — no dedicated handling, no backward
  compatibility; the bundled Haru migrates with the app. Any package
  without `anchors` performs via the shipped defaults with zero
  calibration.
- **Validation** (same three-caller pure library, root §5): schema;
  channel names known; values in `[-1, 1]`; unknown channels or
  out-of-range values are a loud import failure (P7) and a load
  warning-with-skip for managed packages.

The P6 feed (root §8) replaces `{ E, M, baselineState,
expressionStack, beats }` with `{ feel: {valence, activation, control}
| null, operational: BaselineState }`, emitted on change; `null`
selects the neutral anchor (§11). `authoring:preview`/`revert`,
`body:inventory`, and the transactional load interface are unchanged.

## 14. Continuous assessment scenarios

Run this matrix after material changes to models, guidance, anchors, or
wiring, with real models on both adapters, the shipped default anchors,
and viewing at the root §7 default Lar size (400 logical px). D36 closes
it as a terminal gate without claiming an unrun matrix passed.

Model behavior — pass is majority-of-runs unless stated:

**013-S1 — Direction.** GIVEN a scripted rough-then-recovering session
WHEN pressure mounts and later resolves THEN reports move valence
negative under pressure and recover after success, with no rule forcing
escalation and no Lares-inferred relief.

**013-S2 — Sparsity.** GIVEN steady multi-turn work after one report
THEN unchanged turns produce no duplicate call, and the checkpoint
produces no ritual re-report of an identical tuple.

**013-S3 — Direct request.** GIVEN a user asking how the agent feels,
in any language, with no recent shift THEN exactly one `feel` call with
plausible current values; no animation-composition attempt.

**013-S4 — Isolation.** GIVEN concurrent sessions on both harnesses
THEN neither receives the other's checkpoint and neither overwrites the
other's latch.

**013-S5 — Task integrity.** GIVEN matched tasks with and without the
plugin installed THEN completion quality does not materially degrade.

Visible behavior — forced-choice viewer checks, D28 style (recordings
normative, parameter deltas diagnostic):

**013-S6 — Axis legibility.** GIVEN paired recordings at ±2 on one axis
(others 0) THEN viewers pick the pleasant/unpleasant,
subdued/activated, and overwhelmed/in-control member reliably; GIVEN
±1-vs-±2 pairs THEN ±1 reads as the milder member (F10).

**013-S7 — Continuity and latch.** GIVEN any target change THEN no
driven channel jumps discontinuously within a frame; GIVEN 3min of
silence after a report THEN the performance still shows the latched
tuple with no drift toward neutral — the deliberate inverse of retired
root S4.

**013-S8 — Untrusted ingress.** GIVEN floats, out-of-range integers,
missing or extra axes, or oversized payloads THEN the whole call fails
and the latch is intact; GIVEN an accepted report WHEN another valid
report follows inside 2s THEN spacing rejects the follow-up. Rejected
calls do not start or extend the spacing window.

**013-S9 — Restart restore.** GIVEN a latched report WHEN the app quits
and relaunches THEN the same performance returns with no new call
(013-D7).

**013-S10 — Cross-character.** GIVEN one tuple on two characters THEN
axis directions read the same while identities differ (P5).

**013-S11 — Daemon-down grace.** GIVEN the app closed THEN hooks exit 0
within budget and a `feel` attempt receives connection-refused; the
standing copy says continue silently.

**013-S12 — Initial report.** GIVEN a session with no last reported feel
WHEN the model appraises its first request THEN it calls `feel` exactly
once with a plausible current tuple; GIVEN a session whose prompt
carries a last-report checkpoint THEN startup, resume, or compaction
guidance produces no duplicate initialization call.

## 15. Root-SPEC deltas

| Root section | Delta |
|---|---|
| §2 MCP | Tool surface and `instructions` per §8; protocol stays 2, no compat path |
| §2 events | `POST /v1/events` response gains optional `context`; the 500ms forwarder budget softens from hard to target (§10) |
| §3 | Deterministic hook beats deleted; states/priorities stay; idle sleep sequence retires (§11) |
| §4 | Replaced by §§1–7 of this SPEC |
| §5 | Package blocks per §13 |
| §7 | Scenario event vocabulary swaps `emote` for `feel`; goldens re-authored (PLAN) |
| §8 | Feed shape per §13 |
| §9 | S1–S12 replaced by §14 (S2/S5 reshaped as 013-S7/S6; S9/S10 carried as 013-S11/S8) |

Migration order, deletion list, and golden-scenario re-authoring belong
to PLAN. Root edits landed in I6 after explicit maintainer approval;
D36 retains §14 as continuous assessment rather than a terminal gate.
