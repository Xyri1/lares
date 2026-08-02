# Emotion geometry inside language models

Research for slice 013, 2026-08-02. This asks whether emotion occupies regions
in an LLM's embedding space and what, if anything, that implies for Lares.

## Verdict

The intuition is substantially correct, with two corrections:

1. An LLM does not do its useful computation *in tokens*. Tokens are discrete
   input/output symbols. They are mapped to vectors, then transformed into
   context-dependent hidden activations at every position and layer.
2. The evidence concerns directions, subspaces, manifolds, and activation
   patterns in those contextual hidden states—not one universal emotion region
   in the static token-embedding table.

Emotion-related structure is not merely decodable correlation. Several studies
can change model behavior by intervening on the identified activation, which is
evidence that at least some of the structure is causal. It remains
model-, layer-, position-, and context-dependent, and it is not evidence that a
model has subjective feelings.

For Lares, this supports asking the model to project its rich current appraisal
onto a tiny first-person signal. It does not support adding an embedding model
or trying to read hosted-model activations. **The three values are the wire
format, not how the model thinks.**

## What is represented where

A vocabulary embedding is only the starting vector associated with a token.
Contextual representations quickly become different from that lookup: across
ELMo, BERT, and GPT-2, a word's static embedding explained less than 5% of the
variance in its contextual representations on average, and upper layers became
more context-specific
([Ethayarajh 2019](https://aclanthology.org/D19-1006/)).

The more accurate shorthand is therefore:

> LLMs communicate in tokens, but represent the current context in activation
> space.

An emotion representation may be active while generating an emotionally
neutral-looking sentence, or it may refer to a quoted speaker or story
character rather than the assistant. The relevant object is a contextual state
at a particular time, not the word *angry* or its embedding.

## Evidence, from strongest product relevance downward

### Broad emotion concepts with causal effects

Anthropic derived activation patterns for 171 emotion concepts in Claude
Sonnet 4.5. Related emotions had related representations; activations tracked
contextual changes such as increasing medical danger; and steering the vectors
changed preferences, blackmail, and reward-hacking behavior. Some behavioral
changes occurred without overt emotional wording
([Anthropic 2026](https://www.anthropic.com/research/emotion-concepts-function),
[full paper](https://transformer-circuits.pub/2026/emotions/index.html)).

The same work supplies the most important caveat for Lares: these are primarily
**local** representations of emotion relevant to the current or upcoming
output, not a persistent global emotional state. While writing a story they can
track a character, then return to the assistant. The authors explicitly do not
claim subjective experience.

### Simple sentiment directions are causal

Across several transformer models and tasks, Tigges and colleagues found that a
single direction in activation space captured much of positive-versus-negative
sentiment. Interventions and ablations established causal effects, including a
drop in Stanford Sentiment Treebank accuracy from 100% to 62% after ablating
the direction across tokens
([Tigges et al. 2024](https://aclanthology.org/2024.blackboxnlp-1.5/)).

This continues an older result: a character-level mLSTM trained only for
next-character prediction developed a highly predictive sentiment neuron, and
overwriting that neuron controlled generated sentiment. That model was trained
on Amazon reviews and degraded out of domain, so it is existence evidence, not
a universal architecture claim
([OpenAI 2017](https://openai.com/index/unsupervised-sentiment-neuron/)).

### Low-dimensional affect geometry is plausible, but early

A 2026 preprint reports a two-dimensional valence-arousal subspace with circular
geometry. Its projections correlate with human affect ratings for 44,728 words;
steering produces monotonic affect changes and affects refusal and sycophancy;
results replicate across Llama 3.1-8B and three Qwen models
([Sun et al. 2026](https://arxiv.org/abs/2604.03147)).

Another study reports a low-dimensional, directionally encoded emotional
manifold generalizing across eight datasets and five languages, with learned
interventions that steer emotion while preserving semantics
([Reichman, Avsian, & Heck 2026](https://arxiv.org/abs/2510.22042)).

These findings reinforce valence and activation as plausible shared
coordinates. They should not be promoted to a universal law yet: extracting a
subspace requires choices of prompts, labels, layers, token positions, models,
and fitting method. In particular, successful probes can construct a useful
readout from information that the model does not itself use; causal steering is
stronger evidence than probe accuracy alone.

No equally strong mechanistic evidence found here establishes **felt control**
as a third universal LLM axis. Its justification remains human affect research
and product usefulness. Model compatibility for that axis must be measured.

## What this confirms—and what it does not

Confirmed:

- next-token training can produce compact, semantically meaningful affect
  structure without explicit emotion supervision;
- some affect features are approximately linear, while richer emotion sets can
  form related subspaces or manifolds;
- manipulating these activations can causally change output and decisions;
- human valence-arousal organization can reappear in model activations.

Not confirmed:

- a single emotion map shared unchanged by every model, layer, or language;
- a stable assistant-wide mood available at every token position;
- reliable recovery of the assistant's first-person state from its prose;
- provider access to the required hidden activations;
- subjective experience or human-equivalent feeling;
- three dimensions as the model's native or complete emotion representation.

## Consequence for the Lares freeform contract

Do not decode the transcript, token embeddings, or hidden state. Hosted APIs
normally expose neither the necessary layers nor portable directions; an
observer model would add cost, latency, quotation/role confusion, and violate
the first-person-emotion principle.

Instead, give the agent one cheap semantic action such as:

```text
feel(valence, activation, control)
```

The model interprets its contextual state and deliberately compresses it into
three bounded values. Lares then performs all interpolation, history,
character-specific style, and animation locally and deterministically. The
call need happen only on a meaningful change, not on every token or frame.

This division follows the evidence:

- **inside the model:** rich, model-specific emotion geometry;
- **across the boundary:** three stable, renderer-neutral coordinates;
- **inside Lares:** deterministic temporal performance.

Activation access may become an optional research adapter for open models, but
it should never be the portable product contract. The smallest compatibility
test is behavioral: can each target model use the same anchored V-A-control
tool description, call it at meaningful appraisal changes, and distinguish
control from valence and activation without harming task performance?
