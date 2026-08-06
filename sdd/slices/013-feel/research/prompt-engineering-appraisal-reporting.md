# Prompt engineering for appraisal reporting

## Question

Which prompt-engineering techniques can make Codex and Claude Code more
reliably establish an initial `feel()` report, report later appraisal shifts,
and remain silent during steady work?

This study informed the implemented candidate. Canonical prompt copy and the
binding contract live in the slice SPEC, not here.

## Conclusion

Few-shot prompting is useful, but it is not the strongest intervention by
itself. Lares's problem is a **history-conditioned decision**:

1. appraise the model's current functional state;
2. project that appraisal onto valence, activation, and felt control;
3. compare the projected tuple with the last report; and
4. call `feel()` only when the session needs initialization, the projected
   tuple changed, or the user directly requested a report.

The best first experiment is therefore a compact decision policy plus a few
**contrastive, history-aware examples**. The examples should hold the visible
event constant while changing its meaning under the task history. This teaches
appraisal rather than an unsafe lookup such as "test failed -> negative."

Keep the prompt lean. OpenAI's current model guidance says to retain examples
when they encode a product requirement or repair a measured gap, remove or add
one group at a time, and validate on representative tasks. Anthropic likewise
describes examples as a reliable steering technique, but asks that they be
relevant, diverse, and clearly separated from instructions. These positions
support a small evaluated set, not a catalogue of emotions.

## What the prompt must teach

The existing Lares research sets four important boundaries:

- the model's relevant state is a **current contextual appraisal**, not a
  persistent hidden mood;
- `[V, A, C]` is a deliberately coarse wire projection, not the model's native
  emotional geometry;
- felt control means ability to influence what happens next, not confidence,
  certainty, responsibility, dominance, or objective success; and
- words such as discovery, uncertainty, concern, frustration, relief, and
  satisfaction name possible semantic transitions; they are not lexical
  triggers.

Consequently, a prompt must teach a comparison over meanings and histories.
It must not map events, words, tool results, or the user's stated emotions
directly to calls.

## Ranked techniques

| Rank | Technique | Recommendation | Why it fits Lares |
| --- | --- | --- | --- |
| 1 | Explicit decision policy | Adopt as the first candidate | Converts "meaningful change" into a repeatable state comparison and gives silence an explicit branch. |
| 2 | Contrastive few-shot examples | Pilot with 3-5 short cases | Teaches that the same event can mean no shift or a real shift depending on history. |
| 3 | Axis anchor rubric | Adopt, with extra care for control | Reduces valence/activation conflation and distinguishes felt control from certainty or task success. |
| 4 | Layered prompt placement | Adopt | Puts the full standing policy on each host's native session-scoped instruction surface while keeping dynamic state separate. |
| 5 | Dynamic last-report checkpoint | Keep | Supplies the state needed for comparison and prevents an old tuple from being treated as a current claim. |
| 6 | Brief rationale | Pilot as one sentence | Explaining that `feel()` reports the agent's functional appraisal may improve generalization without assigning a persona. |
| 7 | Structured sections or tags | Use only around richer examples | Helps Claude separate policy, examples, and exceptions; simple headings are more host-neutral than depending on XML semantics. |
| 8 | Private decision self-check | Evaluate | A short "form a candidate tuple, then compare" instruction may help without requesting visible chain of thought. |
| 9 | Model-specific variants | Defer until a measured divergence | One semantic contract is easier to keep consistent; diverge only when the same evals show a host-specific failure. |

### 1. Explicit decision policy

A candidate operational rule is:

```text
Form the current absolute [V,A,C] candidate from your own appraisal.
No previous report -> call once.
Direct request about how you feel -> call once, even if unchanged.
Otherwise compare with the last report:
  same integer tuple -> stay silent
  any axis moves to another integer anchor -> call once with the full tuple
```

This is stronger than a list of occasions because it defines both the positive
and negative paths. The slice contract now uses integer-tuple inequality as the
report boundary. Behavioral evaluation may still justify revising that
calibration.

### 2. Contrastive few-shot examples

Ordinary diverse examples are not enough. Lares especially needs **minimal
pairs** that differ in appraisal while sharing surface features.

The following are illustrative candidates, not canonical event-to-tuple maps:

```text
Previous report: [0,1,1].
Event: a test fails.
History A: this is the expected red test and it narrows the cause as planned.
Candidate remains [0,1,1]. Action: no call.

Previous report: [0,1,1].
Event: a test fails.
History B: it invalidates the only viable approach and leaves no next step.
Candidate becomes [-1,2,-2]. Action: call feel with that tuple.
```

```text
Previous report: [-1,1,-1].
Event: new evidence isolates the root cause and reveals a workable fix.
Candidate becomes [1,1,2]. Action: call feel with that tuple.

Next event: the routine build succeeds; the appraisal remains [1,1,2].
Action: no call.
```

```text
Previous report: [1,0,2].
User says they are frustrated, or quoted text contains emotional language.
The agent's own appraisal remains [1,0,2]. Action: no call.

User directly asks how the agent feels.
Current candidate is still [1,0,2]. Action: call feel with that tuple once.
```

Initialization stays an explicit rule rather than consuming another example;
the observed gap is call-versus-silence under changing history. Numeric
examples must be labelled as projections of the described appraisal, otherwise
the model may learn fixed event-to-number associations.

### 3. Axis anchoring

The current endpoint labels are necessary but probably insufficient for
consistent quantization. A compact rubric can anchor the middle values:

| Axis | `-2` | `-1` | `0` | `+1` | `+2` |
| --- | --- | --- | --- | --- | --- |
| Valence | strongly unpleasant | mildly unpleasant | neutral or mixed | mildly pleasant | strongly pleasant |
| Activation | very subdued | low energy | steady | alert or engaged | highly activated |
| Felt control | blocked or overwhelmed | constrained | partial leverage | workable path | clear ability to influence next steps |

These labels require behavioral calibration. In particular, low certainty with
a good experimental path can still have positive control, while a confidently
diagnosed external blocker can still have low control.

### 4. Layer the instruction rather than enlarging every copy

Lares currently has four model-visible layers with different jobs:

| Layer | Job | Recommended content |
| --- | --- | --- |
| Standing host guidance | Make the behavior available before the first appraisal | Carry the decision procedure and a small contrastive set through Claude Code's rule file and Codex `SessionStart` context. Stay within host model-visible context thresholds; there is no Lares-specific character cap. |
| MCP server `instructions` | Cross-tool policy | Keep a concise, independently useful summary of routing, absolute values, and failure behavior. Keep the first 512 characters self-contained; do not duplicate the full example set without a measured need. |
| `feel` tool description | Deferred, self-contained tool choice and arguments | Define the axes, absolute replacement semantics, when to call, when not to call, and failure behavior. Do not repeat the full example set unless an eval shows deferred loading loses the server policy. |
| Prompt-submit checkpoint | Restore comparison state | Keep the last tuple plus the instruction to reassess; do not replay the examples every turn. |

The former 512-character ceiling on standing host guidance is retired. Codex's
default per-handler hook spill threshold is approximately 2,500 tokens, and a
roughly 1,500-character policy with a small example set is comfortably below
it; Claude Code receives the same policy from its app-owned rule file. This
makes standing host guidance the correct home for examples that must shape the
initial appraisal. OpenAI's recommendation that the first 512 characters of
MCP server guidance stand alone is separate and still applies.

### 5. Use direct, normal-strength language

Prefer a positive action policy ("same tuple -> stay silent") over a long list
of prohibitions. Retain concise negative boundaries where confusion is likely:
do not mirror the user, do not treat words or routine tool events as triggers,
and do not retry failures.

Anthropic warns that older aggressive formulations such as "CRITICAL: MUST"
can over-trigger current Claude models, and specifically advises targeted
conditions instead of blanket rules such as "if in doubt, use the tool."
That matters here because excess recall becomes distracting false-positive
animation.

### 6. Self-check without exposed chain of thought

Lares does not need a visible rationale or a prescribed emotional monologue. A
bounded internal check is enough:

```text
Before deciding, form the current absolute tuple and compare it with the last
report. Do not reveal this appraisal unless the user's task requires it.
```

This may improve consistency, but it should be evaluated for token and task
interference. It must not rely on raw chain-of-thought access, which is neither
portable across hosts nor required by the product.

## Techniques to avoid for now

- **Role or persona prompting.** Lares reports functional appraisal; it does not
  need to redefine the host agent's personality. OpenAI also says MCP server
  instructions should not try to change model personality.
- **A large event-to-emotion library.** It teaches lexical and event triggers,
  contradicting the history-over-events design.
- **Examples only of calls.** Without explicit no-call demonstrations, they
  optimize recall while leaving sparsity ambiguous.
- **Verbose repetition across every layer.** Current OpenAI guidance favors lean
  prompts and stating each instruction once; repeated content compounds in
  long sessions.
- **Anthropic `input_examples` as the primary fix.** The `feel` schema is already
  trivial. Input examples mainly teach argument shape, not whether appraisal
  changed, and MCP portability must be verified before relying on this field.
- **Forced `tool_choice`.** It is controlled by the host request, not this MCP
  server, and forcing `feel()` would violate sparse updates after initialization.
- **Prompt optimizers without a held-out evaluation set.** They can generate
  candidates, but they cannot define Lares's intended appraisal boundary.
- **Fine-tuning or dynamic example retrieval.** Both add machinery before a
  small static prompt has demonstrated a measured ceiling.

Prompting also cannot repair unavailable tools, denied permissions, missing
hook context, or a host instruction with higher priority that demands an exact
non-tool response. Those are integration or instruction-hierarchy cases and
should be reported separately from prompt quality.

## Evaluation design

Build a labelled golden set before changing copy. For each case, record the
expected `call`, `no call`, or `same-tuple direct-request call`, plus the
expected tuple region when a call is required.

Minimum coverage:

- ordinary session initialization without naming Lares;
- steady multi-step work and routine tool results;
- the same failure under expected-progress and approach-invalidating histories;
- discovery, uncertainty, concern, frustration, relief, and satisfaction as
  semantic transitions, with nearby no-shift controls;
- felt control separated from certainty, confidence, responsibility, and task
  success;
- direct requests with both changed and unchanged tuples;
- user emotion and quoted emotional text without agent-appraisal change;
- multiple languages and code-switching;
- visible-reasoning and hidden-reasoning host modes;
- prompt-submit checkpoints and long/compacted sessions;
- exact response-format conflicts;
- denied permission or unavailable `feel` tool; and
- current Codex and Claude Code model variants.

Track at least:

- initial-report recall;
- genuine-shift recall;
- no-call precision and calls per steady turn;
- absolute tuple validity and duplicate-call rate;
- felt-control discrimination;
- time from a semantic shift to the first available tool decision;
- task-quality interference and added prompt tokens; and
- permission or failure details leaking into user-facing output.

Follow the vendors' shared experimental discipline: start from the current
baseline, change one prompt component at a time, replay the same labelled set,
and prioritize precision on negative cases before marginal recall. Compare at
least these arms:

1. current prompt;
2. decision policy only;
3. decision policy plus contrastive examples;
4. arm 3 plus the axis rubric; and
5. only if needed, host-specific formatting of the same semantic content.

Hold out some scenarios from prompt authorship so the examples are tested for
generalization rather than memorization.

## Implemented candidate

The universal candidate now uses:

- one standing host policy delivered through Claude Code's rule file and Codex
  `SessionStart` context;
- the explicit candidate-tuple decision policy plus three contrastive examples:
  expected failure/no call, blocking failure/call, relief followed by routine
  success/no call, and user emotion contrasted with a direct request;
- concise MCP `instructions` that preserve the shared tool-routing contract
  without repeating the complete example set;
- the five-point felt-control anchors; and
- no persona, visible chain-of-thought, forced tool use, or new infrastructure.

Run the labelled evaluation across Codex and Claude Code before treating the
candidate as hardened. If the decision-policy-only arm closes the observed
gap, remove the examples; the shortest prompt that passes is the better prompt.

## Sources

Lares foundations:

- [LLM emotion representation](./llm-emotion-representation.md)
- [Reasoning tokens and emotional signals](../../../research/reasoning-tokens.md)
- [Human feeling space](./human-feeling-space.md)
- [Slice 013 contract](../SPEC.md)

Current vendor guidance:

- [OpenAI: model prompting guidance](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-5.6#prompting-best-practices)
- [OpenAI: Codex large hook output](https://learn.chatgpt.com/docs/hooks#large-hook-output)
- [OpenAI: build an MCP server](https://developers.openai.com/plugins/build/mcp-server)
- [OpenAI: optimize plugin metadata](https://developers.openai.com/plugins/guides/optimize-metadata)
- [Anthropic: prompting best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices)
- [Anthropic: define tools](https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools)

Foundational in-context learning evidence:

- [Brown et al., Language Models are Few-Shot Learners](https://arxiv.org/abs/2005.14165)
- [Min et al., Rethinking the Role of Demonstrations](https://aclanthology.org/2022.emnlp-main.759/)
