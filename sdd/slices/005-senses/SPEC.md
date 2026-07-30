# Slice 005 — Senses · SPEC

**Artifact:** Slice SPEC · **Slice:** 005-senses (= ROADMAP M3b) · **Status:** Open

**Why / gate.** The daemon grew nerves in M3a; now the harnesses grow
senses — real adapters on the frozen wire. Exit gate (ROADMAP M3b): *a
real Claude Code session and a real Codex session simultaneously drive
the Lar end-to-end — baseline states via hooks, emotes via MCP — with
the daemon down/up cycle behaving as designed (connection refused ⇒
agents degrade gracefully).*

Refines root SPEC §3/§6 and D15/D26/D29; carries the root deltas (P11
in PRINCIPLES, D15 amendment, §3 degradation note, §6 rewrite, ROADMAP
M3b reshape) applied in the slice-opening commit. Binding within the
slice; root SPEC stays source of truth. Everything here is
client-side-of-the-wire: no server, envelope, or affect changes beyond
the D26 `instructions` string and the §3 note.

---

## 1. Scope

**In:** Claude Code adapter — managed-block writer for
`~/.claude/settings.json` (nine hooks) and `~/.claude.json`
(`mcpServers.lares`), launch-time idempotent re-sync, port-change
re-sync, removal pass + dev uninstall script. Codex adapter — the Lares
plugin (manifest + hooks + MCP entry), its in-repo marketplace, and the
launcher shim the app maintains for it. The two verifications (Codex
recon, §4; emote-density measurement, §5) and any D26 `instructions`
rewording that falls out.

**Out (fence):** harness skill files (post-M3b pass — ROADMAP delta);
consent UI (M5a/M5b, D29 revisit); any new event type, state, or wire
change (contract frozen at M3a); any third harness; JSONL tailing or
any file-based fallback (P11); settings/adapter UI.

## 2. Claude Code adapter (005-D1/D2/D3)

Root §6 as rewritten this slice is the contract. In brief:

- **Hooks** (`~/.claude/settings.json`): content-recognition ownership
  — a Lares entry is any hook whose command references the bundled
  forwarder; re-sync = remove all recognized (any path variant), append
  the current nine, preserve everything else. Second run on an
  unchanged config is a byte-identical no-op.
- **MCP** (`~/.claude.json`): own `mcpServers.lares` outright;
  write-only-if-different, atomic temp+rename; never create or repair
  the file — Claude Code owns it.
- **Safety, both files:** unparseable ⇒ abort loudly, touch nothing;
  `~/.claude/` absent ⇒ skip silently, re-check next launch; one-time
  backup (`<file>.lares-backup`) before the first-ever modification,
  never overwritten after.
- **Uninstall:** the removal pass behind a dev script
  (`pnpm adapter:remove`); tray/installer entry points attach at M5a.
- **UX note carried from root §6:** hooks snapshot at session start —
  a session live during registration picks them up next session.

## 3. Codex plugin (005-D4/D5/D8)

A plugin directory committed in-repo: `.codex-plugin/plugin.json`
manifest, the hook set (root §3 events incl. PermissionRequest), and
the MCP entry with the fixed-port URL. The Lares GitHub repo doubles as
the marketplace; install is user-run and guided — marketplace add, then
`/plugins` — with Codex's trust flow as the only consent gate (never
bypassed).

**Thin-plugin rule (skew mitigation for repo-HEAD distribution):** hook
commands and the baked URL only, no logic — any plugin version stays
compatible with any installed daemon because the wire contract froze at
M3a.

**Launcher shim (005-D8):** the plugin can't bake a per-machine app
path, so its hook commands invoke `~/.lares/bin/lares-forwarder`
(`command`) / `%USERPROFILE%\.lares\bin\lares-forwarder.cmd`
(`commandWindows`), which the app re-stamps with the current binary
path on every launch. Codex hook commands run through a shell and
`commandWindows` is its documented JSON per-platform override. Recon
against installed Codex 0.134.0 confirmed `~`/`%USERPROFILE%`
expansion.
The POSIX command captures the harness pid from the hook shell's
`$PPID`; the Windows command uses quoted `call` and omits `pid`
because `cmd` cannot expose its parent process (005-D9).

No fallback of any kind: a Codex without the plugin is unsensed (P11).

## 4. Verification — Codex recon

Against the *installed* Codex version, before adapter code lands
(our picture of the plugin surface is from secondary sources):

1. Plugin manifest shape (`.codex-plugin/plugin.json`) and whether
   hooks bundle in plugins as documented, riding the standard
   trust-review flow.
2. Hook command execution semantics: shell or direct spawn; `~` /
   env-var expansion (decides the shim's invocation form).
3. PostToolUse payload: is there a failure signal? Present ⇒ the §3
   table maps it to `error` server-side (adapter stays passthrough).
   Absent ⇒ the §3 degradation note stands: Codex failures read as
   `working` until Stop (005-D6).
4. Marketplace add syntax against a GitHub repo, for the guided
   instructions' exact wording.

Claude Code needs only a sanity pass (settings/`~/.claude.json` shapes
against the current release; the hook set itself was verified at M2a).

## 5. Verification — emote density (005-D7)

The D26 `instructions` wording has never met a real agent. Measure:
under a dev flag, the daemon logs one JSONL line per received emote
(timestamp, source session, cue/params, coalesced?) and one per
baseline state change (the beat context). Run one real interactive
Claude Code working session, 30–60min of genuine work (interactive
because permission `Notification`s never fire headless). Verdict is
the maintainer's eyeball against D26's own rubric — emotes track meaningful
beats, not tool calls: sustained >1/min or 1:1-with-tools ⇒ tighten
anti-triggers; zero all session ⇒ strengthen triggers. If the wording
changes, the slice records before/after. One harness suffices — the
`instructions` field is shared, so one calibration serves both.

## 6. Acceptance (GWT)

**A1 — settings.json writer.** GIVEN fixtures — no hooks section;
pre-existing user hooks; stale Lares entries under a different install
path — WHEN the writer runs THEN the nine entries are present exactly
once, user entries untouched, stale entries gone; WHEN run again THEN
the file is byte-identical; GIVEN broken JSON THEN abort, file
untouched, loud log; GIVEN a first-ever modification THEN the backup
exists; a second modification leaves the backup alone.

**A2 — `~/.claude.json` writer.** GIVEN no `mcpServers.lares` THEN the
entry is added atomically; GIVEN a matching entry THEN no write occurs
(mtime unchanged); GIVEN the file absent or unparseable THEN skip +
log, file never created.

**A3 — Removal.** GIVEN a config with Lares and user entries mixed
WHEN the removal pass (dev script) runs THEN only Lares entries and
`mcpServers.lares` are gone, the rest structurally byte-preserved.

**A4 — Plugin validity.** GIVEN the committed plugin dir THEN it
validates against the recon'd manifest format; the MCP URL carries the
configured port; the shim exists post-launch and execs the forwarder
with harness tag `codex`.

**A5 — Live gate (eyes on).** GIVEN a fresh app launch (registration
runs) and *then* an interactive Claude Code session and a Codex session
(plugin installed, trusted) working simultaneously THEN both drive
baseline states, an emote from each plays on the Lar, `status()` lists
both sessions, and P10 aggregation holds across harnesses.

**A6 — Down/up (S9).** GIVEN both sessions live WHEN the daemon is
killed THEN both harnesses continue unbothered (hooks exit silently,
MCP gets connection-refused, agents proceed per D26); WHEN relaunched
THEN the next events land with no client-side reconfiguration.

**A7 — Density.** GIVEN the §5 session THEN the log exists, the verdict
is recorded here, and any D26 rewording is committed with before/after.

A1–A4 headless (vitest, temp-dir fixtures — no Electron imports in the
writer module); A5–A7 are the live smoke, eyes on the Lar.
