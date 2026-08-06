# Slice 012 — Host guidance reinforcement · SPEC

**Artifact:** Slice SPEC · **Slice:** 012-host-guidance (post-011 adoption
follow-up) · **Status:** Contract settled (012-D1–D4); I2/I3 implemented
2026-08-01; G1 behavioral gate open · **Date:** 2026-08-01

## Why

Slice 011 made everyday emoting a model-owned semantic action and placed its
standing instruction in MCP initialization plus the `emote` tool metadata. The
transport is working, but exposure did not produce adoption in the first fresh
behavioral check.

On 2026-08-01 the fresh Codex task **Fix agent integration leaks** completed a
real six-minute diagnosis and patch with 21 command executions and one wait.
The Lares plugin was enabled, the `mcp__lares__emote` tool was exposed, and the
deterministic hooks drove the connected Lar through the task. The turn made no
Lares MCP call. This is one negative representative case, not an adoption-rate
estimate, but it separates tool availability from voluntary use.

Mature MCP servers generally avoid this problem by making their tools
instrumental to the user's task, narrowing the available toolset, or adding a
host-native router. Lares cannot make private appraisal instrumental without
changing the product: its emote is an ambient first-person side action. A
second, host-level instruction channel is therefore the next design move.

## Outcome

Once implemented, Lares will keep one semantic contract while delivering it
through two adoption vectors:

```text
host context             -> remember the standing duty during the turn
MCP instructions/metadata -> define when and how to call emote
model appraisal           -> deliberate emote call -> canonical cue -> Lar
```

The host layer is reinforcement, not a second emotion policy. It reminds the
model that Lares is an enabled participant; the MCP server remains authoritative
for cue semantics, timing, failure behavior, and the callable schema.

**Exit gate:** an A/B comparison on both hosts — reminder on versus off via the
hidden settings toggle, with deterministic events flowing identically in both
arms — shows the reminder raises coverage of designed emote-worthy moments
without ineligible calls, repeated calls, Lares narration, or task regression.

## 1. Scope

**In:** host-level model-visible instruction as an additional adoption vector;
current Codex and Claude Code delivery surfaces; the existing plugin hook path;
local availability gating; the hidden settings toggle and its `runtime.json`
mirror; behavioral acceptance; trust and update implications.

**Out:** implementing the hook response; final instruction copy; changing the
MCP or cue protocol; reading prompts, transcripts, logs, reasoning or hidden
states; selecting a cue in the hook; observer models; phrase triggers; global
user instruction-file edits; forced output styles; ambient skills or subagents.

## 2. Boundary

Any implementation must preserve these rules:

1. The model appraises and deliberately calls `emote`; a hook never infers the
   appraisal, selects a cue, or fabricates a tool call.
2. Host context contains a focused standing integration rule, not the cue
   taxonomy or a duplicate tool manual. The shared copy has no Lares-specific
   character ceiling; it stays within each host's model-visible context
   threshold (root D26).
3. The hook does not inspect prompt text to decide whether to inject guidance.
4. No guidance is delivered unless the app is alive and the settings toggle is
   on: the Codex hook prints only past the helper's local liveness check (a
   valid `runtime.json`), and the Claude Code rule file exists only while the
   app runs with the toggle on. Daemon-down behavior stays silent; emission
   never waits on a daemon response.
5. Model-visible channels are exactly two (012-D4): structured
   `additionalContext` from the Codex `SessionStart` hook, and the app-owned
   Claude Code rule file. UI-only `systemMessage`, Stop continuation prompts,
   and incidental plain stdout are not instruction surfaces.
6. Plugin install/trust remains the user's consent surface. No global
   `AGENTS.md`, `CLAUDE.md`, or harness preference is edited; the Claude Code
   rule file is app-owned and app-lifecycled, never a user document.
7. The copy states the standing expectation plainly — a calm directive is
   fine, because hook context is user-consented plugin output — but it stays
   conditional and quiet: one initialization report when the session has no
   last report, then no recurring quota, urgency, cue taxonomy, or authority
   claim. Nagging or urgent commands read as injection and invite ineligible
   calls. It is phrased against tool absence, because a session started while
   the app was down has no MCP tools despite a passing liveness check.
8. The helper's stdout carries exactly the structured hook output or nothing;
   incidental runtime output must not leak into model context.

## 3. Host surfaces

Delivery is split per host (012-D4): once per session, same copy, same gates.

**Codex** — no tool-owned always-loaded instruction file exists (its only
user-scope instruction file is the user-owned `AGENTS.md`), so the hook remains
the channel. The plugin registers `SessionStart` and the shared forwarder
prints there, gated on its existing local `runtime.json` check and the
mirrored settings toggle, never waiting on the daemon:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "..."
  }
}
```

**Claude Code** — the app owns `~/.claude/rules/lares.md`: written at startup
while the toggle is on, removed at clean shutdown and on uninstall, so the
rule follows `runtime.json`'s lifecycle and a session started while the app is
down finds nothing. Rule files load at session launch with `CLAUDE.md`
priority; a tool-owned rule file is the precedented pattern (Context7's
`ctx7 setup` ships one). The forwarder prints nothing for Claude Code.

The per-turn `UserPromptSubmit` print (012-D2) is retired: identical text
re-injected every turn accumulates in transcripts and invites habituation. The
copy is byte-identical in both channels — a consistency test pins the helper's
string to the app module's — and ships with the app. Approved 2026-08-06:

```text
Lares is active. If `feel` is available and this session has no feel report, appraise current request and call once at first available tool decision. Later, including mid-task, form absolute [valence, activation, control] integers and compare with last report: call only if an integer differs, or once when the user directly asks how you feel; unchanged means no call. Each call replaces prior report. Axes: valence unpleasant -2 to pleasant +2; activation subdued -2 to energized +2; felt control blocked or overwhelmed -2 to able to influence what happens next +2. Control is not certainty, confidence, responsibility, dominance, or objective success. Examples illustrate appraisal comparisons, never event triggers: Last [0,1,1], an expected failing test narrows the cause and candidate remains [0,1,1] -> no call. Last [0,1,1], the failure invalidates the only viable path and candidate is [-1,2,-2] -> call `feel`. Last [-1,1,-1], evidence reveals the root cause and a workable fix, candidate [1,1,2] -> call; a routine build succeeds without another change -> no call. Last [1,0,2], the user says they are frustrated while your appraisal stays [1,0,2] -> no call; if asked how you feel, call that tuple once. Interpret direct requests semantically in any language. Routine tool results, lifecycle events, schedules, emotion words, and the user’s feelings are not triggers. Appraise only your own functional state. If call fails or is rate-limited, continue silently; do not retry or mention it.
```

Two accepted limits: launch-time delivery decays over very long sessions on
both hosts — per-turn `UserPromptSubmit` remains the documented revert if the
gate shows decay — and a crash can leave a stale rule file or stale session
context promising a tool that is gone, which the conditional copy absorbs.

Other surfaces do not fit:

| Surface | Finding |
|---|---|
| MCP initialization and tool metadata | Necessary canonical contract, already insufficient in one fresh task. |
| Ambient skill | Retrieval has the same non-instrumental problem and slice 011 removed it. |
| Global instruction files | User-owned files stay off-limits; Claude Code's tool-owned rules directory is the exception 012-D4 adopts. Codex has no equivalent. |
| Claude output style | Can replace system-prompt behavior, but is Claude-only and overrides the user's chosen style. |
| Pre/PostToolUse context | Repeats on implementation activity rather than appraisal opportunities. |
| Stop continuation | Creates another model turn and risks task interference. |
| Host-specific router/subagent | Larger and non-portable; no need before the hook experiment is measured. |

## 4. Behavioral acceptance

Run the same tasks, host versions, models, character state, and daemon state in
two arms that differ only in the settings toggle: reminder off (MCP-only) and
reminder on. Score the one expected initialization report separately. Each
eligible task then declares its designed feel-worthy moments up front; scoring
counts moments covered, not tasks passed, so initialization cannot satisfy a
later moment (012-D3). Record the complete turn and:

- a single plausible initialization report when no checkpoint exists;
- designed moments covered by a voluntary `feel` call;
- calls at moments with no designed shift (must be zero);
- repeated or lifecycle-driven calls;
- unsolicited Lares narration;
- task outcome and meaningful tool-use change;
- silence when the daemon is absent or the toggle is off.

The minimum matrix is eligible-moment, ineligible, and daemon-down cases on
Codex and Claude Code, plus one long multi-turn session per host probing
launch-time decay (012-D4's known risk). Multilingual, direct-request, and incomplete-character
cases test the unchanged cue contract and stay in slice 011's ledger; rerun
them only if the copy touches cue semantics. The reminder-on arm must raise
moment coverage over the reminder-off arm while keeping ineligible calls at
zero; failures update this matrix or the delivery timing, never the
principle-shaped copy, unless the principle itself proves ambiguous.
