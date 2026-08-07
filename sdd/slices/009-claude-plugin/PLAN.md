# Slice 009 — Claude Code plugin · PLAN

Execution notes; disposable after the gate closes.

---

## 1. Prelim research (settled during the grilling)

Fetched live from code.claude.com/docs (plugins, plugins-reference,
plugin-marketplaces) and developers.openai.com (plugins/build):
plugin anatomy and dialects confirmed on both sides — manifest dirs
(`.claude-plugin/` vs `.codex-plugin/`), `.mcp.json` wrappers
(`mcpServers` vs flat/`mcp_servers`), hook event sets, marketplace
manifests (`.claude-plugin/marketplace.json` vs
`.agents/plugins/marketplace.json`), and the load-bearing behavioral
difference: Claude Code executes plugin hooks; Codex trust-reviews
but does not (D15 live finding). No hardcoded `mcp__lares__` tool
names exist anywhere in the repo, so the plugin-scoped MCP rename
(`mcp__plugin_lares_…`) is cosmetic.

**Watch item — resolved (§3):** current OpenAI docs phrase
plugin hooks as "skipped *until* the user reviews and trusts" —
implying post-trust execution, contradicting the prior live
smoke. The maintainer re-smoked: hooks executed. The D15 fold-back
tripwire fired.

## 2. Implemented

- `plugins/lares` → `plugins/codex` (marketplace path, hooks.ts
  import, tests updated; plugin *name* unchanged in both
  marketplaces).
- `plugins/claude-code/`: manifest, nine-event `hooks/hooks.json`
  (shim command with `$PPID`, `Notification` matcher
  `permission_prompt`), wrapped `.mcp.json` (baked 21473), README
  with install/uninstall; root `.claude-plugin/marketplace.json`.
- Both plugins ship the same harness-neutral
  `skills/emoting/SKILL.md` (fence lift).
- `adapters/codex/shim.ts` → `adapters/shim.ts`
  (`writeForwarderShim`): harness argument, win32 dual files per
  009-D5.
- `adapters/claude-code/writer.ts`: registration deleted, removal
  kept; `syncAdapters` runs it as legacy cleanup with a
  plugin-install pointer in the log line; helpers still shared with
  the Codex hooks writer and uninstall.
- Tests: plugin artifact suites for both dirs, shim variants, cleaner
  behavior; forwarder end-to-end now drives *both committed plugin
  artifacts'* real hook commands through the real shells (Git Bash
  path for Claude Code). 313 pass.

## 3. Codex fold-back (tripwire fired)

The maintainer's live re-smoke confirmed plugin-bundled hooks execute after
trust review, so D15's standing fold-back ran within this slice, as a
deletion per 006-D2: `syncCodexHooks` and the user-level
`~/.codex/hooks.json` writer are gone; `removeCodexHooks` stays as
the launch-time legacy cleaner and uninstall pass (mirror of the
Claude Code demotion, 009-D2). The plugin's committed
`hooks/hooks.json` — inert since 005 — is now the live delivery.
Plugin README rewritten (no more double-listing note: the app writes
no user-level copy, so trust review lists the Lares entries once).

## 4. Live gate — rides 008 A8/A9, once

Clean-machine run now includes: tray Configure + explicit consent
(the same marketplace add + plugin install CLI operations) → restart
→ hooks trust/enable → baseline states +
emote over the plugin MCP entry → app uninstall leaves only the
user-removable plugin (README documents `/plugin uninstall`).
Pre-009 upgrade check on any machine that ran an older build: launch
once, confirm the legacy settings block and `mcpServers.lares` are
gone.

**PASS (maintainer-confirmed 2026-08-07).** The folded clean-machine
gate closed with 008 A8/A9.
