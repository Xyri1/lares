# PRINCIPLES — Lares

**Artifact:** PRINCIPLES · **Project:** Lares · **Status:** Living · **Date:** 2026-07-24

Cross-cutting invariants. Every slice doc set and PR is checked against these; a change that violates one is wrong even if it works. Amendments require an explicit DECISIONS row.

---

**P1 — Emotion is functional.** Every expressive behavior encodes agent status a human can act on; legibility is the floor, charm is the ceiling. *Teeth:* a proposed animation or behavior that cannot answer "what does this tell the user about their agents?" is rejected. The §9 legibility criterion (pet-only recordings, working/stuck/needs-input/done identifiable) is the standing test.

**P2 — First-person emotion.** The agent reports its own affect; the Lar is the agent's face, not an observer's guess. *Teeth:* no component reads transcripts, infers sentiment, or appraises on the agent's behalf. Semantic judgment enters the system only as events the agent (or its harness) emitted.

**P3 — Nothing leaves the machine.** *Teeth:* no telemetry, no transcript egress, no third-party services. The disclosed GitHub-releases update check is the sole permitted network touch beyond user-initiated downloads. Any PR adding an outbound call fails review by default.

**P4 — The LLM appraises, never animates.** Deterministic dynamics own every rendered frame. *Teeth:* the render loop must be provably independent of any inference: no await on model output anywhere between event ingestion and parameter write. LLM involvement is limited to emitting events (runtime) and authoring assets (setup-time, D25).

**P5 — Character identity is portable.** Identity — name, persona, emotional semantics, cues — lives above any renderer; runtime specifics live in renderer blocks. *Teeth:* a schema change that moves identity or semantics into a renderer block is rejected; the paper-check is "could a VRM block implement this character without touching the spine?"

**P6 — One implementation, one clean seam.** The seam is the brain↔body performance feed (D31): the brain (sessions, affect, protocol) contains no renderer knowledge; the body subscribes to a renderer-neutral feed (affect, baseline state, cue-level expressions, beats, opaque knob data) and translates it for its renderer. Ship a single body — Live2D behind the runtime interface (D08 contract; load / parameter inventory / batch parameter writes / expression with weight and duration / motion / hit-test) — as the YAGNI discipline; the feed is the insurance policy for future bodies (3D). *Teeth:* renderer-specific data crossing the feed fails review (cue names cross, asset references don't); brain code importing anything body-side fails review. Accepted leak: freeform knob sets are composed against the active body's reported inventory (D31).

**P7 — Untrusted by default.** All ingress — hook events, emotes, freeform expressions, imported packages — is validated, clamped, and rate-bounded server-side. *Teeth:* nothing received over any ingress is ever executed; parameters clamp to model-declared ranges; caps (intensity, duration, queue depth, rate) are enforced in the daemon regardless of client behavior. Client-side validation is UX, never security.

**P8 — History over events.** The same event under different recent history produces different expression; this is the anti-state-machine invariant and the product's reason to exist. *Teeth:* §9's history-dependence criterion blocks the public launch (D28: the alpha may ship at the best passing rung of the M2 retreat ladder — every rung keeps expression a function of accumulated affect history). A refactor that makes expression a pure function of the latest event is a regression even if every scenario still "plays."

**P9 — The fence holds.** The D03 non-goals (no permission bubbles, gamification, marketplace, observer mode, VRM, pet chat, telemetry) bind until explicitly revised. *Teeth:* fence-crossing work requires a new DECISIONS row approved before code, not after.

**P10 — Aggregate loudly.** One Lar, all sessions: baseline state resolves by actionability (needs-input > error > working > done > idle), so the most useful signal always wins the face. *Teeth:* no aggregation change may cause a needs-input session to be visually masked by any lower-priority state.
