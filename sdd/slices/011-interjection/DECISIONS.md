# Slice 011 — Agent self-expression · DECISIONS

Design reset, 2026-07-31. This is intentionally the slice's only artifact. The
discarded SPEC, PLAN and decisions prematurely specified a fixed interjection
table and a third emote branch before establishing that either belonged in the
product. No implementation is approved by this record.

Research is consolidated in `sdd/research/reasoning-tokens.md`; harness
instruction delivery remains documented in
`sdd/research/mcp-instruction-delivery.md`.

---

**011-D1 — The callable emote interface is the first-person reporting seam.**
*Chosen:* Lares provides a means for an agent to express its own emotional or
epistemic appraisal; the agent deliberately emits the tool call and Lares
validates, applies history and renders it. The call is the complete ingress
signal. *Rejected:* Lares determining that an emotion occurred, whether by
transcript sentiment, an observer model, hooks, logs or renderer-side inference.
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

**011-D3 — Appraisal is semantic; interjections are examples, never protocol
keys.** *Chosen:* instruction copy describes meaningful changes in the agent's
own appraisal — discovery, uncertainty, concern, frustration, relief,
satisfaction — and applies regardless of response language. A call may happen
before, after or without *aha*, *wait*, or any translated equivalent.
*Rejected:* word matching; a multilingual interjection lexicon; a `token`
parameter or fixed token-to-affect table; nearest-neighbor lookup over raw token
embeddings; an external multilingual embedding model at ingress. *Rationale:*
equivalent meanings often align in contextual model representations, especially
in middle layers, but raw token embeddings and tokenization are not a portable
semantic interface. Let the generating model perform the multilingual mapping
it already knows. *Status:* decided by the maintainer.

**011-D4 — Test the existing cue interface before changing the wire contract.**
*Chosen:* the first experiment uses `emote(cue=...)` unchanged. It tests whether
a language-independent first-person disposition improves voluntary use; it
does not add a protocol branch. *Rejected now:* special control tokens, an
appraisal classifier, another model, or a new structured field before the
existing interface is shown inadequate. *Open fork:* if models reliably detect
their appraisal but cannot map it cleanly onto character-facing cue semantics,
a future decision may introduce an `appraisal` event above the cue mapping.
That fork is not approved here. *Status:* proposed.

**011-D5 — One semantic disposition, reinforced through available harness
channels.** *Chosen:* once a tool is surfaced, its description and argument
descriptions are self-contained about first-person, semantic, language-neutral
use. MCP server instructions carry proactive discovery and the standing
disposition where the client honors them; harness-native skills reinforce the
same behavior. *Rejected:* putting the only authoritative behavior in a
harness-specific skill; assuming optional server instructions reach every
model; using literal interjections to make deferred tool search relevant.
*Rationale:* delivery varies, so each adapter may strengthen adoption while the
tool interface stays one deep, vendor-neutral seam. *Status:* proposed pending
copy and live delivery evidence.

**011-D6 — Compatibility is behavioral, not merely transport-level.** *Chosen:*
Lares can claim the tool transport works when a harness exposes the interface,
but proactive emoting is supported only when the model also chooses to call it.
Exact mid-reasoning or token-adjacent timing is a bonus; the portable baseline
is a call at the model's first available tool-decision point. A combination
that never calls still receives the hooks-only baseline and is not repaired by
daemon-side inference. *Rejected:* promising identical timing or adoption
across arbitrary models and harnesses; violating P2 to manufacture that claim.
*Status:* decided by the maintainer.

**011-D7 — Multilingual behavioral evidence precedes another SPEC or PLAN.**
*Chosen:* A/B the existing instruction against a semantic disposition across
hidden-reasoning, visible-reasoning and ordinary models; supported harnesses;
multiple languages and scripts; code-switching; appraisal shifts without
interjections; and quoted-word negative cases. Record call precision, density,
cue choice, timing and task interference. *Rejected:* treating successful MCP
connection, English examples, exposed reasoning traces, or literature
frequencies as proof of voluntary self-expression. *Gate:* no implementation
SPEC or PLAN until the experiment shows which failure is real — discovery,
instruction following, semantic cue mapping, or harness timing. *Status:*
decided by the maintainer.
