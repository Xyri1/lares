# Codex plugin starter prompts for Lares

Research note, 2026-08-07. This evaluates the implemented
`interface.defaultPrompt` copy; it does not change Lares's model-facing guidance.

## Recommendation

Start with two localized versions of the same experience-first prompt:

```json
"defaultPrompt": [
  "Let's play Twenty Questions: I'll think of something, you guess, and let Lares reflect your appraisal along the way.",
  "来玩二十问猜谜吧：我先想一样东西，你来猜，让 Lares 呈现你一路上对局面的判断。"
]
```

This turns the card into a first-use entry point: the user holds the answer while
the agent gathers evidence over several turns, creating genuine opportunities
for later appraisal changes after the initial report. It does not prescribe
emotions, tuples, or a call count. The two entries provide the same experience
in English and Chinese; add another use case only if fresh-task UI testing shows
a real onboarding gap.

## What `defaultPrompt` is

OpenAI defines `interface.defaultPrompt` as starter prompts shown in the
composer/UX. The field accepts at most three strings, each at most 128
characters, and recommends roughly 50 characters for scanning
([plugin JSON spec](https://github.com/openai/codex/blob/main/codex-rs/skills/src/assets/samples/plugin-creator/references/plugin-json-spec.md#interface-fields)).
Current Codex source normalizes whitespace and ignores empty, over-limit, or
surplus entries rather than treating them as model instructions
([constants and parser](https://github.com/openai/codex/blob/main/codex-rs/core-plugins/src/manifest.rs#L11-L12),
[validation](https://github.com/openai/codex/blob/main/codex-rs/core-plugins/src/manifest.rs#L430-L498)).
The safe rule is therefore `<= 3`, `<= 128` characters, with no reliance on
truncation.

This is interface metadata, not hidden behavioral policy. An official OpenAI
plugin uses the same field for a normal outcome request, "Design a new landing
page for my new SaaS product," and uses only one entry
([Build Web Apps manifest](https://github.com/openai/plugins/blob/main/plugins/build-web-apps/.codex-plugin/plugin.json)).
The maximum is not a quota.

It is not automatic install-time onboarding. It can be a deliberate first-use
entry point after the user has installed the plugin, started Lares, and opened a
fresh task. Keep the existing **Configure Agent Integrations…**, new-task, and
hook-trust flow as the activation path; `defaultPrompt` begins the experience
after those steps rather than replacing them.

Lares's current manifest carries the recommended prompt
([plugin.json](../../plugins/codex/.codex-plugin/plugin.json#L14-L28)). Its
behavioral policy still lives elsewhere: `SessionStart`/MCP guidance asks for
one initial appraisal and sparse later changes
([hostGuidance.ts](../../src/main/hostGuidance.ts#L5-L8)), while hooks carry
operational facts and never infer emotion
([Codex plugin guide](../../plugins/codex/README.md#L3-L20)). The README's user
contract is simply to work as usual
([README](../../README.md#L97-L110)). A starter prompt may begin such a task; it
does not itself guarantee that Lares is running, visible, connected, or that a
later appraisal shift will occur.

## Design constraints

- Use a real multi-turn unknown rather than inventing or scripting an emotional
  arc.
- Make the first-use path coherent without credentials, external accounts, or
  workspace assumptions.
- Keep localized prompts semantically equivalent before adding use-case variants.
- Let the existing host/MCP policy decide `feel()` calls. Emotion words,
  lifecycle events, and routine tool results are not triggers
  ([D26 and D34](../DECISIONS.md#L37-L43)).
- Preserve functional expression: charm cannot replace an actionable signal
  ([P1](../PRINCIPLES.md#L9)); the model appraises but never selects animation
  ([P2 and P4](../PRINCIPLES.md#L11-L15)).

Prior affect research supports keeping the wire signal out of the starter
copy. Valence, activation, and felt control are a compact report, not a complete
emotion ontology ([Russell & Mehrabian, 1977](https://doi.org/10.1016/0092-6566(77)90037-X));
the user does not need to supply or script those axes. People can apply social
rules to computers from minimal cues
([Nass, Steuer, & Tauber, 1994](https://doi.org/10.1145/191666.191703)), so it is
prudent to avoid starter copy that escalates "a companion" into claims of human
feeling. That caution is a product inference, not a result directly tested by
the paper.

## Candidate sets

### A. Interactive experience — recommended

1. `Let's play Twenty Questions: I'll think of something, you guess, and let Lares reflect your appraisal along the way.`
2. `来玩二十问猜谜吧：我先想一样东西，你来猜，让 Lares 呈现你一路上对局面的判断。`

The user privately chooses the answer, so the agent must gather changing
evidence rather than manufacture its own challenge. Both localized versions
name the same product experience without prescribing how the agent should feel
or how often it should report.

### B. Self-contained demo

1. `Start a Lares demo: tackle a short mystery, adapt as evidence changes, and verify the answer.`

This removes the extra user turn, but the agent must invent the mystery and may
already know its answer. That makes the appraisal arc less genuine than a task
supplied by the user.

### C. Generic utility prompts

1. `Review this project and identify its biggest risk.`
2. `Find and fix one small bug with a regression test.`

These are coherent Codex tasks, but they present Lares like a developer utility
and do not explain the first-use experience. They were rejected after the
onboarding goal was clarified.

## Rejected patterns

- `Show me every Lares emotion while you work.` — spectacle over utility; no
  task and no meaningful status.
- `Feel frustrated, then celebrate when the tests pass.` — direct emotion and
  event-to-feeling commands violate first-person, history-aware appraisal.
- `Animate Lares while you fix a bug.` — assigns animation to the model, crossing
  P4's boundary.
- `Tell me how you feel, then ...` — a direct request legitimately permits one
  report, but using that exception as the showcase reduces Lares to a forced
  reaction and says nothing about sparse changes during real work.

## Minimum validation before a manifest change

1. Verify every entry is non-empty, at most 128 characters, and the array has
   at most three entries.
2. Install the checkout plugin, start a fresh Codex task, and confirm the detail
   page shows both exact prompt texts.
3. With Lares running, click each prompt, play through a real answer, and verify
   one plausible initial report plus later calls only when appraisal genuinely
   changes; do not require a fixed number.
4. Confirm normal task quality and no ritual duplicate calls.

OpenAI recommends labelled direct, indirect, and negative prompts plus
one-field-at-a-time iteration for metadata changes
([Optimize Metadata](https://developers.openai.com/plugins/guides/optimize-metadata)).
For this UI field, the analogous smallest test is the four checks above; no new
evaluation framework is needed.
