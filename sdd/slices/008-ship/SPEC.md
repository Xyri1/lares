# Slice 008 — Ship · SPEC

**Artifact:** Slice SPEC · **Slice:** 008-ship (ROADMAP M5a) · **Status:** Open

**Why / gate.** M5a turns the source-run alpha into a locally
installable desktop app without pretending it is a public release.
Exit gate: manually built, unsigned installers are transferred to a
clean Apple Silicon Mac and a clean x64 Windows machine; each installs
with the documented Gatekeeper/SmartScreen bypass, starts tray-only,
imports and switches a real character, survives restart, checks for
updates as specified, and uninstalls without leaving owned
integrations behind.

M4's live gate must close before M5a implementation begins. M5a is one
full slice; production signing, public publishing, and launch polish
move together to M5b rather than splitting this slice.

---

## 1. Scope

**In:** tray-only product shell; persistent R9 settings; managed
character storage, first-run seed, folder import, selection, and live
switching; D32 calibration surfacing; disclosed GitHub update checks;
explicit D29 agent-integration setup through the harness plugin CLIs;
manual unsigned macOS/Windows packaging; installer/uninstaller
behavior; local-fixture checks for the future one-line install path.

**Out (fence):** skill files (the maintainer performs the manual pass); direct
ZIP import; Linux and Windows ARM; signing, notarization, Apple
Developer Program enrollment, and Windows code-signing; GitHub Actions
release publishing; public GitHub Release assets; production one-line
install commands; M5b launch media and bilingual pass.

## 2. Managed characters and import

The runtime character root is
`app.getPath("userData")/characters/`. Source-tree character
directories are build inputs, never the user's live library. On first
run, if the managed root contains no valid package, the app copies the
build's explicitly selected, redistribution-cleared default package
there. Later launches and upgrades never replace or edit managed
packages. The selected default is a packaging input, not a Hiyori
product contract.

**Import Character…** accepts an extracted directory:

- A ready Lares package contains one `lar.character.json`; the whole
  package is copied and validated.
- A raw Live2D directory is searched recursively for
  `.model3.json`. Exactly one is required; zero or multiple are a
  visible refusal, never a guessed selection.
- The source tree is preserved without flattening. Runtime references
  must remain inside the copied package. Indexed and recursively found
  `.exp3.json`/`.motion3.json` files are unioned and deduped through
  slice 007's shared import/validation path.
- `.cmo3`/`.can3` without a runtime export are not importable. ZIPs
  must be extracted by the user first.

Imports are copies; Lares never runs a character from its source
location. Same-named imports are both retained in collision-safe
directories. The tray labels them `Name`, `Name (2)`, … without
changing the `lares/1` manifest schema, and the newest successful
import becomes active.

Import and selection are two-phase: validate and load the candidate
before persisting it as active. A failed candidate leaves the current
character visible and active and reports the offending package; a
failed import is not added to the selector. Switching preserves live
session rows, affect and mood, overlay position, scale, and DND state.
Character-specific expression playback may reset because cue and knob
identities do not cross packages.

## 3. Tray and settings

Lares has no settings window and no Dock/taskbar presence. The tray is
the product shell:

- character selector and **Import Character…**
- scale presets 50%, 75%, 100%, 125%, 150% (100% default)
- **Do Not Disturb** (off default)
- **Launch at Login** (off default)
- **Reset Position**
- calibration status + **Map expressions…**
- **Automatically Check for Updates** (on default) and
  **Check for Updates…**
- **Configure Agent Integrations…**
- **Uninstall Lares…** and **Quit**

Scale, DND, launch-at-login, automatic-update preference, active
character, calibration-armed state, and window position persist under
`userData`. DND hides only the body: the daemon, sessions, affect,
mood, ingress, and cached body inventory continue running. Reset
Position places the Lar at the bottom-right of the current primary
display using the existing screen-bounds guard.

**Configure Agent Integrations…** discloses the user-initiated public
download and the plugin's hooks plus local MCP connection before doing
anything. On confirmation it invokes only the official `claude` and
`codex` plugin CLIs with the fixed §6 commands, never a shell or
direct harness-config writer. Exact JSON status checks skip already
configured harnesses and post-verify changes; missing/failing CLIs
produce copyable manual commands. Claude applies on a new session or
`/reload-plugins`; Codex applies to a new CLI/ChatGPT-desktop Codex
task, with `/hooks` trust still mandatory.

Quit is an ordinary exit and preserves integrations. Uninstall is a
separate confirmed flow. It always removes Lares-owned Claude Code
and Codex hooks, MCP entries, and launcher shims before removing the
app. Its **Also delete Lares data** checkbox is unchecked by default;
when checked it additionally removes imported characters, authored
expressions, calibration, settings, and window state. The supported
macOS in-app flow and Windows uninstaller expose the same choice.

## 4. Calibration surfacing

The active character's tray status follows D32: red dot when no cues
are calibrated, yellow when some are calibrated, no dot when all are
calibrated. This is vocabulary readiness, not an error.

**Map expressions…** toggles calibration-armed mode. Arming copies the
current character's kickoff prompt to the clipboard for an already
open session; new MCP sessions receive the one-line calibration invite
while armed. It auto-disarms when every cue is calibrated and may be
disarmed manually by selecting the item again. Switching characters
recomputes the dot and armed/completion state. No skill file ships in
this slice.

## 5. Update checking

The disclosed update check is Lares's sole app-owned non-loopback
request (P3/D21). The separately confirmed integration action may
launch harness-owned plugin managers for a user-initiated download.
When automatic checks are enabled, Lares checks GitHub Releases once
on every app launch and every 24 hours while it remains running. The
manual item always checks immediately. Requests use conditional
GitHub responses (`ETag` / `If-None-Match`) and persist only the tag,
release URL, ETag, and last-check time.

Lares never downloads or installs an update in M5a. A newer release
produces a native notification/action that opens its GitHub Release;
an automatic offline/error result stays quiet, while a manual failure
is visible. Tests use a local fixture server; the clean-machine gate
performs one disclosed live check.

## 6. Manual distribution

M5a produces local artifacts only:

- macOS 13+ universal DMG (Apple Silicon + Intel), unsigned
- Windows 10/11 x64 NSIS installer, unsigned

Build commands are manual on their native OS. The package includes the
app, forwarder, explicitly selected default character, Cubism Core,
and every required third-party/character notice; packaging uses an
allowlist so private or incidental `characters/` content cannot leak
into an artifact. The macOS universal binary's two slices are
inspected mechanically; live acceptance runs on Apple Silicon.

Gatekeeper and SmartScreen warnings are expected at this stage. The
M5a docs state the exact bypass and make no clean-first-run claim.
Future one-line installer scripts are exercised only against local
fixture artifacts. M5b owns signing/notarization, GitHub Actions,
public Release assets, and production installer URLs.

## 7. Acceptance (GWT)

**A1 — Managed seed and upgrade.** GIVEN empty managed storage WHEN
Lares first launches THEN the build-selected package is copied and
loaded; GIVEN user-modified managed data WHEN a newer build launches
THEN no managed file is overwritten.

**A2 — Folder import.** GIVEN ready-package, one-model raw,
zero-model, and two-model fixtures WHEN each directory is imported
THEN the first two copy, validate, harvest indexed-plus-loose assets,
and activate; the latter two refuse visibly without changing the
active character.

**A3 — Duplicate and live switch.** GIVEN two same-named valid
packages and one load-failing package WHEN imported/selected THEN the
valid packages appear as `Name` and `Name (2)`, newest active; live
session/affect/mood/window settings survive switching; the failing
candidate leaves the previous Lar running.

**A4 — Tray persistence.** GIVEN tray-only Lares WHEN the active
character, scale, DND, launch-at-login, position, and update preference
are changed and the app restarts THEN every setting persists; DND
never stops daemon state, and Reset Position restores the bottom-right
primary-display placement.

**A5 — Calibration.** GIVEN uncalibrated, partial, and complete
packages WHEN each is active THEN the dot is red, yellow, and absent;
arming copies the kickoff prompt and changes only new-session MCP
instructions; completion or re-toggle disarms it.

**A6 — Update schedule.** GIVEN a local release fixture with ETag
support WHEN Lares launches, remains running for 24 hours, receives
304, finds a newer tag, goes offline, and is checked manually THEN
the request schedule, conditional cache, notification/link, quiet
automatic failure, and visible manual failure match §5.

**A7 — Package contents.** GIVEN both manual package commands WHEN
artifacts are inspected THEN platform/architecture match §6; app,
forwarder, Core, selected default character, and notices are present;
private/unselected characters and source-only files are absent.

**A7a — Agent integration setup.** GIVEN missing, already configured,
unavailable, and failing harness CLIs WHEN the tray action is
cancelled or confirmed THEN cancellation runs nothing; confirmation
uses only the four fixed §6 command/argument arrays, never a shell,
direct config write, or trust bypass; exact post-status is visible and
manual commands are copyable for failures.

**A8 — Clean-machine gate.** GIVEN the transferred unsigned DMG and
NSIS installer on a clean Apple Silicon Mac and x64 Windows machine
WHEN the operator follows the documented warning bypass THEN Lares installs,
starts tray-only, imports/switches a real character, survives restart,
configures each installed harness through the tray, preserves Codex
hook review, and performs a disclosed live update check.

**A9 — Uninstall and local install scripts.** GIVEN both clean-machine
installs WHEN uninstall runs with data deletion unchecked and checked
in separate passes THEN app and owned integrations are always removed,
data is retained then removed as selected; future one-line scripts
also install/uninstall correctly against local fixture artifacts only.
