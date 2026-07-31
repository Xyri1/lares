# Slice 011 — Interjection · PLAN

Execution notes; disposable after the gate closes. This is an additive
branch on the M3a protocol plus an adoption-copy rewrite, not a new
ingress.

---

## 1. Settle the opening gates

Nothing is built until 011-D1 (nudge-only) and 011-D5 (instructions
rewrite) carry *decided*. They are the two rows that change what the
product is; the rest are shapes of the same change.

011-D2's numbers are explicitly **not** an opening gate — they are M2b's
to move. Land the table with defensible defaults and stop.

## 2. Affect first, in the pure module

`affect/constants.ts` gains `TOKEN_NUDGES` beside `BASELINE_NUDGES`.
`affect/engine.ts` grows a token nudge entry point; the existing
`applyCueNudge` body is the same math with a different delta source, so
extract it rather than duplicating, and namespace the saturation key
(`token:<token>`) so a cue named `wait` and the token `wait` never share
a bucket.

The engine stays free of Electron, wall clock, and normalization — the
table lookup and string handling belong at the ingress, not in the
physics. Cover the table, the saturation ladder, and the namespacing
here; these are the assertions that fail loudly if the math drifts.

## 3. Ingress

`nerves.ts` moves from a two-way to a three-way exclusivity check, adds
the normalizer (full phrase before first-word fallback), and returns the
new `nudged` status. Keep the existing `duration_s`/`queue` validation
running on the token path even though both are inert — P7 validates
ingress whether or not the value is used — and warn rather than throw
when they appear.

Refusal text names the vocabulary (011-D3). One test that a burst of
identical tokens stays under twice a single nudge is the check that
011-D4's no-gate claim actually holds.

## 4. Protocol surface and copy

`server/server.ts`: `token` in the schema, the `emote` description
rewritten to lead with it, `list_cues` described as a session-start
call, and `INSTRUCTIONS` rewritten per 011-D5. Keep the whole
instructions block well inside 2KB and put the load-bearing lines first
— harnesses truncate at 2KB and long context erodes the tail.

The shared skill is one file copied byte-identical into both plugins
(009-D3). Write it once, copy, and diff to prove it.

## 5. Scenario

`scenario/types.ts` `EmoteEvent` gains optional `token`; the player
routes it through the same ingress as a cue emote. Add tokens to
`brutal-debugging-session` only — one golden is enough to tune against,
and the other three stay as they are so their existing recordings remain
comparable.

## 6. Root docs land with the code, not before

Root SPEC §2 (three-branch signature, caps note) and §4 (table, the
valence/arousal division, saturation namespacing, the thin-`performance`
limitation) are staged in this slice's SPEC and copied up when 011-D1
and 011-D5 are decided. Root D34 flips from proposed at the same moment;
D09 and D26 get their amendment notes then, not now — the repo does not
amend decided rows with unapproved content.

## 7. Gate

Real harness session, no scripted prompting. Watch for the failure this
slice exists to fix: if the agent never calls `list_cues` unprompted,
011-D5's copy failed and the retrieval problem is unsolved — that is the
one result that bounces the slice rather than tuning it.

Then: at least one token emote in ordinary work; visible arousal
movement with an empty expression stack; synthetic burst holds the caps;
and a zero-emote run still passes the §9 criteria so the D26 floor is
intact.
