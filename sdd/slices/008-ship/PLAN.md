# Slice 008 — Ship · PLAN

Execution notes; disposable after the gate closes. Steps ordered by
dependency; tests land with their step. M4's live gate closes before
step 1 begins.

---

## 1. Managed character root

Move runtime package discovery from the source tree to
`userData/characters`; seed an explicitly selected bundled package
only when the managed root is empty. Reuse slice 007 validation and
import logic for the folder picker: ready package or exactly one
recursive `.model3.json`, copied without flattening, zero/many
refused. Collision-safe copies and numbered tray labels, no schema
change. Pure temp-dir tests: A1, A2.

## 2. Transactional live switching

Make the active package mutable at the existing brain/body seam:
candidate validation + body load before active-setting commit; swap
cues, sources, inventory, and protocol asset root together. Preserve
sessions, E/M, position, scale, DND; clear only package-specific
expression playback. Failure keeps the current Lar. Tests plus a
renderer-load failure fixture: A3.

## 3. Config + tray

One small JSON config module under `userData`, using the existing
atomic-write discipline. Build the native tray directly in main:
characters/import, scale presets, DND, login, reset position,
calibration, updates, consented harness-native integration setup,
uninstall, quit. Remove Dock/taskbar presence;
DND toggles body visibility only. Wire launch-at-login through
Electron's native setting and reuse the existing bounds guard for
Reset Position. One small module hides the fixed Claude/Codex plugin
commands behind a consent-and-result interface; tests inject the
runner and never touch real config or network. Tests: config
round-trip/defaults, menu-action effects, and A7a; manual tray smoke
covers A4.

## 4. Calibration surfacing

Derive the D32 dot from the active manifest. **Map expressions…**
toggles one persisted armed flag, copies the existing docs kickoff
prompt, and adds the invite only when new MCP sessions initialize;
completion disarms it. No skill files. Server/menu tests: A5.

## 5. Update check

Small main-side GitHub Releases client using Electron/Node fetch:
launch call, one 24-hour timer, manual call, persisted ETag/tag/time,
native notification opening the release URL. No updater dependency
and no download path. A local HTTP fixture covers every A6 branch;
one disclosed live request stays in the clean-machine gate.

## 6. Packaging + uninstall

Add the minimum electron-builder metadata/commands for a macOS
universal DMG and Windows x64 NSIS installer. Package from explicit
resource allowlists: forwarder, fetched Core, chosen cleared default
package, notices — never the whole local `characters/` tree. Fill the
real app metadata/icons. Add the supported uninstall entry points,
both calling the existing adapter-removal pass: Windows continues into
the NSIS uninstaller; macOS moves the app bundle to Trash after
cleanup. Data deletion remains behind the unchecked confirmation.
Artifact inspection covers A7.

## 7. Local install-script fixtures

Keep future shell/PowerShell installers source-URL-agnostic and run
them only against local fixture artifacts. No GitHub Action, public
Release, production URL, signing, or notarization in this slice.

**Implemented.** The POSIX fixture ran locally through
install, launch, confirmed-uninstall invocation, spaced paths, missing
input, and exit-code propagation without leaving its temporary root.
PowerShell is unavailable on the macOS build host; the committed
`scripts/install-local.windows.test.ps1` is the single Windows-native
fixture command. Static coverage confirms neither entry point nor its
fixture contains a URL.

## 8. Clean-machine gate

Build on each native OS, mechanically inspect both macOS architecture
slices and every packaged resource, then transfer artifacts. Apple
Silicon macOS 13+ and x64 Windows 10/11: documented warning bypass →
install → tray-only start → bundled character + disabled import item →
settings/restart → calibration arm → disclosed update check →
consented integration setup → Claude reload/new session → Codex new
task and `/hooks` trust → uninstall twice (retain data, delete data).
Record A8/A9 verdicts
here; on pass, close M5a in ROADMAP.

**Implementation evidence.** `pnpm test` passed 312 tests;
the production build passed. The final
unsigned macOS artifact built locally, inspected 5,215 resource/archive
paths, and reported `x86_64 arm64`. Its SHA-256 was
`89fd08b71a17261e0c25e1187caf465769aebc8eaf8fd775179b0fd009978afd`.
The packaged forwarder and adapter-cleanup CLI both exited successfully.
A macOS cross-build compiled the Windows NSIS script and the unpacked
payload inspected as x64 with installer SHA-256
`51e16fa0294b070e5fa2f6c8031e987144bbd60daaf620fd141834f34d126397`;
this is syntax evidence only, not the required native Windows build.

**A8/A9: PASS (maintainer-confirmed 2026-08-07).** The clean Apple
Silicon macOS and x64 Windows passes completed the manual gate. M5a is
closed in the ROADMAP.

## Standing risks

- macOS and Windows unsigned warnings are expected in M5a; any claim
  of warning-free install is a gate bug, not implementation work.
- Packaging must name the default character explicitly. A recursive
  `characters/` include can leak private local assets.
- Character switching spans daemon, protocol, and renderer state; the
  commit point is successful body load, or rollback is cosmetic.
- Deleting `userData` before adapter cleanup can lose paths needed by
  removal; owned integrations always come off first.
- The GitHub check is Lares's sole app-owned request. Integration
  setup may only delegate P3's explicit user-initiated download to the
  harness CLIs; tests inject the runner and touch no real config or
  network.
