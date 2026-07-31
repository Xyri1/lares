# Slice 011 — Interjection · SPEC

**Artifact:** Slice SPEC · **Slice:** 011-interjection (post-M3a protocol
follow-up) · **Status:** Open · **Date:** 2026-07-31

**Why / gate.** M3a froze the emote protocol and D26 set the adoption
vector. Both are working as specified and both are underperforming for
the same reason, stated plainly in D26 itself: *emoting never helps the
agent finish*. Two consequences have since been measured rather than
assumed.

Both are grounded in research recorded under `sdd/research/`:
`mcp-instruction-delivery.md` (how `instructions` reaches an agent, and
why tool descriptions do not) and `reasoning-tokens.md` (the
interjection taxonomy, its frequencies, and the epistemic/valence
split). Both are version- and population-sensitive; each carries its own
limits section, and 011-D2's numbers rest on the weaker half.

First, adoption. Both harnesses now defer MCP tool definitions until
something searches for them — Claude Code loads only tool names and the
server `instructions` at session start, and Codex maps `instructions`
onto the tool namespace description. Tool search is relevance-driven, and
Lares is never relevant to a task, so no search ever fires on its own.
D26's "tool descriptions double as triggers" is therefore weaker than
written: the description is reachable by search, and no search comes.
`instructions` carries almost the whole load, and it currently spends
that budget on a five-milestone checklist delivered once, at connect,
expected to survive hours of task context.

Second, the checklist itself is wrong-shaped. Four of its five triggers
— session start, state change, third consecutive failure, completion —
are events the hook stream already reports. The one thing only the agent
holds is how an event landed, and the checklist never asks for it. That
is D01's rejected state machine, reintroduced at the instruction layer.

Slice 011 changes what the protocol accepts and what the instructions
ask for. It adds a third emote branch keyed on the reasoning
interjections agents already emit (*wait, hmm, aha, oh no*), maps them
through a fixed table to affect nudges, and rewrites the adoption copy
from a milestone checklist into a standing disposition that also pulls
the tools into context.

**Exit gate.** In a real harness session with no scripted prompting: the
agent calls `list_cues` unprompted at session start; at least one
`token` emote lands during ordinary work; the Lar's arousal moves
visibly on that token with no cue in the expression stack; caps and
saturation hold under a synthetic burst; and the hooks-only floor (D26)
still passes every §9 criterion with zero emotes. No tuning claim — the
table's numbers are defaults, and M2b owns them.

This slice refines root D09 and D26 and root SPEC §2 and §4. It does not
reopen the M3a wire contract for the existing `cue` and `params`
branches, and it does not touch slices 007–010.

---

## 1. Scope

**In:** an additive, optional `token` branch on `emote`; a fixed
reasoning-token nudge table under the affect constants; token
normalization and refusal at the ingress; rewritten MCP server
`instructions`; the rewritten shared plugin skill; a token-bearing
golden scenario and the scenario `EmoteEvent` field it needs; root SPEC
§2/§4 deltas; unit coverage for the table, saturation, and refusal.

**Out (fence):** reading, tailing, or inferring from any chain of
thought, transcript, or harness-owned file (P2/P11 — and moot: current
models never return raw reasoning tokens through the API at all); any
embedding model, similarity search, or local inference of any kind;
observer-LLM appraisal (D03); an open or agent-extensible token
vocabulary; a free-text `note`/`why` field on any branch; changes to the
`cue` or `params` branches; new render paths or body work; the D28
tuning ladder (M2b owns every number here); the D32 pull-only
calibration posture.

## 2. Protocol delta (root SPEC §2)

`emote(token?, cue?, params?, intensity?, duration_s?, queue?, label?)`
— exactly one of `token` | `cue` | `params`; zero or more than one is a
tool error. The existing two-branch text becomes three-branch.

**Token branch.** `token` is a string carrying a reasoning interjection
the agent just wrote. The server normalizes it (lowercase, strip
non-alphabetic characters, collapse whitespace), matches the full phrase
before falling back to the first word so `"oh no"` keeps its own
coordinates while `"Wait, wait"` still resolves to `wait`, and applies
the table nudge scaled by `intensity`. Unresolvable tokens are refused
with the accepted vocabulary in the error (011-D3). `label` is rejected
on this branch as it is on `cue`. `duration_s` and `queue` are validated
but inert, and their presence returns a warning.

The branch **nudges affect and enqueues nothing** (011-D1). It consumes
no queue depth, cannot preempt, and returns `status: "nudged"` — a third
value beside the existing `played` and `coalesced`.

**Caps.** The token branch adds no new cap. It carries no rate gate
(011-D4): §4 saturation and the affect clamp bound repeated tokens by
construction, which is the P7 obligation. The vocabulary itself is the
validation surface.

## 3. Affect delta (root SPEC §4)

**Division of labour.** Hook baseline transitions own **valence** —
they know a tool failed, a turn ended, input is wanted. Reasoning tokens
own **arousal** — they say how that landed. The measured interjection
vocabulary is almost entirely epistemic (doubt, arrest, correction) and
carries little valence of its own
(`sdd/research/reasoning-tokens.md`), so the two channels are close to
orthogonal, which is what a two-axis affect model wants. The same
`error` event under `hmm` and under `oh no` must read differently; that
is P8's history-dependence arriving on a second axis.

**Table.** `TOKEN_NUDGES: Readonly<Record<string, Vec2>>` lives beside
`BASELINE_NUDGES` in the affect constants and is character-independent
by construction (011-D2). Magnitudes scale inversely with how often a
token appears in reasoning traces, so a high-frequency `wait` stays
quieter than a rare `aha`. Every number is a tunable default, not
contract.

**Saturation.** Token nudges share the existing per-source saturation
machinery. Saturation keys are namespaced (`token:<token>`) so a
character cue that happens to be named `wait` never discounts the token
`wait`, or the reverse.

**Known limitation, accepted.** Because the branch enqueues nothing, a
token is visible *only* through §4's continuous mapping — breath, blink,
sway, and the valence/arousal trend curves in the character's
`performance` block. A character with a thin `performance` block will
show cue emotes and not token emotes. That is a real dependency on M2b
tuning that the `cue` branch does not have, and it is accepted rather
than fixed here: enqueueing tokens would make an ambient signal compete
with deliberate beats for a four-deep stack.

## 4. Adoption delta (root SPEC §2 / §6, D26)

`instructions` is rewritten from a milestone checklist into a standing
disposition, and gains a job it did not have: **pulling the tools into
context**. It must, within the 2KB the harness truncates at:

1. direct the agent to call `list_cues` once at session start, stating
   that the tools load on demand and nothing reaches the character until
   it does;
2. name the token channel and its vocabulary, with a density bound —
   the highest-frequency token appears in most reasoning traces, so
   "once or twice a turn" is explicit;
3. state the cue trigger as divergence from the event log, with the
   hooks-already-say-it counterexample;
4. keep the silent-on-refusal instruction.

D26's ordering is unchanged: `instructions` is primary, the skill is
reinforcement, and the hooks-only floor still carries the product with
zero emotes. Only the copy changes.

The shared plugin skill (one file, byte-identical in both plugins)
carries the same shape at length. Because plugins and the daemon version
independently, the skill stays defensive about the token branch
(011-D6).

## 5. Scenario and acceptance

`EmoteEvent` gains an optional `token` alongside `cue` so the player can
exercise the branch through the same ingress as real traffic. One golden
scenario carries tokens; `brutal-debugging-session` is the natural host
because the token axis is exactly what should separate its third failure
from its first.

**S11 — Token axis (new).** GIVEN the same `error` event WHEN it is
preceded by `hmm` in one recording and `oh no` in the other THEN the two
read measurably and visibly differently at default Lar size, with no
cue emote in either. Diagnostic, not launch-blocking: S1 remains the
P8/D28 gate.
