# How MCP server instructions reach an agent

Research for slice 011 (`sdd/slices/011-interjection/`), 2026-07-31, with the
slice 012 host-guidance follow-up added 2026-08-01. Sources are the MCP
specification, first-party Codex, Claude Code and Claude API documentation, and
current MCP server designs. This is **version-sensitive**: re-read it after a
harness upgrade.

The short version: server instructions, deferred tool descriptions and
harness-native skills have different delivery guarantees, and no one of them is
portable across arbitrary harnesses. Some target models also hide raw chain of
thought. The emote interface must therefore be self-contained once surfaced,
while every available instruction channel reinforces the same semantic
disposition; exposed reasoning can only be an optional enhancement. Those facts
set the shape of 011-D5 and D34.

## The protocol

`instructions` is an optional field on the `initialize` response. The
specification describes it as guidance the client "can leverage… effectively
acting as a hint that may be incorporated into the system prompt"
([MCP lifecycle / schema](https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle)).
The official guidance for server authors frames it as a "user manual" injected
into the model's system prompt, and advises against duplicating tool
descriptions in it
([Using server instructions](https://blog.modelcontextprotocol.io/posts/2025-11-03-using-server-instructions/)).

It is delivered **once, at the `initialize` handshake** — not per turn and not
by any hook. In Lares this is why the D32 calibration invitation only reaches
*new* sessions: `sessionInstructions()` is read while answering the handshake
and never again for that session's life.

The current hook path never touches this. The bundled forwarder reads stdin,
POSTs `/v1/events`, consumes the response, and exits with no stdout. Hooks feed
the daemon; `instructions` feeds the model. Slice 012 revisits that separation
because both supported hosts can make selected hook output model-visible.

## Claude Code

Instructions are added to the system prompt, and the load timing is documented
directly: **"Only tool names and server instructions load at session start."**
Both instructions and tool descriptions are **truncated at 2KB each**
([Connect Claude Code to tools via MCP](https://code.claude.com/docs/en/mcp)).

The decisive detail is that **MCP tool search is enabled by default**. Tool
*definitions* are deferred and discovered on demand; only names and server
instructions are loaded upfront. The docs say so to server authors explicitly:
the instructions field "becomes more useful with tool search enabled" because it
"help[s] Claude understand when to search for your tools, similar to how skills
work."

## The tool-search mechanism

Deferred tools are marked `defer_loading: true`. "Initially, Claude's context
contains only the tool search tool and any non-deferred tools"; when Claude
searches, the API returns `tool_reference` blocks (up to 5 by default) and
expands them into full definitions inline, leaving the cached system-prompt
prefix untouched. Search runs server-side over **names, descriptions, argument
names, and argument descriptions**
([Tool search tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool)).

This reconciles with the Claude Code statement above: definitions are excluded
from the prefix, while the harness surfaces bare tool *names* alongside the
server instructions.

The optimization advice in that page is worth recording: *keep your 3–5 most
frequently used tools non-deferred* (a harness decision, not a server one), *add
common keywords to descriptions to improve discoverability*, and *use consistent
namespacing*. The latter two help only after the model elects to search.

Lares therefore carries a retrieval risk, not a proven universal failure.
Search is task-driven, while emoting is not instrumental to finishing the task.
A database request naturally retrieves `supabase`; an ordinary task may never
make `emote` relevant enough to retrieve. Whether a standing semantic
disposition changes that behavior is a live gate for slice 011. Until measured,
D26's "tool descriptions double as triggers" is weaker than written but not
disproved when this was written. The 2026-08-01 follow-up below records the
first fresh negative behavioral case.

## Codex

Codex reaches the same place by a different route. The feature was originally
absent: [issue #6148](https://github.com/openai/codex/issues/6148), *"Append the
instructions of the MCP servers to the system prompt,"* was filed 2025-11-03 and
closed 2025-12-31 as stale, with a later comment arguing the omission made Codex
non-compliant with the protocol.

Current `openai/codex` source does consume it, but not as a system-prompt
append. `rmcp_client.rs` stores `initialize_result.instructions` as
`server_instructions`, and `regular_mcp_tool_info_from_listed_tool` assigns it to
`namespace_description` on each tool's `ToolInfo` — the description of the
`lares` tool *namespace* in the Responses API tool spec. It therefore rides the
tools payload each request rather than the system prompt. Codex also carries
`tool_search` and `tool_search_always_defer_mcp_tools` feature flags, and its
namespace descriptions survive deferral the way Claude Code's do.

**Net for the versions inspected:** both harnesses converge on the same shape —
server instructions visible before deferred tool schemas — so one
harness-neutral disposition can reinforce both. It does not remove the need for
a self-contained tool interface or live verification, which is what 011-D5
requires.

## Raw chain of thought cannot be a compatibility requirement

Some models and harnesses expose reasoning text, while others hide it or return
only a summary. For example, Claude's `thinking.display` defaults to
`"omitted"`; `"summarized"` returns a readable summary rather than the raw token
stream
([Claude API — adaptive thinking](https://platform.claude.com/docs/en/build-with-claude/adaptive-thinking)).

This matters beyond the P2/P11 fence: any design that requires inspecting raw
reasoning excludes those models by construction. The portable route is a
semantic instruction addressed to the model and a deliberate tool call emitted
by it. A visible-reasoning adapter may improve timing for a particular harness,
but it cannot drive Lares' core behavior.

## 2026-08-01 behavioral finding

The fresh Codex task **Fix agent integration leaks** ran with the updated Lares
plugin and exposed `mcp__lares__emote`. Its deterministic hooks reached the
connected Lar, while the completed turn used 21 command executions and one
wait but no Lares MCP call. The task was substantial enough to include
diagnosis, a failed regression check, relief after the fix, and successful
completion. Tool availability, hook connectivity, and eligible appraisal
opportunities were therefore all present.

This does not establish a rate or prove that MCP instructions never work. It
does establish the product-relevant defect: an exposed optional tool can remain
unused when it is not instrumental to completing the user's task. Connection
and schema verification are not behavioral acceptance.

## Host-level instruction surfaces

[Codex hooks](https://learn.chatgpt.com/docs/hooks) can add developer context
from structured `additionalContext` on `SessionStart` and
`UserPromptSubmit`; `systemMessage` is only a UI/event-stream warning. Installed
plugins may bundle those hooks. [Claude Code hooks](https://code.claude.com/docs/en/hooks)
accept the same `hookSpecificOutput.additionalContext` shape: SessionStart
context appears before the first prompt and UserPromptSubmit context arrives
with that prompt as a hidden system reminder. Claude advises keeping this
context concise and factual because out-of-band imperative commands may trigger
prompt-injection defenses.

Slice 012 first shipped per-turn `UserPromptSubmit` printing (012-D2): the
forwarder prints a fixed structured reminder gated only on its existing local
`runtime.json` check and a hidden settings toggle, never waiting on the
`/v1/events` response. The same day, 012-D4 retired the per-turn print for
session-scoped delivery: Codex registers `SessionStart` and prints there once
per task (it can precede MCP readiness, which the conditional copy absorbs),
while Claude Code drops hook delivery entirely in favor of an app-owned rule
file (below).

Claude Code's user-scope rules directory (`~/.claude/rules/`) loads every
markdown file at session launch, unconditionally, with the same priority as
`CLAUDE.md` — a first-class, tool-ownable, always-on instruction channel.
The precedent is Context7's `ctx7 setup`, which installs its own rule file
(e.g. `rules/context7.md`) plus a skill at user scope, creating dedicated
files rather than appending to user documents. Lares owns `rules/lares.md`
on the `runtime.json` lifecycle: written at app start while `hostGuidance`
is on, removed at clean shutdown and uninstall, so sessions started with the
app down find nothing. Codex verified to have no equivalent — its only
user-scope instruction files are the user-owned `AGENTS.md` /
`AGENTS.override.md`, and Codex skills load on demand (the retrieval problem
again) — hence the hook split.

Event detection is settled and production-verified: both harnesses put the
event name in the hook's stdin JSON as `hook_event_name`. The daemon's
envelope validation already rejects any event without that field, and the
deterministic beats work on both hosts, so every working beat re-verifies the
field and its values. The helper prints the reminder only for the `codex`
harness when `hook_event_name` is exactly `SessionStart`, and stays silent on
anything else.

Static global instruction files are a poor plugin surface. Codex can load a
global `AGENTS.md`, but a plugin should not edit user-owned standing guidance;
Claude plugins explicitly do not load a plugin-root `CLAUDE.md`. Claude
[output styles](https://code.claude.com/docs/en/output-styles) can alter its
system prompt, but they are host-specific and replace the user's chosen style.
Pre/PostToolUse reminders bind guidance to activity rather than appraisal, and
Stop output can create continuation behavior. Neither is the first experiment.

## Patterns from other MCP servers

The MCP project's [server-instructions guidance](https://blog.modelcontextprotocol.io/posts/2025-11-03-using-server-instructions/)
treats initialization instructions as help for cross-tool workflows and
constraints, not a guarantee of general model behavior; host handling varies.
The controlled GitHub pull-request evaluation reported 85% success with
instructions and 60% without, useful improvement rather than determinism.

| Server | Adoption pattern | Relevance to Lares |
|---|---|---|
| [GitHub MCP](https://github.com/github/github-mcp-server) | Toolsets and allowlists reduce irrelevant choices. | Helps retrieval, but an emote is still not needed to finish the task. |
| [Sentry MCP](https://github.com/getsentry/sentry-mcp) | Curated debugging tools plus a Claude plugin that routes Sentry requests. | Host routing works when the user's task explicitly concerns Sentry. |
| [Sequential Thinking](https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking) | One focused tool used when the user asks for structured reasoning. | Explicit intent makes the call instrumental; Lares is ambient. |
| [Serena](https://github.com/oraios/serena) | Small bootstrap guidance with larger instructions loaded lazily. | Confirms layered guidance, but still serves task execution. |

No inspected server provides a mature exact precedent for a private-appraisal,
non-instrumental side action. The transferable lesson is to keep the MCP
contract self-contained and add the smallest host-native routing or context
surface when discovery alone does not create adoption.

## Current conclusion and open items

- **Resolved for the inspected Codex build:** the Lares MCP namespace and
  `emote` tool are exposed. A fresh task still made no call, so exposure cannot
  stand in for the live behavioral gate.
- **Chosen direction:** keep MCP instructions and tool metadata canonical, then
  test concise host-level reinforcement under slice 012. The hook must never
  appraise, select a cue, or inspect the prompt for emotion.
- **Still open:** A/B moment-coverage evidence on both hosts, now including
  long-session decay cases. Copy approved, event detection verified, and
  repetition policy resolved by 012-D4 (session-scoped delivery; per-turn
  injection retired).
- **Version-sensitive throughout:** tool-search defaults, context placement,
  output schemas, and limits must be rechecked after harness upgrades.
