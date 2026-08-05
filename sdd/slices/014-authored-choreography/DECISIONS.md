# Slice 014 — Authored choreography · DECISIONS

**Artifact:** Slice decisions · **Slice:** 014-authored-choreography ·
**Status:** Accepted for implementation · **Date:** 2026-08-05

This slice promotes the accepted 013-E5 Haru evidence into production. It
does not change the model-facing `feel()` action or the P6 performance feed.

---

**014-D1 — Complete authored phrases are the body-performance basis.**
*Chosen:* a character author explicitly maps VAC corner directions to complete
renderer-local motions. The motion keeps its authored parameter curves, Part
switches, phase relationships, and physics excitation. `[V,A,C]` selects and
modulates that material; it never generates joint trajectories. *Rejected:*
the E1 independent-parameter generator; mapping asset filenames or bundled
emotion labels automatically; letting the agent choose a motion. *Rationale:*
E1–E4 isolated the mechanical failure, and the maintainer accepted E5's
whole-body quality as the production floor. *Status:* decided by maintainer
direction.

**014-D2 — Renderer-local corner map; no phrase taxonomy.** *Chosen:*
`renderers.live2d.choreography` contains one required registered-motion
fallback and optional explicit mappings for the eight existing corner keys.
Each entry is only `{ group, index }`. Missing or ambiguous directions use the
fallback. There is no new phrase ID layer, physical-quality ontology, emotion
name, duration, per-motion gain, or loose-file reference in this slice.
*Rejected:* top-level renderer-neutral asset references (violates P5); a new
cross-renderer phrase vocabulary before a second renderer exists; copying
motion duration already owned by the asset; accepting every discovered motion
as eligible. *Rationale:* anchors above the renderer still own identity and
semantic direction, while the Live2D block owns their physical realization.
The smallest explicit map prevents filename inference and is enough for Haru.
*Status:* decided for slice implementation.

**014-D3 — One uniquely dominant corner or the fallback.** *Chosen:*
reuse slice 013's projected trilinear corner weights. A phrase maps to a corner
only when exactly one weight is greater than `0.5`; otherwise the configured
fallback plays. Exact corner rays therefore retain the same phrase at half and
full magnitude, while axis-only and tied directions never borrow an arbitrary
extreme. *Rejected:* sign-only octants (zero axes invent valence/control);
random or weighted corner selection (one observed phrase can overstate an
ambiguous tuple); blending unrelated motion curves; authoring all 125 tuples.
*Rationale:* the continuous scalar pose already expresses every tuple. A
discrete phrase is an accent and must be omitted in favor of a neutral physical
fallback when its direction is not uniquely supported. *Status:* decided for
slice implementation.

**014-D4 — Magnitude is commitment; activation is motion energy.** *Chosen:*
`m=max(|v|,|a|,|c|)` remains the commitment signal. `m=1` reaches the full
character-safe phrase; half-magnitude input remains visibly intermediate.
Motion displacement uses E5's `0.5+0.5m`, and tempo uses `1+0.15a`, with
normalized activation `a`. The configured fallback at semantic neutral plays
at untouched `1×` displacement and tempo. *Rejected:* numeric rig extrema;
uniform exaggeration beyond the authored phrase; a model-facing intensity;
equating low activation with weak expression. *Rationale:* the complete E5 set
passed at these bounds, including quiet fully committed corners. *Status:*
decided by maintainer direction; these are fixed renderer constants rather
than new semantic inputs or installed configuration.

**014-D5 — Production expressiveness is fixed at one.** *Chosen:* remove
the installed app-config `expressiveness` setting. Production always evaluates
the slice-013 anchor map at `k=1`; an explicit dev-panel preview may still
attenuate or exaggerate for calibration without changing the latch or app
configuration. *Rejected:* a production value below one (contradicts maximum
input → maximum commitment); values above one (non-uniform clipping distorts
authored poses); a second user or character intensity control. *Rationale:*
tuple magnitude already carries commitment, and E5 is the accepted calibrated
envelope. *Status:* decided for slice implementation; supersedes 013-D10.

**014-D6 — A phrase runs once per displayed-feel change.** *Chosen:* a
new displayed tuple eases its persistent target, waits the E5-readable
`1200 ms` onset delay *(a fixed renderer constant including the 700 ms
transition)*, then plays one mapped phrase for exactly one authored cycle.
Managed playback ignores an asset's loop flag and is bounded by its authored
duration. An identical tuple does not retrigger it. A latched tuple does not
periodically replay; blink, breath, sway, physics, and the phrase's settled
Part pose keep the body alive. Character commit schedules the current latch
once on the new body. *Rejected:* random repetition;
per-turn/lifecycle triggers; phrase queues; treating elapsed time as renewed
emotion; trusting a looping asset to emit a finish event. *Rationale:* one
phrase matches the accepted E5 stimulus, attracts
attention at a real change, and preserves P8's clockless semantic latch.
*Status:* decided for slice implementation.

**014-D7 — Motion owns the body temporarily; the feel target owns the face.**
*Chosen:* while a managed phrase plays, its complete body curves and Part
selection win; the current feel target continues to write its six facial
channels. Motion displacement scales before physics and pose. On completion or
interruption, body parameters ease from their actual live values into the
current persistent target over a fixed `700 ms` without snapping. Normal
completion preserves the motion's settled Part drawing. Any later
interruption, new tuple, loud operational overlay, failed start, or `feel=null`
eases Parts back to the character defaults during the same settle before
another phrase may play. `awaiting_input` or `error` cancels pending/active
choreography and makes the full operational overlay win; clearing it schedules
the unchanged non-null feel once.
*Rejected:* independent per-channel motion ownership; allowing a phrase to
erase the reported face; returning to rig neutral; allowing affect animation
to mask a P10 overlay. *Rationale:* this is the E5 ownership split, extended to
interruptions and operational priority. *Status:* decided for slice
implementation.

**014-D8 — Haru's quiet gaps ship; new motion authoring is optional.** *Chosen:*
`+-+` uses `Idle[2]` and `---` uses `Idle[0]`. Their face and persistent posture
carry commitment; the maintainer accepted both in the E5 set. New composed-calm
or slump/withdrawal assets may improve Haru later but do not block this slice.
*Rejected:* forcing unrelated stock gestures into those corners; adding an
affect axis to compensate for missing art. *Status:* decided by maintainer
acceptance of E5.

**014-D9 — Lar–harness binding is deferred, not absorbed.** *Chosen:* authored
choreography takes slice number 014. One-Lar-per-harness binding, hibernation,
and wake move to the future unnumbered `0xx-lar-harness-binding` slice. *Status:*
decided by maintainer direction.
