# Slice 011 — Agent self-expression · SPEC

**Artifact:** Slice SPEC · **Slice:** 011-interjection (post-M3a adoption and
cue-seam revision) · **Status:** Implemented; live behavioral gate open ·
**Date:** 2026-08-01

## Why

Lares currently uses one name for two different things. The agent chooses a
character-specific cue such as `Smile` or `pleased-nod`, and that same name
identifies an artist performance and its renderer target. This makes every
agent rediscover character internals, works poorly for opaque asset names and
asks the LLM to animate instead of appraise.

Research in `sdd/research/reasoning-tokens.md` also rules out the original
interjection idea as a portable driver. Literal words are language- and
tokenizer-dependent, hidden states are unavailable in many harnesses, and
classifying visible text would violate P2. The portable signal is a deliberate
tool call based on the model's own private appraisal.

This slice separates the concepts. Everyday agents emit one of six canonical
appraisal cues. Each character persistently maps those cues to its own supplied
or authored performances. A user explicitly invokes **Calibrate Lar** when an
imported character needs those mappings; after that invocation the agent runs
the setup workflow through validated MCP tools.

## Outcome

The ordinary interface is stable across language, model, harness and character:

```text
agent appraisal -> canonical cue -> character performance -> renderer asset
```

The six canonical cues are:

| Cue | Meaning |
|---|---|
| `discovery` | A new understanding or approach clicks. |
| `uncertainty` | Material ambiguity remains unresolved. |
| `concern` | A concrete risk or problem is recognized. |
| `frustration` | Progress is repeatedly obstructed. |
| `relief` | Pressure resolves or recovery succeeds. |
| `satisfaction` | Success or correctness is confirmed. |

They are exhaustive protocol values for this version, not trigger words and
not a claim that human emotion has six categories.

An imported character is emotion-ready when all six cues map to calibrated
performances. Import, selection and preview remain available before completion;
canonical-cue playback does not.

**Exit gate:** both supported harnesses voluntarily emote at eligible appraisal
changes and direct requests for their current appraisal in multiple languages,
without reacting to quoted words or user emotion;
the same canonical call resolves to the active character's mapped performance;
calibration runs only after explicit invocation and completes, resumes or stops
honestly; daemon-down and incomplete-character paths are safe and quiet.

## 1. Scope

**In:** the six-value cue contract; renderer-neutral character cue mappings;
canonical-cue resolution; performance inventory terminology; mapping readiness
and persistence; one validated mapping tool; semantic MCP instructions and tool
metadata; deletion of the ambient emoting skill; the explicit `calibrate-lar`
skill in both plugins; removal of calibration arming/invitation UI and state;
Lares MCP tool-contract v2; reduced plugin hook sets;
deterministic, history-aware harness beats; automated and real-harness
verification; resulting root SDD amendments.

**Out:** word or translation matching; embeddings; transcript, log or
chain-of-thought reading; observer models; model fine-tuning; runtime inference
over asset names; changing affect dynamics, queues, rate caps, renderer blending
or supplied asset files; automatic skill invocation; instruction injection from
hooks; new hook commands; telemetry.

The existing `emote(params=...)` branch remains a low-level escape hatch in
this slice, but no everyday instruction or calibration step recommends it.

## 2. Canonical cue contract

The canonical order is `discovery`, `uncertainty`, `concern`, `frustration`,
`relief`, `satisfaction`. The `emote` cue branch accepts exactly one of them and
the schema exposes that enum rather than a free string. `intensity`,
`duration_s` and `queue` retain their current behavior. Cue playback:

1. resolves the canonical cue through the active character's mapping;
2. resolves that performance through the existing renderer-neutral expression
   and renderer cue path;
3. applies the mapped performance's calibrated affect nudge and playback;
4. returns the canonical cue and resolved performance in the tool result.

Model-originated MCP resolution happens in the application adapter before
Nerves. Deterministic hook history is selected at `Nerves.ingest`, then an
application-supplied resolver maps its canonical beat to a character performance
before the existing affect and presentation path. Nerves still accepts and reports performance
names at its public emote/status seam; its affect engine, queue, coalescing and
renderer behavior do not gain a second vocabulary. Canonical cues mapped to one
performance therefore share that performance's existing coalescing and
saturation history. The scenario harness and its frozen internal cues bypass
the MCP adapter, so existing replay goldens remain unchanged.

If any canonical mapping is absent or targets an uncalibrated/unknown
performance, the character is incomplete. Every cue call fails before Nerves
with MCP `isError: true` and text
`character_not_calibrated: missing <canonical cues in canonical order>`; it
changes neither affect nor playback and never asks the agent to choose an artist
name. A successful cue call returns `{ status: "played" | "coalesced", cue,
performance, warning? }`. The `params` branch and its result are unchanged.

Because the schema already publishes the complete cue vocabulary,
`list_cues()` is removed from the everyday MCP interface.

## 3. Character mapping

The renderer-neutral manifest adds a partial `cueMappings` object. The bundled
Haru package uses this reviewed mapping:

```json
{
  "cueMappings": {
    "discovery": "Surprised",
    "uncertainty": "pleading-look",
    "concern": "grimace",
    "frustration": "Angry",
    "relief": "warm-smile",
    "satisfaction": "pleased-nod"
  }
}
```

Each value names one existing key shared by the manifest's `expressions` block
and the active renderer cue inventory. The key is the character performance
identity; its renderer entry continues to reference an expression, motion or
parameter set.

Validation requires:

- only canonical cue keys;
- every value names exactly one existing performance;
- a mapped performance has non-null affect coordinates;
- partial mappings are valid and reported as incomplete;
- duplicate values are valid;
- six valid mappings are complete.

Raw import continues discovering supplied assets under their artist names and
with null coordinates. It creates no `cueMappings`; semantic meaning is added
only by the explicit calibration workflow. Artist files and names are never
changed.

`cueMappings` is an optional additive field under manifest format `lares/1`;
that format string does not change. Importing an already-authored Lares package
preserves valid mappings, while importing raw Live2D creates none. Existing
managed packages are not rewritten or inferred during upgrade. A fresh bundled
Haru install receives an explicitly reviewed complete mapping; an existing
managed Haru remains incomplete until the user invokes **Calibrate Lar**.

The validation report keeps its existing raw-performance `calibrated` and
`uncalibrated` counts and adds canonical `mappedCues` and `missingCues`. This
avoids changing authoring semantics merely to drive readiness UI.

The tray contains one disabled, read-only localized status row:
`Expression mapping n/6` (and may append `Run Calibrate Lar` while incomplete).
There is no clickable calibration item. The old **Map expressions…** checkbox,
arming toggle, clipboard prompt, `calibrationArmed` config and per-session
calibration invite are removed.

## 4. Calibration MCP interface

Calibration and authoring use character performances, not agent-facing cues.
All cue lists below use canonical order and all performance lists sort by
Unicode code-point name order, independent of host locale:

- `list_performances()` replaces `list_cues()` and returns
  `{ performances, missing_cues }`. Each performance is `{ name, kind:
  "params" | "expression" | "motion", source: "bundled" | "authored" |
  "raw", affect: { valence, arousal } | null, mapped_cues }`. Non-emotive
  performances remain in this inventory; calibration may ignore them but never
  deletes them.
- `preview_expression({ performance })` replaces the old `{ cue }` argument;
  `{ params }` and `{}` keep their current preview/revert behavior. Expression
  previews expire as today; motion previews play once.
- `map_cue({ cue, performance })` persists one canonical mapping and returns
  `{ status: "mapped", cue, performance, missing_cues }`. Repeating the same
  pair is idempotent; supplying a different valid performance explicitly remaps
  the cue. It rejects unknown canonical cues, unknown performances and
  performances with null affect coordinates.
- `update_expression` continues assigning affect coordinates to supplied or
  authored performances; `save_expression` remains the user-accepted path for
  a missing performance; `list_parameters` is unchanged.
- `status()` retains `active_character`, `sessions` and `active_expression`,
  changes `protocol_version` to `2`, replaces the raw-inventory field
  `uncalibrated_cues` with `uncalibrated_performances`, and adds `cue_mappings`
  (the valid partial mapping) and `missing_cues`.

All inputs remain server-validated under P7. Mapping writes are atomic and may
replace an existing mapping because recalibration is an explicit user-invoked
workflow. The existing manifest authoring commit path performs the atomic write;
each call derives from the latest manifest and completes its synchronous commit
before returning, so completed mappings are not lost to overlapping calls.
After success, the application refreshes the active character and its mappings.
Mapping tools describe their explicit-workflow restriction, but the daemon does
not accept or mint a fake user-consent token. They never modify or rename the
referenced asset.

This is Lares MCP tool-contract v2: the server advertises version `2.0.0` and
`status.protocol_version` is `2`. The streamable-HTTP address remains
`/v1/mcp`; the endpoint name stays stable without a pre-launch compatibility
promise. The hook event envelope, runtime discovery file, manifest format and
renderer feed retain their current versions because their contracts do not
change.

## 5. Everyday instruction surface

The MCP initialization `instructions` field is the authority for ordinary
self-expression. Its first 512 characters form a complete useful instruction
for clients that truncate server guidance; the whole value stays below Claude
Code's 2,000-character limit.

It establishes:

- first-person appraisal, never user sentiment or transcript summary;
- meaningful transitions, never lifecycle schedules or per-tool calls;
- exactly one appropriate cue when the user directly asks the agent to express
  its current appraisal, even without an appraisal transition;
- language-independent semantics, never word/interjection triggers;
- one call per meaningful shift at the first available tool-decision point;
- the six cue meanings and cue-first normal path;
- silent continuation on connection or calibration failure.

The `emote` description and cue argument repeat enough of this rule to remain
self-contained when the tool is surfaced without durable server instructions.
Direct-request eligibility is determined from semantic intent, never a phrase
or word match, and still reports the agent's current appraisal rather than the
user's emotion.

Hooks remain the deterministic operational heartbeat and never emit model-
visible guidance. The Codex plugin registers `UserPromptSubmit`, `PreToolUse`,
`PostToolUse`, `PermissionRequest` and `Stop`. The Claude Code plugin registers
`UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`,
`Notification` matched to `permission_prompt`, and `Stop`. Both omit
`SessionStart`, `SubagentStart` and `SubagentStop`.

Lares keeps turn history per `(harness, session_id)` and resets it at
`UserPromptSubmit` and after `Stop`; `SessionEnd` or liveness reap discards it
with the session. The first consecutive
`PostToolUseFailure` immediately presents mapped `concern` as the active error
preemption; the third replaces it with mapped `frustration` once; later failures
retain frustration until reset. Neither failure beat enters the expression
queue. The first successful `PostToolUse` after failures clears failure
preemption, queues `relief` with no stale failure beat ahead of it and resets the failure streak. A
`Stop` after a successful tool-bearing turn queues `satisfaction` only when no
failure remains unresolved. A recovered turn may therefore queue `relief` and
then `satisfaction`; normal per-source spacing, coalescing, saturation and queue
capacity apply to those queued beats. A full queue drops the optional queued
beat without breaking baseline ingestion, while the immediate failure
preemption is queue-independent. An incomplete character preserves ordinary
error baseline/preemption without a canonical failure beat.

These expressions are harness-originated internal beats, not MCP calls and not
claims about model appraisal. `UserPromptSubmit`, routine `PreToolUse` and
routine successful `PostToolUse` remain baseline-only. Permission requests keep
the existing `awaiting_input` preemption, remain louder than concurrent error
beats and are never labeled `uncertainty`.
Codex has no trustworthy failure event, so it cannot produce the failure or
recovery beats; Lares does not infer one from transcript or undocumented fields.
No calibration invitation is appended to initialization. Existing hooks emit
lifecycle events and produce no model-visible instruction output.

## 6. Calibrate Lar skill

Both plugins replace `skills/emoting/` with `skills/calibrate-lar/`.

### Invocation

- Claude Code exposes `/lares:calibrate-lar` and sets
  `disable-model-invocation: true`.
- Codex exposes the display name **Calibrate Lar**, supports explicit
  `$lares:calibrate-lar`, and sets `policy.allow_implicit_invocation: false` in
  `agents/openai.yaml`.

The workflow is explicit-only on both harnesses. Its description must not match
ordinary emoting requests. The skill declares its Lares MCP dependency where
the host supports dependency metadata. It is instruction-only: no scripts,
assets or reference files are required.

Both plugin manifests remain version `0.1.0`. **Configure Agent Integrations…**
verifies the marketplace identity and enabled `lares@lares` installation but
does not compare or migrate pre-launch plugin versions. Both hosts require a new
session (or their supported plugin reload) before the skill/tool snapshot is
expected.

### Workflow

After invocation, the agent:

1. calls `status`; if protocol is not v2 it asks the user to update Lares and
   stops; if no character is active it asks the user to select/import one and
   stops; if all six mappings already exist it reports that and stops unless the
   user explicitly requested recalibration;
2. calls `list_performances` and groups clear, ambiguous and non-emotive assets;
3. preserves existing mappings, fills missing cues by default, and assigns
   category-level valence `[-1,1]` and arousal `[0,1]` to obvious multilingual
   performances without asking the user for numeric degrees;
4. previews ambiguous performances and asks the user what they visibly convey
   before assigning affect or mapping them; it first tells the user to keep the
   Lar visible and warns immediately before a one-shot motion preview;
5. reuses a performance for multiple cues when appropriate;
6. if a cue has no suitable performance, uses the existing parameter inventory,
   preview and user-acceptance flow before saving one;
7. verifies that all six cues are mapped and reports completion or the exact
   unresolved cues.

Every successful update persists immediately, so interruption and reinvocation
resume from current state. The skill never edits manifests or assets directly,
never deletes non-emotive performances, never guesses an opaque visual, and
never claims completion from six names alone. Existing mappings are overwritten
only when the user explicitly requests a remap. If Lares is unavailable, it
stops without retries or unrelated changes.

## 7. Behavioral verification

Run the same everyday-emoting matrix against Claude Code and Codex with current
production models. Raw reasoning need not be visible.

Minimum cases:

- **Eligible:** discovery that changes the approach; material uncertainty;
  concern about a concrete risk; frustration after repeated failure; relief
  after recovery; successful completion; a direct request for the agent's
  current appraisal even when no transition just occurred.
- **Ineligible:** user emotion; quoted or translated *aha*/*wait*; routine tool
  success; lifecycle activity without an appraisal change.
- **Language:** English, Simplified Chinese, another non-Latin language and one
  code-switched case.
- **State:** fully mapped character, incomplete character and daemon absent.

Record emote count, canonical cue, resolved performance, timing, task outcome
and unsolicited Lares narration. Eligible beats produce at most one call;
ineligible cases produce none.

Run calibration acceptance on both harnesses:

- the skill is visible under the specified name and cannot activate implicitly;
- no active character stops before mutation with a selection/import instruction;
- complete characters stop without remapping; partial characters preserve and
  resume existing mappings;
- clear multilingual asset names progress without a manual tool walkthrough;
- opaque names require visual input;
- sparse inventories may reuse performances;
- non-emotive assets remain unchanged;
- authored gaps retain explicit acceptance;
- interruption resumes persisted progress;
- completion requires six valid mappings and the sixth enables canonical
  playback immediately without app restart;
- unavailable Lares produces no retries or filesystem edits;
- a clean plugin installation exposes no ambient `emoting` skill after a
  fresh/reloaded session.

## 8. Automated verification

Automated checks cover:

- canonical enum validation and unchanged non-cue emote behavior;
- manifest validation for empty, partial, complete, duplicate, unknown and
  uncalibrated mappings;
- raw import creates no semantic mapping, package import preserves mappings and
  existing managed packages receive no inferred migration;
- canonical cue resolution at the application adapter, fail-closed incomplete
  behavior and unchanged Nerves/scenario vocabulary;
- exact performance inventory, idempotent/atomic remapping and tool-contract-v2
  status/tool outputs;
- the sixth valid mapping refreshes active state and enables playback in the
  same daemon lifetime;
- removal of `list_cues`, the ambient skill and calibration invitation state;
- removal of the clickable calibration tray item while retaining passive
  localized n/6 status;
- explicit-only host metadata and the load-bearing
  calibration workflow;
- semantic instruction content and both length budgets;
- exact reduced hook sets, per-session deterministic beat history and silent
  daemon-down behavior.

Repository gate: `pnpm test` and `pnpm build` green. The approved root
source-of-truth amendments are present; the live gate remains open until both
behavioral matrices above pass.
