# PRINCIPLES — Lares

**Artifact:** PRINCIPLES · **Project:** Lares · **Status:** Living · **Date:** 2026-08-03

Cross-cutting invariants. Every slice doc set and PR is checked against these; a change that violates one is wrong even if it works. Amendments require an explicit DECISIONS row.

---

**P1 — Emotion is functional.** Every expressive behavior encodes agent status a human can act on; legibility is the floor, charm is the ceiling. *Teeth:* a proposed animation or behavior that cannot answer "what does this tell the user about their agents?" is rejected. Root §9 / 013-S6 axis legibility at normal Lar size is the standing visible test.

**P2 — First-person emotion.** The agent reports its own affect; the Lar is the agent's face, not an observer's guess. *Teeth:* no component reads transcripts, infers sentiment, or appraises on the agent's behalf. Semantic judgment enters only through an agent's valid `feel()` report; harness events carry operational facts, never emotion.

**P3 — Nothing leaves the machine.** *Teeth:* no telemetry, no transcript egress, no third-party services. The disclosed GitHub-releases update check is the sole permitted network touch beyond user-initiated downloads. Any PR adding an outbound call fails review by default.

**P4 — The LLM appraises, never animates.** Deterministic mapping and renderer mechanics own every rendered frame. *Teeth:* the render loop must be provably independent of inference: no await on model output anywhere between an accepted `feel()` report and a parameter write. The model supplies only the three-axis appraisal; it never selects poses, parameters, transitions, or timing.

**P5 — Character identity is portable.** Identity — name, persona, performance semantics, anchors — lives above any renderer; runtime specifics live in renderer blocks. *Teeth:* a schema change that moves identity or semantic channel poses into a renderer block is rejected; the paper-check is "could a VRM block implement this character without touching the spine?"

**P6 — One implementation, one clean seam.** The seam is the brain↔body performance feed (D31): the brain (sessions, feel register, protocol) contains no renderer knowledge; the body subscribes to `{ feel, operational }`, maps it through renderer-neutral channels and character anchors, then translates channels for its renderer. Ship a single body — Live2D behind the runtime interface — as the YAGNI discipline; the feed is the insurance policy for future bodies (3D). *Teeth:* renderer parameters or asset references crossing the feed fail review; brain code importing anything body-side fails review.

**P7 — Untrusted by default.** All ingress — hook events, `feel()` reports, physical previews, imported packages — is validated and bounded server-side as its contract requires. *Teeth:* nothing received over any ingress is executed; invalid `feel()` calls fail atomically without changing the latch; preview parameters clamp to the body inventory; report spacing and package bounds are enforced in the daemon. Client-side validation is UX, never security.

**P8 — Emotional history belongs to the agent.** Lares preserves the agent's latest first-person appraisal; it does not synthesize emotional history from events, time, or animation state. The renderer is deliberately memoryless: identical `(feel, anchors)` inputs produce the same target. *Teeth:* root §9 continuously assesses meaningful report movement across changing tasks without ritual duplicates; adding decay, mood, hook-derived emotion, or path-dependent interpretation is a regression.

**P9 — The fence holds.** The D03 non-goals (no permission bubbles, gamification, marketplace, observer mode, VRM, pet chat, telemetry) bind until explicitly revised. *Teeth:* fence-crossing work requires a new DECISIONS row approved before code, not after.

**P10 — Aggregate loudly.** One Lar, all sessions: baseline state resolves by actionability (needs-input > error > working > done > idle), so the most useful signal always wins the face. *Teeth:* no aggregation change may cause a needs-input session to be visually masked by any lower-priority state.

**P11 — Push-only sensing.** Lares senses what harnesses tell it, never what it scrapes: every input crosses the §2 ingress as an event or tool call some process chose to send. *Teeth:* no component reads harness-owned files, polls harness state, or watches another program's artifacts — session logs, config files, process tables. A harness with an unreliable or absent hook surface is unsupported, not worked around; a "just tail the log" change fails review. (Adopted 2026-07-27 with slice 005, amending D15.)
