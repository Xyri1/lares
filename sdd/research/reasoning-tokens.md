# Reasoning tokens as an affect signal

Research for slice 011 (`sdd/slices/011-interjection/`), 2026-07-31. Sources are
published papers on reasoning-model behavior. They establish that reasoning
interjections are measurable, categorizable, and causally load-bearing in the
models that expose their traces. They do **not** establish that any specific
production model emits them at the rates below, and they say nothing about
emotional valence — see *What this does not establish* at the end, which is the
half that constrains 011-D2.

## The tokens are real, emergent, and named

DeepSeek-R1's training report documents an "aha moment" that emerged from
reinforcement learning without being programmed: mid-derivation, the model
writes *"Wait, wait. That's an aha moment I can flag here. Let's reevaluate this
step-by-step"* and then re-derives
([DeepSeek-R1](https://arxiv.org/html/2501.12948v1)). The relevant point for
Lares is not the anthropomorphic framing but that the marker arose on its own as
a reasoning behavior, rather than being a stylistic tic copied from training
prose.

## They are causally load-bearing, not decoration

The s1 paper's *budget forcing* controls test-time compute by suppressing the
end-of-thinking token and **appending the literal string "Wait"** to make the
model continue. This reliably produces re-checking and repairs incorrect
reasoning steps ([s1: Simple test-time scaling](https://arxiv.org/abs/2501.19393)).

The token is therefore not merely correlated with reconsideration — injecting it
*causes* reconsideration. Whatever these words are, they are load-bearing in the
computation, not ornamentation on top of it.

## Taxonomy and frequency

The clearest categorization splits what it calls *thinking tokens* into
**reflection tokens** (*wait, hmm, hold on, okay*) and **thought transition
tokens** (*alternatively, maybe, but, however*), and reports measured epistemic
frequencies across reasoning traces
([Do Thinking Tokens Help or Trap?](https://arxiv.org/html/2506.23840)):

| Token | Frequency | Token | Frequency |
|---|---|---|---|
| wait | 73.0% | perhaps | 8.2% |
| maybe | 32.9% | might | 6.6% |
| actually | 12.4% | seems | 3.3% |
| check | 10.5% | alternatively | 1.2% |
| hmm | 8.3% | | |

Two things follow for slice 011. First, the distribution is **extremely
top-heavy** — a handful of tokens covers the mass, which is what makes a fixed
table of roughly a dozen entries defensible where a fixed table of *emotion
words* would not be (011-D2). Second, magnitudes should scale **inversely** with
frequency: a token appearing in 73% of traces cannot carry the same nudge as one
appearing in 1% without drowning the signal.

## They carry information, and they mark uncertainty

Information-theoretic analysis finds these tokens sit at *information peaks* —
points of high mutual information with the correct answer — and argues that
externalizing uncertainty this way is the mechanism by which self-correction
becomes possible
([Demystifying Reasoning Dynamics with Mutual Information](https://arxiv.org/html/2506.02867v2)).

Separately, lexical markers of uncertainty in a reasoning chain (*guess, stuck,
hard*) are reported as the **strongest lexical predictor of an incorrect final
answer**, with hedging and trace length correlating with model uncertainty
([Lexical Hints of Accuracy in LLM Reasoning Chains](https://arxiv.org/html/2508.15842v1)).

There is also work probing the internal states immediately preceding *wait*,
which treats the marker as downstream of a distinguishable internal state rather
than as free-floating text
([Internal states before wait modulate reasoning patterns](https://arxiv.org/pdf/2510.04128)).

## The counterpoint, and why it favors Lares

A recurring criticism is that markers like *wait* emerge from **high-entropy
prediction states** and correlate only weakly with actual performance gains.
That is damaging to anyone claiming the token signals *productive* reasoning.

It is favorable here. Lares does not care whether the reconsideration helped; it
cares whether the model was uncertain. High entropy *is* uncertainty, so on this
reading the token is a more honest uncertainty signal than a self-reported
confidence label would be — and P1 only asks that the expression encode
something the user can act on.

## The finding that shaped the design

The vocabulary is **epistemic, not emotional**. Scan the taxonomy — *wait, hmm,
maybe, perhaps, alternatively, actually, however, hold on*. Every entry encodes
doubt, arrest, or a turn. There is no *delighted* token, and the positive end
(*aha*, *oh*) is both rarer and less studied.

So reasoning tokens supply **arousal and epistemic state cheaply, and almost no
valence** — which is exactly the half Lares already gets for free from the other
direction. Hook baseline transitions know a tool failed, a turn ended, input is
wanted: that is valence. The two channels are near-orthogonal on the §4 axes,
and neither alone distinguishes *"ah, of course"* from *"wait — that shouldn't
fail"* on the same `error` event. This is the D34 division of labour, and it is
a finding from the literature rather than a design preference.

## What this does not establish

- **Not measured on the models Lares actually watches.** Every frequency above
  comes from open reasoning models that expose their traces. Production Claude
  and Codex models never return raw reasoning tokens through the API
  (`sdd/research/mcp-instruction-delivery.md`), so **the real distribution for
  the harnesses Lares supports is unmeasurable from outside**. The table is
  seeded from adjacent evidence, not from the target population.
- **Nothing about magnitudes.** No source assigns affect coordinates to any of
  these tokens. Every number in `TOKEN_NUDGES` is an authored default, which is
  why 011-D2 declares them M2b's to move rather than contract.
- **Nothing about whether an agent will report the token when asked.** The
  literature observes tokens inside traces. Slice 011 depends on the agent
  *choosing to send one over MCP*, which is an adoption question the papers do
  not touch — it is 011-D5's problem, and the slice gate tests it directly.
- **Nothing about qualia, and the product does not need it.** Whether the token
  corresponds to anything felt is out of scope. P1 sets the bar at legibility:
  if the marker tracks a high-entropy state and the Lar reads as hesitant, the
  user learns something true and actionable.
