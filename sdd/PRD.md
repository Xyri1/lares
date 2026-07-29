# PRD — Lares

**Artifact:** PRD · **Project:** Lares (`lar`) · **Status:** Draft v0.1 · **Date:** 2026-07-24

---

## 1. Summary

Lares is an open-source desktop companion that gives AI agents a face. A rigged Live2D character (a **Lar**) lives on the user's desktop and expresses the emotional arc of the agent sessions it watches — thinking, struggling, recovering, triumphant — through continuously driven animation parameters rather than pre-baked clips. Agents report their own feelings through a first-person emote protocol (MCP + local HTTP); deterministic hooks provide the baseline heartbeat.

Pitch line: *The Romans believed every household had guardian spirits watching over its work. They called them Lares. Your agents deserve one too.*

## 2. Problem

Agent-driven work happens out of sight. Users multitask away from the terminal or app and lack an ambient, glanceable signal for what their agents are doing, whether they are stuck, and when they need input. Existing desktop-pet solutions (Codex native pets, clawd-on-desk, agentpet, OpenPets, petdex ecosystem) all solve this with discrete state machines mapping events to pre-defined sprite animations. They communicate status but cannot express *state over time* — frustration building across repeated failures, relief after recovery, fatigue after a long session. Emotion is a richer, pre-attentively readable encoding of agent status than any badge or sprite swap, and no product in the space delivers it.

## 3. Target Users

Primary at launch: developers and AI early adopters running agent harnesses (Claude Code, Codex CLI) who discover tools via GitHub and social channels. Positioning is agent-generic from day one — "your AI's companion," not "your coding agent's companion" — anticipating the platform shift of agents into everyday-task products (ChatGPT desktop Work mode, Claude Cowork, Tencent WorkBuddy). Lares is deliberately cross-vendor: one Lar watches sessions from any harness.

## 4. Goals

1. Ship the first agent companion with **parametric, history-dependent emotion** — visibly beyond state-machine pets.
2. Establish an **open character package format** (model + expression mapping + persona) that third parties can create for.
3. Keep the integration surface so small it resists the adapter treadmill: generic hooks + a universal emote protocol.
4. Serve as a flagship portfolio artifact: polished, finished, demo-first.

## 5. Non-Goals (v1 fence)

No interactive permission bubbles. No gamification, leveling, or leaderboards. No marketplace. No observer-LLM appraisal mode. No VRM/3D rendering. No AI chat with the pet. No custom telemetry. Features on this list are not "later"; they are out until the fence is deliberately revised.

## 6. Product Principles (seeds for PRINCIPLES)

1. **Emotion is functional.** Every expressive behavior must encode agent status a human can act on. Legibility is the floor; charm is the ceiling.
2. **First-person emotion.** The agent reports its own feelings; the Lar is the agent's face, not an observer's guess.
3. **Nothing leaves the machine.** No transcripts, no telemetry, no network beyond a disclosed update check and user-initiated downloads.
4. **The LLM is the appraiser, never the animator.** Semantic judgment enters as sparse events; deterministic dynamics own every rendered frame.
5. **Character identity is portable.** The package format describes a character independent of any renderer, preserving the identity-continuity path to future vessels.
6. **Ship one renderer, keep one clean seam.** Live2D is the first stage, not the architecture.

## 7. Core Concepts

**Lar** — the on-screen character instance. v1 runs a single Lar aggregating all tracked sessions to the highest-priority state; multiple concurrent Lares are post-v1.
**Affect state** — continuous (valence, arousal) vector plus a slow-moving mood layer; evolves every frame under decay/momentum dynamics; nudged by events.
**Emote protocol** — versioned vocabulary of emotion tags with optional intensity, plus freeform expressions and temporal control, delivered through the daemon's MCP tool surface or its plain local HTTP event route (hooks invoke it via the app's bundled embedded-Node forwarder; any local HTTP client works too). Tags are whitelisted; intensities and parameters clamped; input treated as untrusted.
**Character package** — manifest bundling a model reference, tag→parameter/motion mapping, idle-modulation config, and persona metadata. Renderer-agnostic by contract.
**Session** — a tracked harness process contributing baseline states (thinking / working / awaiting-input / done / idle) via hooks.

## 8. Requirements

**R1 — Overlay.** Transparent, always-on-top, click-through-outside-body desktop window; draggable with position memory; single-instance.
**R2 — Live2D rendering.** Load Cubism models from user-selected disk locations; user-supplied model import is first-class. Default character: bundle Hiyori (Live2D official sample) under the Free Material License with its per-character terms, license text, and copyright notice — mirroring the compliance pattern of Live2D's own public sample repositories. Additional samples require their per-character terms read before bundling. VTube Studio's Akari is excluded (test-stream-only, non-commercial terms). Per-character terms read completed for Hiyori at M0 (`sdd/clearances/M0-clearances.md`).
**R3 — Affect engine.** Two-timescale dynamics (emotion half-life on the order of a minute; mood on the order of tens of minutes), event ingestion from hooks and emotes, per-frame parameter output. Must satisfy the acceptance criteria in §9.
**R4 — Emote protocol.** Two ingresses over one schema — the app-hosted MCP tool surface and a plain local HTTP event route (reached by the bundled hook forwarder or any local HTTP client) — with the protocol version pinned in the manifest. Cue-first: the agent selects from the character's available cues, falling back to freeform expressions (ad-hoc parameter compositions, range-clamped, applied ephemerally) when no cue fits. Temporal control: per-expression duration (capped) and an expression queue (depth-capped, preemptible by higher-priority events). Rate-limited and saturating (repeated identical emotes have diminishing effect); the engine owns all blending and transitions regardless of expression source.
**R5 — Harness adapters (v1 set).** Claude Code via command hooks. Codex via its official hooks framework (PreToolUse, PostToolUse, PermissionRequest, UserPromptSubmit, Stop, SessionStart, SubagentStart/SubagentStop — command handlers), with `~/.codex/sessions/` JSONL tailing as fallback; `$CODEX_HOME/config.toml` persists post-merge. Codex requires one-time user trust approval for non-managed hooks, so adapter registration guides the user through Codex's trust flow rather than enabling silently. Compatibility boundary: the merged ChatGPT desktop app's Codex mode shares the Codex home and hook surface; Chat and Work modes expose no hook mechanism and are out of scope until one exists.
**R6 — Emote adoption surface.** The MCP server's `instructions` field is the primary teaching vector (D26, Context7 pattern): crisp triggers and anti-triggers for sparse, meaningful-beat emoting, delivered automatically to every harness that registers the server; tool descriptions double as triggers. Per-harness skill/instruction files ship as reinforcement, not as the mechanism.
**R7 — Character package format.** Published schema, package validation (enforced at app import, with a repo dev script for CI use), and one fully worked example. The format document is a first-class deliverable, not internal documentation.
**R8 — Scenario player.** An in-app scenario player (plus a repo dev script) replays scripted event sequences at real or accelerated time. Golden scenarios (minimum: brutal-debugging-session, smooth-build, long-wait-for-input, recovery-arc) serve as executable acceptance fixtures and demo-recording sources.
**R9 — Minimal settings.** Character selection/import, size (Lar scale), do-not-disturb (hides the Lar; the daemon keeps tracking and mood survives the hide), position reset, launch-at-login, quit. Nothing else.
**R10 — Expression import & authoring.** Auto-import a model's bundled expressions and motions and map them to cues at character setup. Ship a Lares skill through which the user's agent authors missing expressions as `.exp3.json` files: parameter-inventory-aware, range-clamped, previewed through the daemon, user-accepted before activation. Sparse models degrade gracefully via nearest-cue affect mapping.

## 9. Emotion Acceptance Criteria

1. **History-dependence.** Identical event types yield measurably different expression under different recent history (third consecutive error visibly more dejected than the first). Failing this criterion fails the public launch (the alpha is exempt, D28).
2. **Continuity.** No parameter discontinuities; error→success transitions pass through visible relief.
3. **Temporal texture.** Idle behavior is modulated by mood (breathing rate, blink interval, sway amplitude); post-heavy-session idle is distinguishable from fresh-launch idle on sight.
4. **Decay dynamics.** Affect returns to baseline and mood drifts on their respective defined timescales, observably.
5. **Legibility.** Viewers shown recordings of only the Lar identify working / stuck / needs-input / done at high accuracy (target ≥80%, informal panel acceptable for v1).

All five criteria must pass on hook-driven baseline events alone — zero agent emotes (D26). First-person emotion enriches the floor; it never carries it.

## 10. Non-Functional Requirements

Event-to-visible-reaction latency ≤250ms on the hook path. Hook invocations add negligible latency relative to agent tool round-trips (bundled embedded-Node forwarder against the loopback event route). Renderer targets 30fps. Idle resource footprint low enough to run all day unnoticed — a soft target; optimization is explicitly not a v1 focus. Fully offline-capable. Update check against GitHub releases, disclosed in settings and docs.

## 11. Platforms & Distribution

macOS and Windows at launch (Windows is where the largest community for this category lives); Linux best-effort after. Shell: Electron — the pattern every shipped Live2D desktop overlay uses — with a frameless transparent always-on-top window, forwarded-event click-through, and known care items (create-hidden-show-after-paint, screen-edge spawn/clipping handling, premultiplied-alpha verification on both OSes). Distribution: per-OS native installers attached to GitHub Releases plus a one-line install script (`curl | sh` on macOS/Linux, PowerShell `irm | iex` on Windows — the Claude Code native-install pattern); nothing publishes to npm (D30). Homebrew cask candidate post-launch. README bilingual (en, zh-CN) from day one, neither language preferred; launch surfaces span GitHub/HN/X and CN channels (Rednote), with channel prioritization decided at launch planning after v1 completion.

## 12. Success Metrics

No telemetry of any kind; the disclosed update check against GitHub releases is the only network touch. No formal success gates, phase-2 tripwires, or kill criteria are defined for v1 — measurement is deliberately deferred. GitHub-side signals (stars, release download counts) remain passively available. Ecosystem pull (third-party character packages, community adapter PRs) is the signal the project cares about qualitatively, without numeric targets.

## 13. Phase 2 Horizon (context, not commitment)

A paid character-creation service (VRM/3D, agent-driven production pipeline) monetizing character identity continuity: the same Lar, in a bigger body, usable beyond the desktop. Phase 2 constrains v1 only through Principle 5 (portable identity in the package format). Nothing else from Phase 2 exists in v1. Separately, agent-generated model creation is in scope post-v1; its generation skill also directs the agent to author the character's pre-baked expression set, so generated characters ship with full cue coverage rather than relying on gap-filling.

## 14. Open Questions

1. Hiyori was read and cleared at M0 (`sdd/clearances/M0-clearances.md`). Haru's additive per-character, exact-artifact, notice, and sound-data clearance remains a slice 010 packaging gate (D19/010-D7).
2. ~~Cubism Core distribution mechanics (user-loaded vs bundled per Live2D's redistribution terms).~~ Resolved at M0 — bundled with notice, Core kept out of the Apache-2.0 repo (D20).
3. Emote tag vocabulary v1 (proposal to be made in SPEC).
4. ~~Cubism 5 runtime coverage.~~ Resolved by the slice 010 compatibility boundary — v1 supports VTS-style Cubism 3/4 assets only; Cubism 2.1 and Cubism 5 are explicitly rejected, with no SDK-swap tripwire (D24/010-D1).
5. Whether Work-mode/Cowork-class consumer surfaces gain a hook mechanism (tracked, not blocking).

## 15. Downstream Artifacts

DECISIONS: seed with stack (Live2D-first, renderer-agnostic manifest), shell (Electron), naming (Lares/`lar`), domain (lares.io), non-goals fence, telemetry stance. SPEC: affect engine contract, emote protocol schema, package manifest schema, adapter behaviors — with GIVEN/WHEN/THEN acceptance scenarios. ROADMAP: M0 license reads → render harness → engine+simulate (gate) → overlay chrome → adapters+protocol → package format → polish → launch.
