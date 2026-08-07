# Slice 011 — Agent self-expression · PLAN

Execution notes. This slice changes the agent-facing cue contract and character
mapping, then replaces ambient skill reinforcement with one explicit setup
workflow. The affect engine and render path stay behind their existing seams.

## 1. Freeze fixtures and current behavior

Write the everyday-emoting and calibration matrices from SPEC §7 before code.
Record current Claude Code, Codex and model versions. Capture the current MCP
instructions, arbitrary cue schema, imported Haru manifest, calibration state
and both plugin skill inventories as the historical baseline.

Add no runtime A/B flag. The committed pre-slice behavior and fixed matrix are
the comparison.

## 2. Add canonical mappings to the character contract

Define the six canonical cue IDs once in the character/application domain and
reuse that definition in manifest validation, the application adapter and MCP
schemas. Do not add them to Nerves. Extend the character manifest with partial
`cueMappings` and validate the empty, partial, complete, duplicate, unknown and
null-affect cases from SPEC §3. Preserve the `lares/1` format string. Keep raw
import semantic-free while preserving valid mappings in imported Lares
packages.

Update the bundled Haru package with the mapping fixed in SPEC §3;
do not infer the committed mapping from filenames in production code or mutate
an existing managed Haru package during library upgrade. Extend the validation
report with mapped/missing canonical cues while preserving its existing raw
performance calibration counts. Test mapping preservation and readiness.

## 3. Resolve canonical cues in the brain

At the MCP/application dependency seam in `src/main/index.ts`, validate the
whole active mapping, resolve the canonical cue to its performance name, and
pass that existing raw cue to Nerves. Enrich the returned result with canonical
cue and resolved performance. Do not change Nerves' cue contract or the scenario
harness's frozen cue vocabulary and goldens. Duplicate canonical mappings share
the resolved performance's existing coalescing and saturation history.

Fail closed with `character_not_calibrated` before any state mutation when the
active mapping is incomplete or invalid. Keep the `params` branch unchanged.
Update character reload/switch paths and tests so mappings change atomically
with the rest of the active character. Keep density diagnostics useful by
recording both canonical cue and resolved performance where a cue is logged.

## 4. Replace cue discovery with calibration operations

At the MCP interface:

- constrain `emote.cue` to the canonical enum;
- replace `list_cues` with `list_performances`;
- change `preview_expression`'s raw-name argument from `cue` to `performance`;
- add `map_cue(cue, performance)` with idempotent same-target behavior, explicit
  remapping, atomic persistence and a remaining-cues result;
- rename `status.uncalibrated_cues` to `uncalibrated_performances`, add mappings
  and missing cues, and set protocol version 2;
- advertise MCP server version `2.0.0` while keeping `/v1/mcp` as the stable
  handshake address and leaving hook, runtime-discovery, renderer-feed and
  manifest versions unchanged.

Reuse the existing authoring and manifest writer paths. Do not let the skill or
server handler edit JSON ad hoc. Update `update_expression` and
`save_expression` call sites only where terminology or mapping readiness
requires it; avoid an authoring refactor. Make each synchronous mapping write
derive from the latest manifest so back-to-back MCP calls cannot lose progress;
add no lock or persistence layer.

Implement the exact deterministic result shapes and canonical ordering from
SPEC §§2 and 4. Test invalid external input at the server seam, successful and
idempotent remapping, duplicate performance targets, interrupted partial
progress and exact tool results. Update `scripts/synthetic-session.mjs` from
`list_cues` and arbitrary cue names to the v2 interface and a mapped fixture.

## 5. Replace calibration arming with explicit readiness

Redefine the tray's zero/partial/complete state over the six canonical mappings.
Remove `calibrationArmed`, `CALIBRATION_INVITE`, the clipboard prompt, toggle and
per-session instruction snapshot behavior. Delete the clickable **Map
expressions…** menu item and its callback; keep one disabled localized
`Expression mapping n/6` row that may direct the user to **Calibrate Lar**.

Keep import and character selection available while incomplete so the active
Lar can be previewed. Hooks continue to report their existing lifecycle events;
do not change hook manifests, commands, event responses or forwarder stdout.

## 6. Land everyday semantic instructions

Replace the lifecycle milestone checklist in `src/main/server/server.ts` with
the first-person semantic disposition from SPEC §5. Put a complete useful rule
inside the first 512 characters and keep the whole initialization value below
2,000 characters. Describe all six canonical cues without implying literal
word triggers.

Make `emote` and its cue argument self-contained. Do not mention calibration
tools in ordinary server instructions; on `character_not_calibrated` tell the
agent to continue the user's task silently rather than inspect artist assets.

Update server tests with load-bearing semantic clauses, cue enum exposure,
length budgets and the absence of calibration invitations. Avoid snapshots of
whole prose blocks.

## 7. Replace the plugin skill

Delete both `skills/emoting/` directories. Create focused
`skills/calibrate-lar/` workflows in the Claude Code and Codex plugins.
Keep both plugin manifests at version `0.1.0`; the pre-launch contract changes
in place without a compatibility path.

The workflow body follows SPEC §6 and uses only Lares MCP tools. Keep it concise
and imperative; add no scripts, references, assets or duplicate validation.
Use host-native activation controls:

- Claude Code: `disable-model-invocation: true`, yielding
  `/lares:calibrate-lar`.
- Codex: generate `agents/openai.yaml` with display name **Calibrate Lar** and
  `policy.allow_implicit_invocation: false`; typed invocation is
  `$lares:calibrate-lar`.

Read the current `openai.yaml` metadata reference before generating Codex
metadata. Update plugin tests to assert the new inventory, explicit-only
controls, MCP dependency and load-bearing workflow steps. Test the two host
wrappers for behavioral parity rather than requiring byte-identical metadata.
Update both plugin READMEs with the explicit calibration invocation, installation
commands and new-session/reload requirement.

Keep **Configure Agent Integrations…** limited to verifying the marketplace and
an enabled `lares@lares` installation. Do not compare versions or migrate
pre-launch installs. Update the localized confirmation copy so the existing
consent step discloses installation and the host's trust/reload surface.

## 8. Run automated and live gates

Run focused character, Nerves, server, calibration, shell and plugin tests, then
`pnpm test` and `pnpm build`.

Run the fixed everyday matrix on both harnesses. Then invoke the calibration
skill explicitly on each harness against fixtures covering clear multilingual
names, opaque names, sparse assets, an authored gap, interruption and daemon
absence. Confirm neither host activates the skill from an ordinary emoting or
import request.

Start each calibration run with `status`: complete mappings must stop without
mutation, and partial mappings must fill
missing entries without overwriting existing ones. Verify non-emotive assets
remain intact and one-shot motion previews warn the watching user. Exercise an
clean installation for each plugin.

Record versions, results, the verified Haru mapping and any unresolved host variance
in this PLAN. Do not claim compatibility from transport success alone.

## 9. Reconcile source-of-truth documents

After implementation and live acceptance:

- amend root D09 for the canonical cue branch and character mapping;
- amend D25 for performance inventory versus agent-facing cues;
- amend D26 so MCP instructions, not an ambient skill or hooks, own everyday
  emoting guidance;
- amend D15 and slice 009's skill statements from `emoting` to explicit
  `calibrate-lar`;
- supersede D32's armed invitation with user-invoked calibration;
- amend D34's claim that the existing cue contract remains unchanged;
- update root SPEC §§2, 5 and 6 plus uninstall/data wording where needed;
- document protocol v2 and the absence of a pre-launch compatibility path;
- update the English and Simplified Chinese usage, character-format and
  distribution docs: canonical mappings, passive tray status, v2 tool table and
  **Calibrate Lar** replace the clipboard prompt, raw-name playback and discard
  workflow;
- update ROADMAP language and mark Slice 011 complete only after the root docs
  describe what actually shipped.

## 10. Final gate

Run `pnpm test` and `pnpm build` once more. Inspect both packaged plugins and a
fresh imported package. Live-smoke ordinary emoting, explicit calibration,
partial resume, clean plugin installation, character switching and app-closed
degradation in Claude Code and Codex. Close the slice only when SPEC §8 and both
live matrices pass.
