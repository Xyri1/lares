# Slice 011 — Interjection · DECISIONS

Slice 011 extends the M3a emote protocol and D26 adoption copy. It does
not replace either. Every row below is **proposed** — none carries
*decided* until the maintainer says so.

---

**011-D1 — Tokens nudge; they never enqueue.** *Chosen:* the token
branch applies an affect nudge and returns `status: "nudged"` without
touching the expression queue. An interjection is a modulation, not a
performance: it tilts affect and lets the body's continuous synth carry
it. *Rejected:* enqueueing the nearest cue by affect distance (gives a
discrete visible beat, but makes an ambient signal compete with
deliberate beats for a four-deep stack, and lets a filler word preempt a
real one); a separate shallow token stack (a second queue for one
feature). *Rationale:* this is D01's parametric thesis in its purest
form and it is the smallest possible change — the branch is exactly the
existing coalesced path, always. *Known limitation, accepted:* a token
is then visible only through §4's continuous mapping, so a character
with a thin `performance` block shows cue emotes and not token emotes —
a real M2b dependency the `cue` branch does not carry. *Status:*
proposed.

**011-D2 — A fixed, closed token table, character-independent.**
*Chosen:* ~12 entries beside `BASELINE_NUDGES` in the affect constants,
covering the measured reflection and transition vocabulary — *wait, hold
on, hmm, huh, actually, maybe, perhaps, alternatively, okay, oh, aha,
ugh, oh no* — with magnitudes scaled inversely with trace frequency and
every number a tunable default
(`sdd/research/reasoning-tokens.md` for the taxonomy and the measured
frequencies). *Rejected:* embedding or similarity lookup
(puts a model and an inference step in the ingest path for what a dozen
literals answer, and P4-adjacent even at ingest); an open vocabulary
where the agent supplies its own coordinates (the turn-1 `feeling`
proposal — superseded: an interjection is cheaper than a self-classified
emotion word because the agent echoes a token it already wrote instead
of stopping to classify itself); per-character token tables (identity
lives above the renderer, and an interjection means the same thing
whoever the Lar is — P5). *Open challenge, recorded deliberately:* this
is the same closed-vocabulary shape that slice 011's own analysis
faulted in the cue set. The defense is that the token distribution is
top-heavy and measured rather than open-ended, so a short table covers
the mass; if that stops being true the table grows, which is a constant
edit. *Known weakness in the evidence:* those frequencies come from
models that expose their reasoning traces. The harnesses Lares supports
never return raw reasoning tokens, so the real distribution for the
target population is **unmeasurable from outside** — the table is seeded
from an adjacent population, and the vocabulary may be wrong in ways no
amount of tuning the magnitudes will fix. Watch refusal rate at the gate
for the first evidence either way. *Status:* proposed.

**011-D3 — Unresolvable tokens are refused, with the vocabulary in the
error.** *Chosen:* a token that resolves to no table entry returns a
tool error naming the accepted set, so one failed call teaches the
vocabulary. *Rejected:* accepting with a zero nudge (a silent no-op the
agent reads as success while the Lar does not move); mapping unknown
tokens to a generic arousal bump (fabricates affect the agent did not
express, and is inference by another name). *Risk, accepted:* an error
may discourage a channel we are already short on — mitigated by naming
the vocabulary in `instructions` so a refusal should be rare. *Status:*
proposed.

**011-D4 — No rate gate on the token branch.** *Chosen:* the token
branch bypasses the 2s per-source emote spacing entirely; §4 saturation
(`0.5^(n-1)` inside the window) and the affect clamp bound repeated
tokens by construction. *Rejected:* reusing the cue spacing (a token
would then block a subsequent cue for 2s, and the two are different
channels); a separate token bucket (a second map and its sweep for a
case saturation already answers). *Rationale:* P7's obligation is that
ingress is bounded server-side regardless of client behavior, and it is
— provably, in affect terms. *Residual, accepted:* affect is bounded but
*tool calls* are not; a chatty agent can spend the user's tokens on
emotes that change nothing visible. The density bound is instruction
copy, not a server cap. Revisit if observed density is bad. *Status:*
proposed.

**011-D5 — `instructions` becomes a standing disposition that also
pulls the tools into context.** *Chosen:* replace the five-milestone
checklist with (a) an explicit call-`list_cues`-at-session-start
directive, (b) the token channel and its vocabulary with a
once-or-twice-a-turn density bound, (c) the cue trigger stated as
divergence from the event log, (d) the existing silent-on-refusal line.
*Rejected:* keeping the checklist and adding tokens to it (the checklist
asks for four things the hook stream already reports, and a list decays
in long context where a rule of thumb survives); relying on tool
descriptions as triggers (D26's assumption — measurably weaker now that
both harnesses defer tool definitions behind a relevance-driven search
that never fires for a non-instrumental tool); moving the load-bearing
copy into the skill (per-harness, lazily loaded, invisible to future
harnesses — D26 rejected this once already and the reasoning stands).
*Rationale:* the delivery mechanism is the constraint
(`sdd/research/mcp-instruction-delivery.md`). `instructions` arrives
once at MCP connect, is truncated at 2KB, and must fire hours later;
that is a disposition, not a checklist, and it is the only Lares text
guaranteed to be in context at all. *Open item carried from the
research:* whether the Codex builds D15 pins consume `server_instructions`
at all is unverified — if they predate support, this copy reaches Claude
Code only and the Codex half rides on the skill. *Status:* proposed.

**011-D6 — Token guidance is authoritative in `instructions`; the
plugin skill stays defensive.** *Chosen:* the daemon's `instructions`
carry the token vocabulary and always match the running daemon by
construction. The plugin skill describes the branch but tells the agent
to fall back to `cue` if the server refuses `token`. *Rejected:* leaving
the skill silent on tokens (loses the reinforcement D15/009-D3 ships it
for); bumping `protocol_version` and having the skill gate on `status()`
(a round trip before the first emote, to defend against a skew window
that closes as installs update). *Rationale:* plugins are user-installed
through a marketplace and the daemon is the app; they version
independently, so a new skill can meet an old daemon and get *exactly
one of cue or params is required*. Instructions cannot skew — they are
generated by the daemon answering the call. *Status:* proposed.

**011-D7 — The token axis gets scenario and diagnostic coverage, not a
launch gate.** *Chosen:* `EmoteEvent` gains an optional `token`; one
golden (`brutal-debugging-session`) carries tokens; new S11 records that
the same event under different tokens must read differently, as
diagnostic instrumentation. *Rejected:* leaving the branch
scenario-invisible (M2b tunes against the player, so an untunable
channel is an unshipped one); making S11 launch-blocking (S1 is the
P8/D28 gate and adding a second aesthetic gate re-opens exactly the
black hole D28 closed). *Status:* proposed.
