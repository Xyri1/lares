# Slice 014 — Authored choreography · SPEC

**Artifact:** Slice SPEC · **Slice:** 014-authored-choreography · **Status:**
Accepted; implementation open · **Date:** 2026-08-05

## 1. Coverage

This slice replaces the visually weak body execution beneath slice 013's
accepted semantic contract. The agent still sends only
`feel(valence, activation, control)`. The brain still emits only
`{ feel, operational }`. The existing pure nine-anchor scalar target remains
the persistent pose. Slice 014 adds one complete character-authored Live2D
phrase when the displayed feeling changes, then returns physical ownership to
that latched target.

[013-E5](../013-feel/experiments/013-E5-authored-basis-coverage.md) is the
normative visual baseline: production timing may vary only where this SPEC says
so, while naturalness and expressiveness may not regress below the accepted
sixteen full/half clips.

## 2. Invariants inherited unchanged

The wire values, normalization, anchor ordering, retained facial channels, and
operational precedence are inherited from
[slice 013 SPEC §§1–4, 11, 13](../013-feel/SPEC.md). This slice narrows only the
body execution below that contract.

- P2/P4: the agent appraises; it never selects assets, curves, timing, or
  parameters.
- P5/P6/D31: renderer assets never cross the P6 feed. Renderer-neutral scalar
  anchors remain above the Live2D block.
- P7: character mapping is validated before use; all runtime writes remain
  range-bounded.
- P8/013-D3/D7: semantic mapping is memoryless and the latest tuple remains
  latched. Animation state is mechanical and never changes that tuple.
- P10: `awaiting_input` and `error` may not be masked by choreography.
- D25: discovered expressions and motions acquire no semantics from names,
  paths, groups, hotkeys, or metadata. Only explicit character authoring makes
  a motion eligible.

No new model-facing value, renderer parameter, motion name, or asset reference
is added to `feel()` or the performance feed.

## 3. Character format

`format` remains `"lares/1"`. A Live2D character may add:

```jsonc
{
  "renderers": {
    "live2d": {
      "choreography": {
        "fallback": { "group": "Idle", "index": 1 },
        "anchors": {
          "+++": { "group": "Tap", "index": 3 },
          "++-": { "group": "Shake", "index": 1 },
          "+-+": { "group": "Idle", "index": 2 },
          "+--": { "group": "Tap", "index": 1 },
          "-++": { "group": "Tap", "index": 0 },
          "-+-": { "group": "Flick3", "index": 0 },
          "--+": { "group": "Flick", "index": 2 },
          "---": { "group": "Idle", "index": 0 }
        }
      }
    }
  }
}
```

Contract:

- `fallback` is required when `choreography` exists;
- `anchors` is optional and accepts only the eight existing sign-ordered corner
  keys; a missing corner uses `fallback`;
- each entry contains exactly a non-empty registered model motion `group` and a
  safe integer `index >= 0`;
- the referenced group/index must exist in the selected `.model3.json`;
- loose motion paths, durations, loops, semantic labels, gains, and per-motion
  timing are outside this slice;
- a character without `choreography` keeps slice 013 behavior unchanged.

The manifest parser and import validator reject malformed or nonexistent
references through the existing two-tier policy: refuse the whole candidate
import; warn and skip the whole invalid managed character package. The parser
does not silently discard only the choreography block. Transactional body
prepare reports the same failure before commit.

## 4. Pure phrase selection

For normalized `p=(v,a,c)`, retain slice 013's definitions:

```text
m(p) = max(|v|, |a|, |c|)
q    = p / m                         when m > 0
w_s  = Π_i (1 + q_i·s_i) / 2         s ∈ {-1,+1}³
```

Selection returns:

1. no phrase when the displayed feel is `null`;
2. `fallback` for semantic neutral `p=(0,0,0)`;
3. corner `s*` only when `w_s* > 0.5` and strictly exceeds every other corner
   weight;
4. `fallback` otherwise, including axis-only inputs, ties, and missing corner
   mappings.

The selector is pure: `(feel, choreography)` always yields the same physical
reference and modulation. It receives no previous tuple, time, runtime state,
or asset filename semantics. The complete legal set is
`{-2,-1,0,1,2}³` (125 wire tuples); every member resolves to either one explicit
corner entry or the fallback.

## 5. Commitment and activation modulation

For any non-neutral reported tuple:

```text
displacement = 0.5 + 0.5·m
tempo        = 1 + 0.15·a
```

`displacement` scales every authored parameter's deviation from its rig default
after primary motion evaluation and before retained face writes, physics, and
pose. It never scales Part opacity. `tempo` scales the managed motion's elapsed
time and therefore its authored phase relationships and downstream physics
response together.

For semantic neutral, fallback plays untouched at displacement `1` and tempo
`1`. Every value is finite and bounded before it reaches the runtime. Full shell
input (`m=1`) uses the authored motion at full displacement. Half magnitude on
the same corner ray (`m=0.5`) uses the same motion at `0.75` displacement.

Production anchor evaluation fixes slice 013's `k=1`. The installed
`expressiveness` config field retires. A dev-only manual preview may still pass
another `k` without persisting it, changing the latch, or altering production
playback. `1200 ms` onset, `700 ms` settle, and `250 ms` finish-watchdog grace
are fixed body-choreography source constants, not manifest or app-config
fields.

## 6. Trigger and lifecycle

The choreography trigger key is the displayed wire tuple plus the active
character generation. Operational-state changes are not feel changes.

On a new key:

1. cancel any pending phrase;
2. interrupt any active managed phrase and begin the normal `700 ms` body
   settle from actual live parameter values while easing Parts to the
   character defaults;
3. start the existing persistent scalar-target ease immediately;
4. after `1200 ms` *(includes the 700 ms ease and a readable hold)*,
   play the newly selected complete phrase once;
5. on motion completion, ease body parameters from their actual live values
   back to the still-current target over `700 ms`;
6. hold that target indefinitely with blink, breath, sway, physics, and the
   phrase's settled Part drawing.

An identical tuple does not restart, extend, or queue a phrase. Time passing
does not replay one. A newer tuple supersedes the pending or active phrase. A
character commit counts as a new generation and schedules the current latch
once; rollback restores the previous character mapping and re-establishes the
unchanged target without restoring obsolete timer or motion progress.

`feel=null` cancels managed choreography and presents the neutral scalar anchor
without scheduling a phrase; Parts return to the character defaults during the
settle. Dev manual preview and deterministic scenario playback use the same
selector and lifecycle but never write the real latch.

Managed playback is one authored cycle even when a `.motion3.json` declares
`Meta.Loop=true`. The runtime treats the loaded motion as non-looping for this
operation, derives its finite positive authored duration from the loaded asset,
and expects completion after `duration / tempo`. A natural finish settles
immediately. If no finish arrives, a watchdog at
`duration / tempo + 250 ms` force-stops and settles. If load/start fails,
returns `false`, rejects, or exposes no usable duration, the runtime warns once
for that reference, keeps the persistent target, resets Parts to defaults, and
does not retry until a later trigger key. Stop/cancel errors are contained and
may not prevent settlement.

Character transactions are ordered:

- prepare validates without changing visible motion or timers;
- commit cancels the old generation, installs the new mapping, resets the new
  body to its defaults, and schedules the non-null latch once only when no loud
  overlay is active;
- rollback cancels the failed generation, restores and resets the old body,
  and schedules the non-null latch once only when no loud overlay is active;
- commit or rollback under `awaiting_input`/`error` schedules nothing; clearing
  the overlay performs the single schedule.

## 7. Parameter, Part, and operational ownership

For a choreography-enabled Live2D body, automatic random model-idle selection
is disabled. Lares owns which complete registered motion plays.

While a phrase is active:

- the motion owns all authored parameter and Part curves except the rig IDs
  bound to the retained facial channels; this includes body, head, breath, arm,
  and secondary excitation where they do not alias a retained binding;
- the current scalar target keeps writing the six slice-013 facial channels
  (`mouthCurve`, `mouthOpen`, `browRaise`, `browKnit`, `eyeOpen`,
  `gazeHeight`) through the character's existing parameter wiring; if a motion
  also addresses one of those rig IDs, this face write wins;
- physics and pose run after those primary writes;
- the runtime keeps the motion's complete timing and does not expose per-curve
  control to the stage.

On normal completion, the motion's end Part drawing remains as the persistent
arm organization. On the next trigger, cancellation, failed start,
`feel=null`, loud overlay, commit, or rollback, Parts ease to that character's
defaults during the normal settle. Scalar body parameters always return from
actual live values through the settle, never by a default-value snap.

Entering `awaiting_input` or `error` cancels pending/active choreography and
gives the complete operational overlay target ownership; no affect phrase may
start while either overlay is active. Parts reset to defaults while the overlay
enters. Clearing the loud overlay schedules the unchanged non-null latched feel
once after the normal delay. Lower-priority operational changes neither select
nor replay choreography.

## 8. Module placement

The P6 feed and main-process register do not change.

- A small pure body-side planner consumes the normalized tuple and parsed
  character mapping and returns `none` or one `{ group, index, displacement,
  tempo }` plan. Its interface is the test surface for all 125 tuples.
- The existing stage affect driver owns only trigger-key comparison, the one
  pending timer, and operational/character lifecycle calls.
- `IRuntime` gains one managed-motion operation plus cancellation. The Live2D
  adapter hides motion-manager events, tempo/displacement application,
  face-only override filtering, automatic-idle suppression, Part preservation,
  one-cycle enforcement, watchdog/failure containment, default-Part reset, and
  settle mechanics behind that interface.

No choreography state crosses into main, storage, MCP, hooks, or the character
identity layer. No scheduler, queue, phrase taxonomy, or generic animation
graph is introduced.

## 9. Haru basis

Haru ships the exact E5 mapping in §3. `+-+` and `---` deliberately use quiet
Idle phrases; they are accepted coverage with known content limits, not hidden
missing data. The configured fallback is `Idle[1]`, the quietest level baseline
from the Haru atlas.

The E1 procedural generator and its dev-panel toggle do not ship with this
slice. Their reports and frozen evidence remain historical research.

## 10. Acceptance

Deterministic gates:

- schema rejects unknown keys, bad group/index shapes, and absent registered
  motions without weakening transactional character load;
- a table test covers all 125 legal tuples; exact corner and half-corner rays
  select the same motion, ambiguous/tied directions select fallback, and every
  modulation value is bounded;
- identical feeds never retrigger; tuple replacement, overlay entry/clear, and
  character commit cancel or schedule exactly once as §6 requires;
- interruption and completion settle from actual values without a one-frame
  jump or return to rig neutral;
- looping assets execute exactly one cycle; missing finish, failed start, and
  cancellation failure take the bounded recovery path without replay;
- Parts persist after normal completion and reset on every explicitly listed
  cancellation/transaction path;
- a character without choreography retains slice 013 playback;
- test suite, typecheck, and production build pass.

Visible gate at 400 logical px:

1. capture the eight full and eight half Haru corner conditions through the
   production path;
2. compare them beside E5 at normal playback; the maintainer confirms none is
   less natural or expressive than its E5 reference;
3. verify full > half commitment, high > low activation energy, and the E5
   matched-corner distinctions;
4. replace a tuple while an A-pose and a B-pose phrase are active; neither
   transition may pop, hinge, or display the superseded phrase after settle;
5. enter `awaiting_input` during a phrase; the loud overlay wins and the
   unchanged feeling returns after clear;
6. hold one corner for three minutes; it stays latched without periodic phrase
   replay or drift to neutral;
7. drive one condition through the real loopback `feel()` path, proving the
   agent-facing contract still supplies only `[V,A,C]`.

The local, gitignored production artifact lives at
`sdd/slices/014-authored-choreography/evidence/index.html`, with clips, traces,
and stills beneath that directory and the signed human verdict in
`evidence/record.md`. Its final verdict is copied into the Markdown slice
record before close. The comparison page masks production/reference identity
during viewing and reveals it only after each verdict is recorded. E5 remains
linked read-only rather than copied or rewritten.

The gate fails on any isolated-forearm, metronomic, pose-pop, neutral-return,
or E5-quality regression. Failure identifies runtime composition or missing
character content; it does not revive procedural motion generation or expand
the semantic tuple.

## 11. Outside this slice

- Lar–harness binding, multiple Lar instances, hibernation, and wake remain in
  future `0xx-lar-harness-binding`.
- Periodic gesture replay, motion queues, random variation, authoring UI,
  loose-motion choreography references, and newly authored Haru motions are
  deferred until a demonstrated need.
- Slice 014 does not change session attribution, durable latches, MCP/plugins,
  operational state meanings, or the continuous assessment policy.
