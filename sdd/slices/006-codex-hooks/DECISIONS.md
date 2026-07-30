# Slice 006 — Codex hooks · DECISIONS

Slice-scoped forks. The load-bearing decision — user-level
`~/.codex/hooks.json` written by the app, plugin keeps MCP,
fold-back tripwire on Codex shipping plugin-hook execution — was made
at root (D15 as amended, chosen by the maintainer during the 005
live smoke: "if `plugin_hooks` is hidden in the UI, maybe intentional
by OpenAI, then we should design around it"). This file records only
what executing that decision forked.

---

**006-D1 — The Codex writer reuses the Claude Code discipline, not
the Claude Code file semantics.** *Chosen:* content-recognition
(command references `lares-forwarder`), remove-and-append re-sync,
parse-abort, backup-once, atomic write — identical machinery. One
deliberate divergence: the writer MAY create `hooks.json` when
`~/.codex/` exists, because the file is additive user config with a
documented shape, unlike `~/.claude.json` (harness-owned internal
state, never created — 005-D2). Mechanics pinned at the grilling:
backup only when the file pre-existed; removal deletes the file when
only Lares entries remained. *Rejected:* whole-file ownership
(users can hold their own Codex hooks; merge-preserve is the field
convention 005-D1 already established). *Status:* decided
by the maintainer.

**006-D2 — Hook entries are the plugin's entries, verbatim.**
*Chosen:* the user-level entries duplicate the plugin's bundled
`hooks/hooks.json` content exactly — same events, same shim
invocation (005-D8/D9 forms). One source of truth for the shape: the
writer imports the committed plugin file rather than restating it, so
the fold-back tripwire (D15) is a deletion, not a migration.
*Rejected:* a second hand-maintained entry set (drift by
construction). Shape identity was verified against upstream
`discovery.rs` and by live execution on codex-cli 0.145.0; a
*semantic* divergence surfacing later is a stop-and-re-grill, not an
improvisation. *Status:* decided by the maintainer.

**006-D3 — The plugin keeps its dead hooks.json in-repo.** *Chosen:*
the bundled `hooks/hooks.json` stays committed and installed even
though current Codex never executes it: it costs nothing at runtime,
it keeps the A4-class contract test honest against the recon'd shape,
and the D15 fold-back becomes "delete the writer" instead of "rebuild
the plugin." Known wart, accepted — and smaller than first drafted:
the trust review is a single session-start prompt with trust-all, so
the user sees the Lares entries listed twice (plugin's inert copy +
live user set) and clears both with one keystroke; the guided wording
explains the duplication. *Rejected:* stripping hooks from the
plugin (re-adding them later re-triggers trust churn for every
installed user). *Status:* decided by the maintainer.

**006-D4 — Failure branches pre-authorized.** *Chosen:* if user-level
hooks fail to execute on *both* installed channels (standalone CLI and
desktop-bundled), Codex baseline sensing is unsupported (P11): no
writer ships, A4 is reworded to Claude-Code-only baselines plus
both-harness emotes, ROADMAP records M3b closed-with-exception, and
the D15 tripwire gains "Codex ships any working hook execution ⇒
reopen." If hooks work on one channel only, the writer ships, the
live gate runs on the working channel, and M3b closes non-degraded
with the split recorded. *Rejected:* leaving the degraded close as a
risks bullet contradicting the SPEC's exit gate (a gate rewrite hiding
in the margins); inventing a third sensing mechanism (P11). Standalone
0.145.0 execution was verified live, so only the
desktop-bundled half of the trigger remains reachable. *Status:*
decided by the maintainer.
