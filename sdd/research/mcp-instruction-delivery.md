# How MCP server instructions reach an agent

Research for slice 011 (`sdd/slices/011-interjection/`), 2026-07-31. Sources are
the MCP specification, first-party Claude Code and Claude API documentation, and
the `openai/codex` source and issue tracker. This is **version-sensitive**:
harness behavior here changed within the last year and one item below is
explicitly unverified against the builds D15 pins. Re-read before relying on it
after a harness upgrade.

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

The hook path never touches this. The bundled forwarder reads stdin, POSTs
`/v1/events`, and exits; it emits no context and cannot speak to the agent.
Hooks feed the daemon; `instructions` feeds the model.

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
disproved.

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

## Open items

- **Unverified: which Codex builds actually consume `server_instructions`.** The
  support landed after #6148 closed; the builds D15 pins from the M3b smoke
  (0.146.0-alpha.3.1, 0.134.0) may predate it, in which case Lares'
  `instructions` were invisible on Codex during that gate and only the skill and
  tool names carried adoption. Check against the maintainer's installed binary
  before crediting Codex with instruction delivery.
- **Not measured: whether a semantic disposition changes behavior.** Every
  claim here is about delivery mechanics. Whether an agent discovers the tools
  and voluntarily reports an appraisal is slice 011's behavioral gate, not a
  documented fact.
- **Version-sensitive throughout.** Tool-search defaults, the 2KB cap, and the
  Codex mapping are all current-build observations. Re-read after any harness
  upgrade that touches MCP.
