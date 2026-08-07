# Slice 011 — Agent self-expression · DECISIONS

Design folded 2026-08-01. Research remains in
`sdd/research/reasoning-tokens.md` and
`sdd/research/mcp-instruction-delivery.md`. This slice now owns two related
changes: a canonical first-person cue vocabulary for everyday emoting and an
explicit agent workflow that maps an imported Lar onto that vocabulary.

---

**011-D1 — The callable emote interface is the first-person reporting seam.**
*Chosen:* Lares provides a means for an agent to express its own emotional or
epistemic appraisal; the agent deliberately emits the tool call and Lares
validates, applies history and renders it. The call is the complete ingress
signal for model-owned semantic appraisal. Deterministic hook beats may express
known operational history but never masquerade as this signal. *Rejected:*
Lares determining the model's appraisal from transcript sentiment, an observer
model, hook payload guesses, logs or renderer-side inference.
*Rationale:* this is the smallest interface shared by different models and
harnesses, and it preserves P2, P4 and P11. *Status:* decided by the maintainer.

**011-D2 — Private reasoning may inform the call; exposed reasoning may not
drive it.** *Chosen:* a model may use any private computation available to it
when deciding to call `emote`; Lares requires no access to that computation.
Models that expose chain of thought may permit better-timed optional adapters,
but the product must behave coherently without them. *Rejected:* reading,
tailing, requesting or classifying chain of thought as the portable trigger;
making visible reasoning a compatibility requirement; fine-tuning models as a
Lares dependency. *Rationale:* many target models hide or summarize reasoning,
and Lares must work across them without owning inference or training. *Status:*
decided by the maintainer.

**011-D3 — Appraisal is semantic; interjections are examples, never triggers.**
*Chosen:* instruction copy describes meaningful changes in the agent's own
appraisal and applies regardless of response language. A call may happen
before, after or without *aha*, *wait*, or any translated equivalent.
*Rejected:* word matching; a multilingual interjection lexicon; a `token`
parameter or token-to-affect table; nearest-neighbor lookup over raw token
embeddings; an external multilingual embedding model at ingress. *Rationale:*
equivalent meanings may align inside a model, but raw tokens and hidden states
are not a portable client interface. Let the generating model make the semantic
judgment it already knows how to make. *Status:* decided by the maintainer.

**011-D4 — Six appraisals are the canonical cue vocabulary.** *Chosen:* the
agent-facing `cue` values are exactly `discovery`, `uncertainty`, `concern`,
`frustration`, `relief` and `satisfaction` for this version. They mean,
respectively: new understanding clicks; ambiguity remains; a concrete risk is
recognized; repeated obstruction is felt; pressure resolves; success or
correctness is confirmed. The `emote` cue branch accepts only these stable
protocol symbols. Its existing `params` branch remains a low-level escape hatch
but is absent from ordinary emoting guidance. *Rejected:* treating the six as
mere prompt examples while the agent continues choosing artist asset names; an
open-ended emotion taxonomy in this slice. *Rationale:* a fixed semantic
interface is language-independent and lets the LLM appraise while Lares chooses
how the character performs it. *Status:* decided by the maintainer, 2026-08-01;
supersedes the earlier existing-cue experiment.

**011-D5 — Character packages map canonical cues to performances.** *Chosen:*
the manifest gains a renderer-neutral `cueMappings` block from canonical cue to
an existing character performance name. The current artist-named `expressions`
and renderer cue entries remain the performance inventory; they are available
to calibration and authoring, not everyday emote selection. More than one
canonical cue may map to the same performance. Raw Live2D imports begin with no
canonical mappings; authored Lares packages preserve valid mappings, but
filenames, directories, VTS hotkeys and metadata never assign them
automatically. *Rejected:* renaming or modifying artist assets;
runtime word or embedding inference over asset names; putting mappings in a
harness. *Rationale:* one small mapping separates semantic protocol identity,
character identity and renderer assets without replacing the working package
pipeline. *Status:* decided by the maintainer.

**011-D6 — Calibration is an explicit plugin skill named `calibrate-lar`.**
*Chosen:* the user starts the workflow as `/lares:calibrate-lar` in Claude Code
or as the **Calibrate Lar** skill in Codex (`$lares:calibrate-lar` when typed).
It is never implicitly invoked: Claude Code disables model invocation and Codex
sets `allow_implicit_invocation: false`. Both Lares plugins ship the workflow;
the old ambient `emoting` skill is deleted. *Rejected:* automatic calibration
after import; asking every ordinary session to inspect an uncalibrated model;
keeping a second ambient skill as reinforcement. *Rationale:* calibration is a
bounded, user-owned workflow, while everyday self-expression is standing MCP
guidance. *Status:* decided by the maintainer.

**011-D7 — Invocation authorizes an automatic, resumable mapping flow.**
*Chosen:* after explicit invocation, the agent inventories performances,
assigns obvious multilingual names without interviewing the user, previews and
asks only where visible meaning is ambiguous, authors a missing expression only
after the existing user-acceptance gate, maps all six canonical cues and
verifies completion. Progress persists per mapping; interruption is safe.
Multiple cues may reuse one performance. *Rejected:* making the user conduct
the tool sequence manually; guessing opaque visuals; requiring six distinct
assets. *Rationale:* the user chooses when setup runs, then the agent does all
work that does not genuinely require human eyesight. *Status:* decided by the
maintainer.

**011-D8 — The skill orchestrates; the daemon validates and writes.** *Chosen:*
the skill contains concise workflow instructions and calls Lares MCP tools.
Only the daemon validates performance names, calibrated affect, canonical keys,
mapping completeness and persistence. The skill never edits a managed manifest
or character asset directly and ships no helper script. *Rejected:* filesystem
instructions in the skill; harness-local calibration state; a script that
duplicates daemon validation. *Rationale:* one deep server interface gives both
harnesses identical behavior and preserves P7. *Status:* decided by the
maintainer.

**011-D9 — MCP instructions own everyday emoting; hooks remain heartbeat.**
*Chosen:* server instructions and self-contained tool metadata teach sparse,
first-person, multilingual use of the six canonical cues. The calibration
skill is the only skill. The reduced hook sets continue reporting deterministic
lifecycle state and may produce the internal history beats in 011-D16; they
inject no emoting or calibration instruction. *Rejected:*
SessionStart instruction injection; calibration invitations in hook output or
MCP initialization; per-turn injection; an ambient emoting skill. *Rationale:*
each mechanism has one job, with no duplicated instruction authority or stale
character readiness in session context. *Status:* decided by the maintainer;
supersedes the proposed hook bootstrap. *Superseded in part 2026-08-01 by
012-D1:* MCP remains the canonical contract, but supported plugin hooks may
reinforce that contract with concise model-visible host context after the
MCP-only path failed its first fresh voluntary-adoption check.

**011-D10 — Calibration is mandatory for canonical-cue playback, not import.**
*Chosen:* an imported character may be stored, selected and previewed while
incomplete so the skill can work on the active Lar. Until all six mappings point
to calibrated performances, `emote(cue=...)` fails closed with a stable
not-calibrated tool result and does not fall back to artist-name selection.
Readiness reports zero, partial or complete canonical mappings; completion is
six of six. *Rejected:* blocking import; silently guessing a raw performance;
maintaining calibrated and uncalibrated emote interfaces. *Rationale:* one
stable caller contract is worth a visible setup state, and hooks still provide
the baseline heartbeat meanwhile. *Status:* decided by the maintainer.

**011-D11 — Compatibility is behavioral and multilingual.** *Chosen:* verify
both supported harnesses with hidden- and visible-reasoning models, multiple
languages and scripts, code-switching, appraisal shifts without interjections,
quoted-word negatives, explicit-only calibration activation and daemon-down
behavior. Exact token-adjacent timing is a bonus; the portable baseline is a
call at the first available tool-decision point. *Rejected:* treating MCP
connection, English examples, exposed reasoning or skill discovery alone as
proof. *Status:* decided by the maintainer.

**011-D12 — Canonical resolution is an application adapter, not an affect-engine
concern.** *Chosen:* the MCP/application boundary validates that the active
character has all six mappings, resolves the canonical cue to a performance,
then calls Nerves through its existing performance-name interface. Nerves,
affect history, renderer playback and the scenario harness retain their current
performance vocabulary. The narrow exception is deterministic hook history:
`Nerves.ingest` selects one of the four approved canonical beats, then uses an
application-supplied resolver before entering the same performance-name affect
and presentation path. *Rejected:* exposing both vocabularies through Nerves' public emote/status
interface; rewriting frozen scenario cues or goldens. *Rationale:*
the adapter is the narrow seam where external semantic protocol meets portable
character identity, while Nerves already correctly owns performance dynamics.
*Status:* decided during implementation-readiness review, 2026-08-01.

**011-D13 — The breaking MCP change lands in place before public launch.**
*Chosen:* `status.protocol_version` becomes `2` and the MCP server advertises
`2.0.0`; `/v1/mcp`, the event envelope, runtime discovery file and additive
`lares/1` manifest format keep their current versions. Both plugins remain
`0.1.0`, and **Configure Agent Integrations…** verifies installation without a
pre-launch compatibility or upgrade path. *Rejected:* versioning or migrating
unpublished plugin contracts. *Rationale:*
the public `0.1.0` line has no backward-compatibility obligation. *Status:*
superseded before launch by 013-D1, 2026-08-02.

**011-D14 — Calibration has status, not a tray action.** *Chosen:* the tray
shows one disabled, read-only `Expression mapping n/6` status row (localized)
and no calibration button, checkbox or menu command. The row may name
**Calibrate Lar** but cannot invoke a harness. *Rejected:* retaining **Map
expressions…** as a second launch surface or disguised toggle. *Rationale:* the
explicit host skill is now the sole consent and invocation surface. *Status:*
decided by the maintainer, 2026-08-01.

**011-D15 — Explicit-only activation is a host contract, not daemon
attestation.** *Chosen:* host metadata prevents implicit skill activation; MCP
tool descriptions reserve mapping/authoring calls for the user-invoked
**Calibrate Lar** workflow; the daemon validates every requested mutation but
does not attempt to prove which prompt caused it. *Rejected:* a client-supplied
`confirmed` flag, secret token or duplicate daemon workflow state that would
only simulate user intent. *Rationale:* MCP carries calls, not trustworthy
prompt provenance. Behavioral acceptance therefore verifies that ordinary
sessions do not call calibration tools. *Status:* decided during
implementation-readiness review, 2026-08-01.

**011-D16 — Hook beats are deterministic, per-session and harness-originated.**
*Chosen:* both plugin manifests omit `SessionStart`, `SubagentStart` and
`SubagentStop`. Codex keeps `UserPromptSubmit`, `PreToolUse`, `PostToolUse`,
`PermissionRequest` and `Stop`; Claude Code additionally keeps
`PostToolUseFailure` and its permission-prompt `Notification`. Lares tracks
turn-scoped failure and success history by `(harness, session_id)`: first
failure immediately presents `concern` as the active error preemption, third
consecutive failure replaces it with one `frustration`, the
first later success gives `relief` and resets the streak, and `Stop` after a
successful tool-bearing turn with no unresolved failure gives `satisfaction`.
History resets at `UserPromptSubmit` and after `Stop`, and is discarded with a
`SessionEnd` or liveness reap; routine events remain baseline-only, and
permission stays `awaiting_input` rather than
`uncertainty`. Failure beats resolve through the existing mapping under a
harness-session source key, update affect at their first/third-failure
transitions, and replace error preemption without entering the queue. Recovery
and completion beats retain the existing queue, spacing and saturation path.
`awaiting_input` remains louder than concurrent errors; an incomplete mapping
preserves ordinary error preemption. These beats are neither MCP calls nor model
appraisals. Codex failure/recovery beats remain unavailable until its hook
surface supplies a trustworthy failure event. *Rejected:* fake MCP calls;
transcript inference; guessed Codex payload fields; a parallel animation path;
global history shared across sessions. *Rationale:* a deterministic heartbeat
can satisfy P8 from events the harness explicitly supplies without weakening
P2, P4 or P11. *Status:* decided by the maintainer, 2026-08-01.

**011-D17 — A direct request for current appraisal is eligible without a
transition.** *Chosen:* MCP initialization instructions and self-contained
`emote` metadata tell the agent to emit exactly one appropriate cue when the
user directly asks it to express its current appraisal, even if no appraisal
shift just occurred. Eligibility is semantic in every language and never based
on phrase or word matching; the cue still reports the agent's appraisal, never
the user's emotion. *Rejected:* treating direct requests as ineligible because
the state is steady; trigger phrase lists; mirroring user sentiment. *Rationale:*
the two live `How do you feel?` misses were an eligibility gap in guidance, not
a transport or cue-resolution failure. *Status:* decided by the maintainer,
2026-08-01.
