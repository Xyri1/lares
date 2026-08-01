# Slice 012 — Host guidance reinforcement · SPEC

**Artifact:** Slice SPEC · **Slice:** 012-host-guidance (post-011 adoption
follow-up) · **Status:** Contract settled (012-D1–D3); I2 implemented
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
2. Host context contains a short standing integration rule, not the cue
   taxonomy or a duplicate tool manual.
3. The hook does not inspect prompt text to decide whether to inject guidance.
4. No guidance is emitted unless the helper's existing local liveness check
   passes (a valid `runtime.json`) and the mirrored settings toggle is on;
   daemon-down behavior stays silent. Emission never waits on a daemon
   response.
5. Structured `additionalContext` is the model-visible channel. UI-only
   `systemMessage`, Stop continuation prompts, and incidental plain stdout are
   not instruction surfaces.
6. Plugin install/trust remains the user's consent surface. No global
   `AGENTS.md`, `CLAUDE.md`, or harness preference is edited.
7. The copy states the standing expectation plainly — a calm directive is
   fine, because hook context is user-consented plugin output — but it stays
   conditional and quiet: no urgency, no quota language, no cue taxonomy, no
   authority claims. Nagging or urgent commands read as injection and invite
   ineligible calls. It is phrased against tool absence, because a session
   started while the app was down has no MCP tools despite a passing liveness
   check.
8. The helper's stdout carries exactly the structured hook output or nothing;
   incidental runtime output must not leak into model context.

## 3. Host surfaces

Both supported hosts accept the same structured shape on `UserPromptSubmit`:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "UserPromptSubmit",
    "additionalContext": "..."
  }
}
```

Codex adds the text as developer context. Claude Code inserts it as a hidden
system reminder. Both also support context from `SessionStart`, but neither
host treats `systemMessage` as model instruction.

`UserPromptSubmit` is the decided surface (012-D2): both Lares plugins already
register it, and the shared forwarder prints a fixed reminder there, gated only
on its existing local `runtime.json` check and the mirrored settings toggle.
There is no daemon round trip, so delivery is deterministic inside the hook
budget and the A/B arms differ in exactly one way. The copy ships inside the
helper and updates with the app. Approved 2026-08-01:

```text
Lares is active for this session. If the `emote` tool is available, report
genuine shifts in your appraisal of the work as they occur — mid-task, not
only at completion. Steady work stays silent.
```

Two accepted limits: a prompt-time reminder may fade over a long agentic turn —
the exact task shape that motivated this slice — so a failed gate indicts
timing before it indicts the vector, with `SessionStart` as the lower-frequency
fallback; and a session started while the app was down passes the liveness
check yet has no MCP tools, which the conditional copy absorbs. Disclosure
wording remains an I1 decision.

Other surfaces do not fit:

| Surface | Finding |
|---|---|
| MCP initialization and tool metadata | Necessary canonical contract, already insufficient in one fresh task. |
| Ambient skill | Retrieval has the same non-instrumental problem and slice 011 removed it. |
| Global instruction files | Durable, but not safely owned or distributed by a plugin. |
| Claude output style | Can replace system-prompt behavior, but is Claude-only and overrides the user's chosen style. |
| Pre/PostToolUse context | Repeats on implementation activity rather than appraisal opportunities. |
| Stop continuation | Creates another model turn and risks task interference. |
| Host-specific router/subagent | Larger and non-portable; no need before the hook experiment is measured. |

## 4. Behavioral acceptance

Run the same tasks, host versions, models, character state, and daemon state in
two arms that differ only in the settings toggle: reminder off (MCP-only) and
reminder on. Each eligible task declares its designed emote-worthy moments up
front; scoring counts moments covered, not tasks passed, so one ritual call
cannot satisfy a task (012-D3). Record the complete turn and:

- designed moments covered by a voluntary `emote` call;
- calls at moments with no designed shift (must be zero);
- repeated or lifecycle-driven calls;
- unsolicited Lares narration;
- task outcome and meaningful tool-use change;
- silence when the daemon is absent or the toggle is off.

The minimum matrix is eligible-moment, ineligible, and daemon-down cases on
Codex and Claude Code. Multilingual, direct-request, and incomplete-character
cases test the unchanged cue contract and stay in slice 011's ledger; rerun
them only if the copy touches cue semantics. The reminder-on arm must raise
moment coverage over the reminder-off arm while keeping ineligible calls at
zero; failures update this matrix or the delivery timing, never the
principle-shaped copy, unless the principle itself proves ambiguous.
