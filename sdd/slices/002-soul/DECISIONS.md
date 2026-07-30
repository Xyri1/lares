# Slice 002 — Soul · DECISIONS

Implementation-scoped only; root-relevant forks go to `sdd/DECISIONS.md`
(rule: if reverting the slice wouldn't erase the decision's relevance,
it's a root decision).

Fork considered and closed at the slice grilling, recorded here
because it was seriously on the table: **timeout-only expressions with no
affect engine** ("agent emotes + duration, we just reflect") — rejected
as striking D01/P8, the product's stated differentiator; the timeout
mechanic itself was found to already be root §4's expression stack
(duration_s + expiry). Root rows unchanged. Rung-(a) start on the D28
ladder confirmed (complexity-for-quality trade, the maintainer's framing).

---

**002-D1 — Goldens carry real Claude Code envelopes; §3 mapping lands
now as a pure function.** *Chosen:* scenario events are §2-shaped
envelopes with real hook JSON; `mapEvent` implements the root §3 table,
unit-tested, reused by M3b server-side. Fence: no liveness machinery, no
multi-session aggregation — single-session resolver with a set-shaped
interface so M3a extends instead of rewrites. *Rejected:* pre-mapped
abstract state events (forks the §7 schema — a contract change — and
makes every golden a throwaway). *Status:* decided.

**002-D2 — Dual-stage side-by-side A/B in one window.** *Chosen:* two
engine instances + two IRuntime stages (Hiyori loaded twice), same
scenario ticks and seed, per-stage mapping preset; feed messages carry a
stage id; the weekly D28 recording is one screen capture. *Rejected:*
sequential runs compared as external video (manual compositing in the
loop lived daily for weeks); toggle-on-one-stage as the primary (can't
produce the side-by-side recording D28 judges by — may ride along later
once deterministic scrub exists). *Status:* decided. *Built:*
one pixi Application hosting both models on a shared 30fps ticker — two
Applications fail outright (global texture cache, second context blanks
the first stage). Stage B loads lazily on first toggle and hides rather
than unloads; the window widens on A/B and restores on exit.

**002-D3 — Replay determinism via seeded PRNG; traces are the proof.**
*Chosen:* replay mode = scenario clock + fixed seed for all body-side
jitter; per-run trace files; gate check is byte-identical traces across
runs at 1× and 64×. Live mode unseeded. *Rejected:* determinism at the
feed layer only (leaves synth output unverifiable and A/B contaminated
by luck); excluding jitter from traces (hides the thing being compared).
*Status:* decided.

**002-D4 — Seven starter cues, hand-authored raw params.** *Chosen:*
focused / frustrated / dejected / alert / pleased / weary / neutral —
smallest set covering every affect region the goldens and states visit
(without *dejected*, "third error reads heavier" has nowhere to descend).
Celebratory folded into *pleased*: big-win-after-struggle reads through
weight and timing (rung-a), not a separate face. D25 rung 3 is
appropriate for our own bundled character pre-M4. *Rejected:* larger
authored set (faces the goldens never exercise; M4's authoring loop is
the proper source of richness). *Status:* decided.

**002-D5 — Player UI is a dev-panel tab in the one plain window.**
*Chosen:* extend the 001-D5 panel (scenario tab: pick/play/scrub/speed +
trace overlay); window widens for dual-stage; one window until M1b
changes its chrome (001-D4 upheld). *Rejected:* separate player window
(second window to manage, erodes 001-D4 for nothing a dev flag doesn't
give). *Status:* decided.
