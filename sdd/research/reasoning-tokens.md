# Reasoning interjections and model-owned emote actions

Research for slice 011 (`sdd/slices/011-interjection/`), revised
2026-07-31. This replaces the earlier fixed-token-table conclusion.

## Conclusion

Reasoning interjections such as *wait* and *aha* are evidence that some
models externalize changes in epistemic state. They are not a portable
emotion interface. Lares should condition the agent to report its own
meaningful appraisal shifts through the existing emote tool; it should not
observe, match, embed, or translate the words the model happens to emit.

The distinction is causal: the model's private computation may cause a tool
call even when the harness never exposes that computation. Lares depends only
on the deliberate call that crosses its ingress.

## What the reasoning-token literature establishes

DeepSeek-R1 reports an emergent "aha moment" in one reinforcement-learning
trajectory. This is an example of reflection behavior, not evidence of emotion
or a stable protocol
([DeepSeek-R1](https://arxiv.org/abs/2501.12948)).

The s1 paper extends test-time reasoning by suppressing the end-of-thinking
token and appending the literal string *Wait*. In that model and decoding
setup, the injected text can cause continued checking. It does not establish
that *Wait* has the same causal role across models or languages
([s1: Simple test-time scaling](https://arxiv.org/abs/2501.19393)).

*Understanding Reasoning in LLMs through Strategic Information Allocation
under Uncertainty* calls these markers **epistemic verbalizations**: surface
manifestations of uncertain or shifting internal computation that can become
conditionable tokens. Its appendix explicitly discusses using them as dispatch
signals toward tool calls
([paper](https://arxiv.org/abs/2603.15500)). This supports teaching the model an
appraisal-to-action association. It does not support a downstream lexical
detector.

The earlier version of this note attributed the reported *wait* 73.0%, *maybe*
32.9%, and related frequency table to *Do Thinking Tokens Help or Trap?* The
table belongs to the strategic-information-allocation paper above. In either
case the figures describe sampled reasoning traces from a particular research
population, not the hidden reasoning of the production models Lares watches.
They cannot justify a product vocabulary or affect magnitudes.

## The multilingual correction

"Equivalent words are close in vector space" combines three different things:

1. **Raw vocabulary embeddings are not a dependable multilingual lookup.** A
   meaning may span different subword sequences, scripts and token counts, and
   equivalent vocabulary rows are not guaranteed to be neighbors. Contextual
   representations also differ substantially from static token embeddings
   ([Ethayarajh 2019](https://arxiv.org/abs/1909.00512)).
2. **Contextual hidden states often align by meaning across languages.** Current
   multilingual-model studies find the strongest cross-lingual alignment in
   middle layers rather than in literal token identity
   ([EACL 2026](https://aclanthology.org/2026.eacl-long.225/)). This makes a
   semantic instruction plausibly portable across languages, but hosted APIs do
   not expose those states as a Lares interface.
3. **Dedicated multilingual embedding models deliberately align translated
   text.** LaBSE is an example
   ([LaBSE](https://arxiv.org/abs/2007.01852)). It is a separate inference model
   operating on observed text, not the generating model's private state.

Therefore vector-space alignment is a reason to let the multilingual agent
interpret one semantic tool-use instruction. It is not a reason to add an
embedding model to the daemon.

## Available engineering routes

### Portable product route

Give the model a standing, language-independent disposition: when its own
appraisal changes meaningfully — discovery, uncertainty, concern, frustration,
relief or satisfaction — it calls the emote tool. The call may precede, follow,
or occur without a visible interjection. Tool descriptions, MCP server
instructions and harness-native skills can carry and reinforce the same
semantics according to what each harness loads
(`sdd/research/mcp-instruction-delivery.md`).

This route requires neither exposed reasoning nor fine-tuning. It works only to
the extent that a model and harness can voluntarily issue the available tool
call; that behavioral support must be measured rather than inferred from
transport compatibility.

### Non-portable research routes

With control of model inference, a probe or auxiliary head could classify
contextual hidden states and steer or emit a tool call. Tool-use intention has
been shown to be linearly readable and steerable in model activations
([Tool Calling is Linearly Readable and
Steerable](https://arxiv.org/abs/2605.07990)). This is the route closest to the
original vector-space intuition, but it is model-specific and cannot be Lares'
compatibility baseline.

A rolling multilingual embedding or observer model over visible output is also
technically possible. It is rejected for the product: it arrives after the
model expressed itself, guesses from text, creates quotation and reporting
false positives, and violates P2's first-person rule. It remains useful only as
offline evaluation instrumentation.

Fine-tuning multilingual tool-use trajectories could strengthen the
appraisal-to-call association, but requiring users or model providers to train
models is outside the product contract.

## Product consequences

- The emote tool call is the signal; an interjection is neither required nor
  parsed.
- The core trigger is a semantic appraisal transition, independent of response
  language.
- Exposed chain of thought and model-specific activation access are optional
  timing enhancements, never drivers.
- No `token` branch, token table, translated lexicon, embedding dependency, or
  transcript classifier belongs in the portable path.
- Exact token-level timing cannot be promised across harnesses. The portable
  expectation is a call at the model's first available tool-decision point.
- A model/harness combination that will not proactively call the tool cannot be
  repaired by daemon-side inference without abandoning first-person emotion.

## Evidence still needed

Before a new SPEC or PLAN, compare the existing emote behavior with and without
a semantic disposition across:

- hidden-reasoning, visible-reasoning and ordinary models;
- supported harnesses and their actual instruction-delivery paths;
- multiple languages, scripts and code-switched prompts;
- appraisal shifts both with and without interjections;
- negative cases that quote or discuss interjections and emotions.

Measure call precision, call rate, cue choice, timing relative to visible
output, and interference with task completion. The experiment tests voluntary
self-expression, not whether a vocabulary detector can recognize prose.
