# Slice 012 — Host guidance reinforcement · DECISIONS

**Artifact:** Slice DECISIONS · **Slice:** 012-host-guidance ·
**Status:** Four decisions accepted; implemented through I3; G1 open ·
**Date:** 2026-08-01

**012-D1 — Add host-level instruction as a second emote-adoption vector.**
*Chosen:* supported Lares plugins will deliver a concise model-visible standing
reminder through a host-native instruction surface. MCP initialization and the
`emote` metadata remain the canonical behavior contract; the host reminder
only keeps that contract salient during ordinary work. The model still
appraises its own work and deliberately chooses whether and how to call
`emote`. Hooks never inspect the prompt for emotion, choose a cue, infer from
activity, or fake a call. `UserPromptSubmit.additionalContext` is the leading
cross-host experiment because both current hosts support the same structured
output and both plugins already own that event. The exact event, copy,
availability handshake, response ownership, and repetition policy remain open
until an implementation plan is accepted. *Rejected:* continuing with MCP-only
guidance after confirmed exposure but no call in a fresh representative task;
an ambient skill; edits to global agent instructions; Claude-only output
styles; per-tool or Stop reminders; host-specific subagent routing; any
observer, transcript, prompt, or reasoning inference. *Rationale:* delivery is
not adoption. Lares is an ambient, non-instrumental action, so mature MCP
discoverability patterns do not naturally pull it into task execution. Both
supported hosts already provide a consented plugin hook channel that can place
brief context at the model boundary without moving appraisal out of the model.
*Status:* decided by the maintainer 2026-08-01; supersedes 011-D9 and D26 only
where they prohibited all model-visible hook guidance. Event, gating, toggle,
and scoring settled the same day by 012-D2 and 012-D3; copy approved
2026-08-01 (text in slice SPEC §3); disclosure remains open. No runtime
behavior has changed.

**012-D2 — Static, helper-local delivery with a hidden settings toggle.**
*Chosen:* the shared forwarder prints the fixed reminder as structured
`UserPromptSubmit` output only when its existing local `runtime.json` check
passes and the toggle is on. The toggle lives in the app's `config.json`
(default on, never exposed in the UI) and is mirrored into `runtime.json` at
its existing write site, because the helper runs as plain Node and already
reads exactly that file; old helpers ignore the extra key. Emission never
waits on the `/v1/events` response — the round trip stays for the heartbeat,
so the reminder cannot lose the helper's 500ms budget and delivery is
deterministic per turn. The copy ships inside the helper and updates with the
app. A/B evaluation toggles the setting, never the hook registration, so
deterministic events flow identically in both arms. *Rejected:* response-body
delivery gated on daemon acceptance (couples injection to the app, loses a
race under load, and forces an "accepted" definition the route cannot honor);
a mailbox file (staleness and per-session bookkeeping before any measured
need); disabling the hook as the A/B lever (also silences heartbeat events,
confounding the arms); exposing the toggle in the UI. *Rationale:* the
reminder needs only "Lares is present," which the helper already knows from
disk; every removed moving part makes the A/B cleaner. Accepted costs: no
history-aware repetition policy yet (the response-body seam stays available if
per-turn proves noisy), and a stale `runtime.json` after a crash may inject an
orphan reminder, which the conditional copy and the MCP contract's silent
failure handling absorb. *Status:* decided by the maintainer 2026-08-01.

**012-D3 — Loose instruction, moment-scored gate.** *Chosen:* the injected
copy stays principle-shaped — report genuine appraisal shifts — with no
per-task quota and no case-specific trigger examples. The behavioral gate
scores coverage of designed emote-worthy moments across A/B arms, with zero
ineligible calls; failures update the test matrix or delivery timing, not the
copy, unless the principle itself is ambiguous. *Rejected:* "at least one
emote per task" as instruction or gate (rewards one ritual call that
discharges the duty, after which real shifts read as already covered);
accumulating per-case wording patches (rebuilds the phrase-trigger list D26
rejects, brittle in every language not patched). *Rationale:* the emote signal
is informative only because it may be absent; count-shaped and case-shaped
instructions optimize obedience, not appraisal. *Status:* decided by the
maintainer 2026-08-01.

**012-D4 — Session-scoped delivery: Claude Code rule file, Codex `SessionStart`; per-turn injection retired.**
*Chosen:* both harnesses deliver the approved copy once per session, present
iff the app was alive at session start, through each host's native
standing-instruction channel. Claude Code: the app owns
`~/.claude/rules/lares.md`, written at startup and removed at clean shutdown
and uninstall — the `runtime.json` lifecycle — because rule files load at
session launch with `CLAUDE.md` priority and a tool-owned rule file is the
precedented pattern (Context7's `ctx7 setup` ships one). Codex: no rules
directory exists, so the plugin registers a `SessionStart` hook and the
forwarder prints the same structured context there; the `UserPromptSubmit`
print is removed on both harnesses. One copy, byte-identical in both channels
and pinned by a consistency test; `hostGuidance` gates both; the conditional
wording absorbs crash-stale files and contexts. *Rejected:* keeping per-turn
`UserPromptSubmit` injection (identical text every turn accumulates in
transcripts and invites habituation — maintainer judgment: bad practice);
editing user-owned `AGENTS.md`/`CLAUDE.md` (ownership unchanged from 012-D1);
a Codex rules-equivalent (verified absent); asymmetric channels kept to
protect an unmeasured "working" arm (anecdote is not the gate). *Rationale:*
symmetry — the same session-scoped contract on both hosts — plus the highest
salience placement Claude Code offers, at zero repetition cost. Known shared
risk: launch-time delivery decays over very long sessions; per-turn
`UserPromptSubmit` remains the documented revert, and G1 gains a long-session
case per host. *Status:* decided by the maintainer 2026-08-01; supersedes
012-D2's event choice; delivery gating and A/B toggle semantics of 012-D2 and
the moment-scoring of 012-D3 stand.
