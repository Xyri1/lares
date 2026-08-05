# 013-E2 — Can a human viewer read the body-generator's signal?

**Artifact:** Experiment report · **Slice:** 013-feel · **Status:** Deterministic
work complete and verified; human viewing not yet run · **Date:** 2026-08-04

Bounded, reversible follow-up to
[013-E1](./013-E1-body-generator.md). Changes no contract: `feel()`'s
arguments, scale, latch semantics, and session behaviour are untouched;
there is no fourth affect axis, no V/A/C→named-clip mapping, no shipped
onset accent, and no character-package or SPEC edit. Everything new is a
dev-only capture harness and two participant-facing static pages, inert
until a real person opens them.

**Revised 2026-08-04, pre-collection, after review.** Three blockers were
fixed before any human response exists: (1) exports are now
session-scoped and the analyzer deduplicates and scores one response per
unique participant/trial with a 12-unique-participant gate; (2) the
attention task now shows the Lar at the product's normative size, scores
latency on the video clock, varies onset timing across rounds, and uses
fixed balanced digit sequences scored as target hit rate plus false
alarms; (3) the activation face-restored pair now differs from its
body-only pair by the facial channels alone. Details inline below; the
affected clips and manifest were regenerated and re-frozen, still before
any viewing.

---

## 1. Hypothesis and scope

013-E1 established, deterministically, that `[V, A, C]` can drive a
coherent, measurably distinct body performance on Haru's rig. It could not
establish whether a human viewer actually reads that performance as
energy, control, or pleasantness, or notices it at all in peripheral
vision — that gate was explicitly left open. This experiment:

1. **Calibrates** which of Haru's head/torso/arm/bust controls are
   actually visible at the normative 400px Lar height, from direct
   observation rather than parameter names (§2).
2. **Freezes** three controlled, label-masked A/B pairs — activation,
   control-at-matched-valence/activation, valence-at-matched-activation/
   control — each in a body-only and a face-restored presentation, plus
   an ease-vs-accent onset matrix at three onset times, before any human
   sees them (§3).
3. **Builds and click-tests** the collection kit: a masked forced-choice
   viewer for the six semantic pairs and a separate focal-task viewer for
   peripheral noticeability (§§4–5).
4. **Stops** at that kit. No human responses were collected in this task
   — see §9 for why, and §12 for exactly what to do next.

Separating semantic legibility from noticeability is a design constraint
carried over from 013-E1's brief: passing the attention test (Phase 6)
does not prove emotional meaning (Phases 3–5), and the two are scored,
reported, and gated independently below.

**Decisions not reopened** (unchanged from 013-E1): the `[V, A, C]`
contract; no fourth axis; no tuple→named-emotion mapping; no inference
from events/transcripts/hidden state; the semantic target stays latched
while procedural movement continues around it; `[V, A, C]` selects and
blends whole body-performance profiles; waveform/phase/lag/asymmetry/
preferred-body-part are character-authored motion grammar, not semantics;
this experiment authorizes no new channel and no onset accent for
shipping. No root PRD/SPEC/PRINCIPLES/DECISIONS/package-format change is
authorized or made.

---

## 2. Phase 1 — Rig calibration

Extended the existing capture harness (`harness/page.html`, reusing its
model-loading, recording, and still-capture code — no second harness) with
a raw-rig sweep mode: every parameter except the one under test holds at
its **rig-authored default** (not the feel pipeline's neutral), the named
id sweeps slowly through held steps (~0.67s each, 7 steps full range / 3
steps for the confirmatory arm-B sweep), captured at the normative 400px
Lar height with no RNG anywhere in the path. Full literal record, including
the images actually read:
[`evidence/calibration/record.md`](./evidence/calibration/record.md).

| control | id(s) | visible meaning (observed, not inferred from the name) | 400px legibility |
|---|---|---|---|
| head yaw | `PARAM_ANGLE_X` | turns; more of one cheek/ear becomes visible | subtle, static-hold |
| head pitch | `PARAM_ANGLE_Y` | chin droops/lifts | subtle, static-hold |
| head roll | `PARAM_ANGLE_Z` | tilts; twin-tails swing asymmetrically | best of the three head axes |
| torso yaw (shipped sway) | `PARAM_BODY_ANGLE_X` | whole upper body shifts laterally | modest, deliberately gentle by design |
| torso pitch ("lean") | `PARAM_BODY_ANGLE_Y` | **clearest torso axis** — reads as forward/back via an apparent size/position change | good, matches SPEC's `lean` semantics |
| torso roll | `PARAM_BODY_ANGLE_Z` | lateral shift, visually similar to torso yaw held-static | present, not distinguishable from `_X` alone |
| arm A (L/R) | `PARAM_ARM_{L,R}_A` | **hand-on-hip ↔ arms-at-sides ↔ tucked-in**, continuously graded, mirrored L/R | **excellent — the single most legible control on the rig** |
| arm B (L/R) | `PARAM_ARM_{L,R}_B` | **confirmed dead** — zero visible change, full range | N/A, hidden by `haru.pose3.json`'s opacity-exclusive part group |
| bust | `PARAM_BUST_Y` | **not visibly useful** — no visible chest movement even under 4× zoom, full range | N/A |

Two findings that revise 013-E1's assumptions going into the human phase:

- **The arm-A finding is confirmed by eye, not just by trace.** 013-E1
  inferred "−1 hands-on-hips, 0 elbows-away, +1 tucked" from the .motion3
  curves; this calibration watched the actual rendered gradient and it
  holds exactly, continuously, with no dead zone.
- **`PARAM_BUST_Y` is dead weight.** 013-E1's chest-lift writer moves a
  real rig value that is not perceptible on screen at this camera framing.
  It costs nothing to keep (breath already rides on top of it) but should
  not be credited with legibility it does not have.
- Static-hold legibility is not the same claim as legibility under
  continuous oscillation — see the calibration note in
  `record.md` on why the generator drives the head/torso writers as
  motion rather than a held pose, and why that gap is exactly what the
  human phase below has to resolve, not this one.

---

## 3. Phase 2 — Frozen stimuli

Extended `harness/page.html`'s existing spec/trace/record pipeline (still
one harness): added a `spec.profile` override so a stimulus can bypass the
anchor blend entirely, and a `stillAt` parameter on `record()` for the
calibration sweep's held-step stills. **013-E1's `extent =
swayAmplitude`-reuse conflation is fixed for the activation stimulus
only** (the axis the brief specifically flagged it against) by
hand-authoring the body profile instead of deriving it from a tuple:

| trial | how it's built | posture (headPitch/lean/breath) | body profile |
|---|---|---|---|
| `activation-bodyonly` / `activation-face` | direct `{tempo, extent}` profile, `expansion=armEngage=torsoDrive=0` fixed both sides | pinned at neutral in **both** presentations — the face variant lays only the six `(0,∓2,0)` facial channels over the same all-neutral pose (`faceOnly` in the harness) | tempo & extent only: −1 vs +1 — never the anchor-blended `swayAmplitude` |
| `control-bodyonly` / `control-face` | reused, unmodified from 013-E1 | as authored at `(-2,2,∓2)` | the `-++`/`-+-` corner pair — SPEC's own control-disambiguation anchors |
| `valence-bodyonly` / `valence-face` | reused, unmodified from 013-E1 | as authored at `(∓2,0,0)` | 4-corner blend at each valence sign |

The face variant's design is a review-blocker fix: an earlier draft
restored the full `(0,∓2,0)` SPEC pose, which also restores `headPitch`
and `lean` — so the face pair would have differed from the body-only pair
by posture as well as face, contaminating the face-rescue comparison.
The regenerated clips restore **only** the facial channels.

Verified from the regenerated trace data, not just asserted:

- The activation pair's `PARAM_ANGLE_X`/`PARAM_BODY_ANGLE_X` traversal is
  **>15× larger** high vs. low (40.84 vs 2.66, 22.32 vs 1.52 rig-units
  path length over the clip); only rate and amplitude differ.
- Frame-by-frame diff of `study-face-activation-*` against
  `study-bodyonly-activation-*`: exactly nine parameter ids differ — the
  brow, eye-open, gaze, and mouth wirings of the six facial channels —
  and nothing else. `PARAM_ANGLE_Y` (headPitch), `PARAM_BODY_ANGLE_Y`
  (lean), and `PARAM_BREATH` are **byte-identical** across the face
  pair's low and high sides.
- Control and valence pairs already satisfied "hold the other two axes
  constant" by construction (SPEC corner/edge tuples), confirmed by
  re-reading the E1 report's own numbers. In those pairs body-only
  already carries tuple-authored posture, so face+body adding only the
  face was already clean; the activation pair was the odd one out because
  its body-only side pins posture at neutral.

Frozen, machine-readable manifest, written before any human viewing:
[`evidence/stimulus-manifest.json`](./evidence/stimulus-manifest.json)
(+ a `.js`-wrapped copy for `study.html` to load without a server or
`fetch`). Six trials, each with its clip pair and `intendedDirection`;
`study.html` never reads or displays the manifest's labels.

---

## 4. Phase 3 — Viewing interface

Extended, rather than replaced, the evidence viewer: the existing
`evidence/index.html` (maintainer-facing, labels visible, unchanged) stays
for diagnostic browsing. A new participant-facing page,
[`harness/study.html`](./harness/study.html), reuses the same frozen
clips under `evidence/clips/` and adds the masked forced-choice flow:

- 400 logical px clips, shown left/right with no caption beyond the
  position word itself.
- Question order (which of the 6 trials comes first) **and** left/right
  placement **independently** randomized per participant, per trial
  (`Math.random`-based Fisher–Yates + a coin flip per pair).
- `left` / `right` / `no visible difference`, plus a 4-point confidence
  scale (just guessing → very confident).
- Anonymous free-text participant ID; a smoke/practice checkbox that
  tags every response `smoke: true`.
- Bounded replay: each clip auto-loops up to 6 times, then holds its last
  frame — no indefinite replay.
- Zero network requests: the stimulus manifest loads via a `<script src>`
  tag (not `fetch`, which browsers block for local `file://` JSON),
  storage is `localStorage`, export is a local file download.
- **Session-scoped export** (review-blocker fix): each Begin creates a
  `sessionId`, every row carries it, and the done-screen export contains
  only that session's answers — one export file per participant, named
  with the participant ID. `localStorage` still accumulates everything as
  crash recovery, but the browser's history never leaks into an export,
  and the analyzer additionally deduplicates by `responseId` so even a
  re-downloaded or overlapping file cannot double-count.
- Every response row carries full trial metadata — clip filenames, which
  side held which condition, `intendedDirection`, `pickedCondition`,
  `scoredCorrect`, `sessionId`, timestamps — enough to reproduce ordering
  and rescore independently of this script.

## 5. Phase 6 — Attention interface

[`harness/attention.html`](./harness/attention.html): a continuous
digit-detection focal task (press space on the target digit, 2/s) with
Haru in a fixed screen corner while the focal task holds center-screen
attention. Four validity properties, all review-blocker fixes over an
earlier draft:

- **Normative size.** The peripheral clip renders at its native 480px
  height — the product's 400 logical px Lar plus the capture's 2×40px
  sway margin (root SPEC §7) — not a shrunken thumbnail, so the result
  speaks to what a real desktop Lar's onset would look like.
- **Unpredictable onset.** The capture harness now bakes three onset
  times per condition (`t = 2000 / 3500 / 5000ms`; clips
  `onset-{ease,accent}{,-mid,-late}`, 5–8s long), verified in the traces
  to diverge at 2033/3533/5033ms respectively. Each session runs the six
  condition×onset combinations twice (12 rounds, shuffled) with a
  jittered inter-trial interval, so a participant cannot learn *when* to
  glance — only notice the change when it happens.
- **Video-clock latency.** The "I noticed a change" click records
  `video.currentTime`, and latency is that minus the clip's own baked
  onset — load or start delay cannot skew it. The digit stream also
  starts on the video's `playing` event, so the focal task and the clip
  share one timeline. A stalled video ends the round as `aborted`, which
  the analyzer excludes.
- **Fixed balanced digit sequences.** Each round's digits come from a
  deterministic seeded sequence — identical for every participant in the
  same round slot — with exactly one target per 4-digit block (25% target
  rate in any prefix, never the first digit, no immediate repeats). Focal
  performance is recorded as hits, missed targets, and false alarms, and
  the analysis reports **target hit rate and false-alarm rate**, never an
  overall accuracy that non-target correct-rejections would dominate.

A dedicated notice button (independent of the focal spacebar) logs
detection once per round; exports are session-scoped exactly like
`study.html`'s, one file per participant.

**Click-tested end to end** (both pages, re-run in full after the
review-blocker fixes), via a local static server on `127.0.0.1` serving
`harness/`:

- `study.html`: intro → 6 trials → done screen, run to completion for
  **two consecutive participants on the same device**. Confirmed both
  `<video>` elements load and play (`readyState=4`, correct 380×480, no
  decode error); confirmed the rendered page text never contains a corner
  mnemonic, a wire tuple, or the words high/low/intended (full
  accessibility-tree text dump); confirmed order and L/R are genuinely
  randomized; confirmed the second participant's done-screen export
  contains **only that session's 6 rows** while `localStorage` held all
  12 across both sessions — the session-scoping works as specified;
  confirmed `localStorage` persists across reload.
- `attention.html`: intro → 12 rounds → done screen, run to completion.
  Confirmed the peripheral video renders at exactly 480px and plays each
  round; confirmed the recorded rounds cover 6 ease + 6 accent balanced
  across onsets 2000/3500/5000 (×4 each) in shuffled order; confirmed a
  live notice click at video-time 4008ms in a 3500ms-onset round stored
  `noticedVideoMs=4008`, `latencyMs=508`, `withinOneSecond=true` — the
  video-clock scoring works end to end; confirmed the digit sequences are
  the deterministic balanced ones (16 digits → exactly 4 targets, 12 →
  exactly 3); confirmed spacebar bookkeeping live (spamming space
  produced hits on targets and false alarms on non-targets, in the HUD
  and the stored counters); confirmed the session-scoped CSV export
  parses through `analyse-responses.py`'s CSV path with the smoke rows
  correctly recognized and excluded.

All test responses used participant IDs `smokeA/B/C/D` (and earlier
`smoketest1`/`atest1`/`atest2` before the fixes) with the smoke checkbox
on; both localStorage keys and every exported file were deleted
afterward. **These do not count toward the 12-viewer requirement and are
not present anywhere in this repository** — they existed only in a local
browser profile during this task and are now deleted.

---

## 6. Deterministic verification

Run and passing:

```
pnpm test                                                          # 49 files, 356 passed, 3 skipped
pnpm build                                                          # typecheck + production build — clean
npx vitest run src/renderer/src/synth/body.test.ts \
               src/renderer/src/stage/affect.bodyExperiment.test.ts # 2 files, 21 passed

node sdd/slices/013-feel/experiments/harness/capture.mjs           # 50 conditions, all deterministic=true
python3 sdd/slices/013-feel/experiments/harness/analyse.py \
  > sdd/slices/013-feel/experiments/evidence/analysis.md

git diff --check                                                   # clean
```

The capture ran three times end to end during this task (initial, after a
filmstrip-rendering fix, and after the review-blocker fixes) and
reproduced every condition byte-identically each time — finally 50: the
42 from 013-E1, the four `study-{bodyonly,face}-activation-{low,high}`
clips, and the four `-mid`/`-late` onset variants. Trace-level checks on
the final run: the face pair differs from the body-only pair on exactly
the nine facial parameter ids and nothing else; posture ids are
byte-identical across the face pair; the onset variants diverge at
2033/3533/5033ms. The analyzer's integrity rules (responseId dedup,
one-per-participant/trial with earliest kept, smoke and aborted
exclusion, the 12-unique-participant gate) were verified against a
synthetic fixture that exercised each path — duplicate export file,
repeated answer, smoke row, aborted round — and the fixture was deleted.
No production file changed behavior: `pnpm test`'s 356/3 count is
identical to the count already recorded in 013-E1.

---

## 7. Participant status and response counts

**Zero real human participants.** Nothing in §§8–10 below is a result —
each states plainly that the corresponding test has not been run, per the
task's explicit boundary: stop at a verified collection kit, do not
simulate or substitute for a human viewer. Claude, subagents, and the
maintainer's own smoke passes are excluded from the count by design (the
smoke checkbox exists for exactly this) and none were tallied as viewers
here.

## 8. Body-only results

Not yet run. `activation-bodyonly`, `control-bodyonly`, and
`valence-bodyonly` are frozen and collection-ready; no responses exist.

## 9. Face+body results

Not yet run, and cannot be tuned toward a result: Phase 5's `-face`
trials share the exact same frozen clips a body-only session would use,
so running body-only first and then face+body on the *same* participants
in the *same* sitting (as `study.html` already does — all six trials are
one randomized session) is the intended design, not a deviation.

## 10. Attention results

Not yet run. `attention.html` is frozen and collection-ready.

## 11. Failures and confusions

None observed from real participants (none run). Failure modes surfaced
by the deterministic and calibration work, worth carrying into the human
phase:

- The two head axes with the weakest static legibility (yaw, pitch) are
  exactly the two the generator does *not* drive as continuous motion
  differently from the shipped sway writer's rate — if activation fails to
  read, check whether it's specifically the head-only cue washing out,
  not the whole bundle.
- `+++` (triumphant) and `-++` (determined) were flagged in 013-E1 as a
  likely still-frame collision ("open, upright, engaged" read the same);
  nothing in this experiment's frozen trials tests that pair directly —
  it remains deferred corner coverage per the brief.
- `bust-y` calibrated as invisible; if a future viewing round finds
  `expansion` under-reads on the torso/arm-only bundle, the chest writer
  is not a fallback — it was already ruled out here.

## 12. Conclusion

**Deterministic scope: complete and verified. Human scope: not started —
this report hands off a verified kit, not a result.**

Applying 013-E1's own decision rules requires responses this task does not
have, and none are asserted. What *is* established:

- The calibration in §2 grounds every generator choice 013-E1 made in
  what a viewer can actually see, not in parameter names — arm-A is
  confirmed as the strongest cue on the rig, `PARAM_BUST_Y` is confirmed
  dead weight, and the head axes are confirmed real but individually weak
  in a static hold (their legibility under the generator's actual
  continuous-motion driving is exactly what §8 will test).
- The activation stimulus's `swayAmplitude`-reuse conflation, the one
  contamination risk the brief named explicitly, is fixed and verified
  in the trace data (§3) — the frozen pairs are clean to score whenever
  responses arrive.
- The collection kit (§§4–5) is click-tested end to end on the actual
  visible path, not just code-reviewed.

### 13. Handoff — exactly what to do next

1. **Open the viewers locally.** From `sdd/slices/013-feel/experiments/`,
   serve the folder so `file://` never blocks local loads:
   ```
   python3 -m http.server 8934 --bind 127.0.0.1
   ```
   then open `http://127.0.0.1:8934/harness/study.html` for the six
   semantic pairs, and `http://127.0.0.1:8934/harness/attention.html` for
   the peripheral-noticeability task. (Opening `study.html`/`attention.html`
   directly via `file://` also works in Chrome in local testing; the
   static server is the more portable recommendation.)
2. **Participant instructions** are the intro screen each page already
   shows — no separate document to hand out. In short: keep the window at
   normal size, don't inspect the page source or filenames, answer the one
   forced-choice question per pair (or per round, for the attention task's
   12 rounds), and use "no visible difference" / do nothing when nothing
   is seen. Run **12 real viewers** through `study.html` (all six trials
   each, one sitting) for the semantic gate — the gate counts **unique
   participants**, so reruns of the same person do not add toward 12. The
   brief does not fix a separate headcount for the attention task; running
   the same 12 participants through `attention.html` afterward is the
   reasonable default and keeps the two pilot samples comparable.
3. **Where exported responses go:** click "Export JSON" (or CSV) on each
   page's done screen **after every participant** — each export contains
   only that participant's session, and the filename carries their ID.
   Drop the downloaded files into:
   - `sdd/slices/013-feel/experiments/evidence/responses/study/` for
     `study.html` exports,
   - `sdd/slices/013-feel/experiments/evidence/responses/attention/` for
     `attention.html` exports.

   (Both directories are gitignored along with the rest of `evidence/` —
   create them if they don't exist; `analyse-responses.py` does not
   require them to pre-exist beyond that. Accidentally dropping the same
   export twice is harmless: the analyzer deduplicates by `responseId`.)
4. **The single command that produces the final report:**
   ```
   python3 sdd/slices/013-feel/experiments/harness/analyse-responses.py \
     > sdd/slices/013-feel/experiments/evidence/human-results.md
   ```
   It deduplicates rows by `responseId`, scores exactly one answer per
   unique (participant, trial) — earliest kept, repeats reported —
   separates and counts smoke/practice rows without ever folding them
   into the scored numbers, and prints, per trial: unique participants,
   count choosing the intended direction, count "no visible difference",
   count wrong, the pilot-gate verdict (requires ≥12 unique participants
   AND ≥10/12 proportionally choosing the intended direction), and mean
   confidence — plus, for the attention task, within-1s detection rate,
   miss count, median video-clock latency, mean target hit rate, and mean
   false-alarm rate per condition, with aborted rounds excluded, and the
   pre-registered "promising" verdict (accent must raise within-1s
   detections and lower median latency while preserving target hit rate
   and false-alarm rate). That output, folded back into this report's
   §§8–10, is what turns this handoff into a finished experiment. The
   script's integrity paths were verified against a synthetic fixture
   during this task (deleted afterward, and not a substitute for real
   data) before any real response depends on it.

**Remaining gate: entirely human.** No further code, contract, or product
decision is blocked on anything except the 12-viewer sessions above. Per
013-E1 §8, promoting body channels into SPEC §2/§13 and promoting the
onset accent both remain separate, un-taken product decisions regardless
of how the human phase turns out.

**Contracts and production behavior: unchanged.** No SPEC, PRINCIPLES,
DECISIONS, PRD, ROADMAP, or character-package edit was made or is
proposed by this report. Every new file is dev-only, reachable only by
opening a `.html` file directly or running the capture harness by hand;
nothing here is imported by `src/main` or `src/renderer`'s production
paths, and `pnpm build`'s output is unaffected.
