# Slice 005 — Senses · DECISIONS

Slice-scoped forks; root DECISIONS.md holds anything that outlives the
slice. 005-D5 is a root delta trio (P11 in PRINCIPLES, D15 amendment,
§6 rewrite); 005-D6 annotates root §3 — all applied in the
slice-opening commit. Field research behind D1/D2/D4 was done live
during the grilling (claude-pet, code-notify, OpenPets, clawd-tank,
Smithery, GitHub's MCP install guides).

---

**005-D1 — Claude Code ownership is content-recognition, not
markers.** *Chosen:* JSON has no comments, so "marker-delimited
managed block" (old root §6 wording) is impossible as written; a Lares
hook entry is instead *defined* by content — its command references
the bundled forwarder, any path variant. Re-sync removes all
recognized entries and appends the current set; everything
unrecognized is preserved. Uninstall is the removal pass alone. Every
surveyed field peer that auto-registers (claude-pet, code-notify)
converges on exactly this. Safety rules: unparseable file ⇒ abort
loudly, touch nothing (never "fix" a user's settings); `~/.claude/`
absent ⇒ skip silently; one-time backup before first-ever
modification, standard among the surveyed installers. *Rejected:* a
tag property on entries (fragile against Claude Code's schema
validation); shelling out to the `claude` CLI (see 005-D2's PATH
argument). *Status:* decided by the maintainer.

**005-D2 — MCP entry via direct edit of `~/.claude.json`,
write-only-if-different.** *Chosen:* user-scope MCP servers live only
in `~/.claude.json` — a volatile file Claude Code rewrites constantly,
so the race is real. Mitigation is to almost never write: compare
first, and with the D27-stable port the entry matches on every launch
after the first — one write per install, ever, atomic temp+rename.
Never create or repair the file. The check doubles as drift repair
(user deletes the entry ⇒ next launch restores it; the consent tension
is D29's parked M5 question). *Rejected:* `claude mcp add` — the
vendors' docs recommend it *to humans in a terminal*, but a
GUI-launched Electron app can't rely on resolving the user's `claude`
binary (macOS Finder/launchd PATH is minimal; Windows shim locations
vary), our peer category edits files directly, and the CLI performs
the same read-modify-write underneath anyway — same race, new
dependency. *Status:* decided by the maintainer.

**005-D3 — Uninstall entry point is a dev script until M5a.**
*Chosen:* the removal logic ships now (it's the D1 removal pass, and
re-sync exercises it every launch); its only M3b trigger is an in-repo
dev script. Alpha users are repo-runners; the tray item and installer
uninstall hook attach to the same function at M5a. *Rejected:* no
uninstall path at all (manual JSON surgery for testers, for ~5 saved
lines). *Status:* decided by the maintainer.

**005-D4 — Codex adapter is a Lares plugin on a GitHub-hosted
marketplace.** *Chosen:* Codex's official plugin surface bundles
hooks + MCP config + skills in one install riding the standard
trust-review flow — so the adapter becomes a committed plugin
directory, not config-file surgery (no `hooks.json` writes, no
`config.toml` marker blocks). The Lares repo doubles as the
marketplace; install is user-run and guided. The maintainer's reasons for
GitHub over a local app-managed marketplace: the manual install
already assumes GitHub-repo scope, and Codex users are network-users
by definition (the local-LLM tail can clone and build). Skew
mitigation bought by that choice: **the plugin stays thin** — hook
commands + baked URL, no logic — so repo-HEAD is compatible with any
installed daemon (wire frozen at M3a). *Rejected:* local app-managed
marketplace copy (offline purity not worth the uglier guided path);
writing Codex config files directly (the plugin is the sanctioned
surface and carries the trust flow for free). *Risk accepted:* the
plugin surface is known from secondary sources; recon against the
installed version is the slice's first task. *Status:* decided
by the maintainer.

**005-D5 — Push-only sensing; JSONL fallback deleted; P11 adopted.**
*Chosen:* Lares senses what harnesses tell it, never what it scrapes —
every input crosses the §2 ingress as something a process chose to
send. The `~/.codex/sessions/` JSONL tailer — the design's only
scrape-shaped path — is deleted, not deferred: its original
justification (Codex hooks uncertain) died when the hooks engine went
official and stable, and what remained was uninvited reading of files
containing full transcripts (P2-adjacent) plus a second sensing
implementation for users who declined the front door. If a harness's
hooks are unreliable, that harness is unsupported — not worked around;
that fence is promoted to P11 because "just tail the log" is exactly
the well-meaning PR a principle exists to stop. Root deltas: P11,
D15 amendment, §6 rewrite. *Rejected:* keep-as-fallback (double
sensing, session-id reconciliation, poll machinery — all for the
declined-consent case); defer-with-tripwire (the tripwire — enterprise
`requirements.toml` marketplace allowlisting blocking real users — is
recorded in D15, but the code is deleted, not parked). *Status:*
decided by the maintainer.

**005-D6 — Codex error degradation: no failure signal ⇒ failures read
as `working`.** *Chosen:* if the §4 recon finds no failure signal in
Codex's PostToolUse payload, Codex sessions simply never enter
`error` — failures read as `working` until Stop, documented. P10
consequence accepted and stated: a Codex failure storm shows as mere
`working`; that's on the harness (P11). *Rejected:* inferring errors
from retry patterns or output shapes (inference through the back
door, P2/P4). Root §3 note. *Status:* decided by the maintainer.

**005-D7 — Density measurement: dev-flag log, one interactive
session, eyeball verdict.** *Chosen:* the daemon logs emotes +
baseline beats under a dev flag (JSONL — also step one of any future
tuning instrumentation); one real interactive Claude Code session of
genuine work (30–60min; headless runs never fire permission
`Notification`s); the verdict is the maintainer reading the log against D26's
own rubric — no automated threshold, because "meaningful beats" is a
judgment. One harness calibrates both: the `instructions` string is
shared. *Rejected:* automated density gates (false precision over a
model-behavior judgment); measuring in the scenario player (synthetic
agents don't exercise instruction wording). *Status:* decided
by the maintainer.

**005-D8 — Plugin hooks invoke an app-maintained launcher shim.**
*Chosen:* a GitHub-distributed plugin cannot bake a per-machine app
path into its hook commands, so they invoke a stable-path shim
(`~/.lares/bin/lares-forwarder`, platform-appropriate form) that the
app re-stamps with the current binary path on every launch —
version-locked to the running app by construction, consistent with
the thin-plugin rule. Research settled the addressing:
Codex hook commands are shell commands (official docs show command
substitution in examples; `~` paths work in `command` fields), and a
`command_windows` per-platform override exists in TOML
(`commandWindows` in JSON) — so the plugin
carries `command: LARES_HARNESS_PID=$PPID ~/.lares/bin/lares-forwarder`
and `commandWindows: call "%USERPROFILE%\.lares\bin\lares-forwarder.cmd"`.
`~` addresses the shim; it can't replace it — the forwarder needs the
app binary (`ELECTRON_RUN_AS_NODE`, D14), which lives at no
home-stable path on either OS, so something machine-local must record
it and the shim is the minimal such artifact. Recon against installed
Codex 0.134.0 confirmed `~`/`%USERPROFILE%` expansion and the Windows
shell. *Rejected:* baking absolute
paths into the plugin (breaks on every machine but the author's); a
curl one-liner in the plugin (external dependency, D14 already
rejected it); stamping into Codex's `PLUGIN_DATA` dir (Lares writing
into a harness-owned directory, and the app can't reliably locate it).
*Flagged:* this decision surfaced during doc drafting, after the
grilling. *Status:* decided by the maintainer.

**005-D9 — A liveness pid is truthful or absent.** *Chosen:* both
harnesses launch command hooks through a short-lived shell, so the
forwarder's old `process.ppid` is the shell, not the harness. POSIX
hook commands export the shell's `$PPID` as `LARES_HARNESS_PID`; the
forwarder validates and stamps it. On Windows the shell exposes no
usable parent pid — Codex runs hooks via `cmd` (no parent pid at
all), Claude Code via Git Bash (whose `$PPID` is an MSYS pid, not a
Windows pid) — so Windows commands clear that variable and the
forwarder omits `pid`, falling back to §3's existing 30-minute
silence reap. The wire contract stays frozen because `pid` was
already optional. *Live-smoke correction:* the writer
originally emitted `cmd` syntax on Windows for Claude Code, but
Claude Code runs shell-form hooks through Git Bash on every platform
— `set "VAR=1"` silently set nothing and Electron launched as a GUI
app. The Claude Code command is now POSIX on all platforms; only the
Codex shim keeps a `cmd` form. A real-Git-Bash regression test pins
this. *Rejected:* stamping the known-wrong shell pid (sessions
disappear on the first probe); stamping an MSYS pid (fails the same
way, slower); walking the Windows process table (P11 plus
platform-specific machinery for weaker truth). *Status:* decided during
slice implementation.
