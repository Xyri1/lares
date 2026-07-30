# Slice 008 — Ship · DECISIONS

Slice-scoped forks settled at the slice grilling. Distribution
staging and the bundled-character rule amend root D19/D30; managed
storage is promoted to root D33. D21/D29 are amended by 008-D9; D32
otherwise stands.

---

**008-D1 — The tray is the entire product shell.** *Chosen:* no
settings window and no Dock/taskbar presence; character, scale, DND,
login, position, calibration, update, uninstall, and quit actions live
in the native tray. DND hides the body only and persists. Scale is
five presets; Reset Position uses the bottom-right of the primary
display. *Rejected:* a dedicated preferences window (surface with no
settings that need it); DND pausing the daemon (would discard session
history). *Status:* decided by the maintainer.

**008-D2 — Characters are managed copies under `userData`.**
*Chosen:* import always copies into
`app.getPath("userData")/characters`; first run seeds whichever
redistribution-cleared default package the build explicitly selects,
and upgrades never overwrite managed data. Same-named packages coexist
with numbered tray labels, no manifest-ID/schema change. *Rejected:*
running from external directories (removable/path-drift failures);
hardcoding Hiyori as the product default; adding a package ID solely
for UI disambiguation. *Status:* decided by the maintainer.

**008-D3 — Folder import accepts one unambiguous runtime model.**
*Chosen:* extracted directories only; accept a ready Lares package or
a raw tree containing exactly one `.model3.json`, preserve its tree,
and reuse slice 007's union-of-index-and-scan import/validation.
Zero/multiple models refuse; `.cmo3`/`.can3` alone refuse. *Rejected:*
guessing the first model (silent wrong import); direct ZIP extraction
(archive safety and root selection are a separate convenience).
*Status:* decided by the maintainer.

**008-D4 — Character changes are transactional.** *Chosen:* validate
and load a candidate before persisting it active; failed imports or
selections leave the current Lar running and report the error.
Session rows, affect, mood, position, scale, and DND survive a
successful switch; character-specific expression playback may reset.
The newest successful import activates immediately. *Rejected:* app
restart to switch (unnecessary loss of continuity); committing active
selection before body load (blank desktop on failure). *Status:*
decided by the maintainer.

**008-D5 — Calibration is a tray-armed invitation, not a skill.**
*Chosen:* D32's red/yellow/no-dot state; **Map expressions…** copies
the kickoff prompt and arms new-session MCP instructions, then
disarms on completion or manual re-toggle. *Rejected for this slice:*
skill files (the maintainer will perform the manual pass); unsolicited mapping
prompts. *Status:* decided by the maintainer.

**008-D6 — Update checks are scheduled, conditional, and
non-installing.** *Chosen:* on every launch and every 24 hours while
running, default-on with a tray toggle; manual check always available;
GitHub Releases conditional requests; notify/open the release page,
never download or install. Automatic failures are quiet, manual
failures visible. *Rejected:* a timer-only first check (misses short
sessions); event-only checks (misses long-running apps); an updater
framework (M5a has no signed public artifact to install). *Status:*
decided by the maintainer.

**008-D7 — M5a distribution is manual and unsigned.** *Chosen:*
native-OS manual builds of a macOS 13+ universal DMG and Windows
10/11 x64 NSIS installer; transfer them to clean machines and document
Gatekeeper/SmartScreen bypass. Future one-line scripts are tested only
against local fixtures. *Deferred together to M5b:* production
signing/notarization, Apple Developer Program enrollment, Windows
code-signing, GitHub Actions publication, public Release assets, and
production one-line URLs. *Rejected:* calling an unsigned local build
a public release; splitting M5a again when its local install story
fits one slice. *Status:* decided by the maintainer.

**008-D8 — Uninstall separates integration cleanup from user-data
deletion.** *Chosen:* the supported macOS in-app flow and Windows
uninstaller always remove the app and Lares-owned hooks/MCP entries/
shims; an unchecked-by-default **Also delete Lares data** checkbox
controls imported characters, authored work, calibration, settings,
and window state. *Rejected:* silently deleting authored/user data;
leaving hook commands pointing at a removed app. *Status:* decided
by the maintainer.

**008-D9 — Tray-triggered harness-native integration setup.**
*Chosen:* **Configure Agent Integrations…** is an explicit consent
gate, then Lares invokes a compatible harness-owned plugin manager
with fixed argument arrays and post-verifies exact JSON status. Codex
manager discovery spans standalone launchers and the manager bundled
with either desktop app; capability probes continue past missing,
inaccessible, or outdated candidates. Direct executables remain
shell-free. A package-manager launcher may be resolved or invoked by a
fixed OS shell command containing only Lares-owned literal arguments.
Missing or failed managers get copyable manual commands; Claude
reload/new session and Codex new-task plus `/hooks` guidance remain
visible. *Rejected:* first-PATH-hit or version-only selection; arbitrary
shell interpolation; direct harness-config writes; Codex app-server's
under-development plugin mutation methods; bundling Codex; startup or
background installation; bypassing hook trust; a settings window.
*Rationale:* one tray action covers App-only and CLI-only installs on
both platforms while Codex still owns the shared home, plugin storage,
policy, and trust. *Status:* amended by the maintainer 2026-07-30.
