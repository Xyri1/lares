# Distribution

Lares installers are intentionally unsigned. Gatekeeper and SmartScreen
warnings are expected and their exact bypasses are documented below. M5a
artifacts are built manually for clean-machine testing; M5b publishes the
same unsigned artifact shape through GitHub Releases.

## Automated public release

A semantic `package.json` version increase pushed to `master` is the sole
automatic release signal. Corrections, decreases, and other code, dependency,
or documentation pushes do not package. A manual run packages the current
version from `master`:

```sh
gh workflow run release.yml --ref master
```

After tests and both native package inspections pass, GitHub Actions creates
`v<version>` at that commit, publishes both installers with SHA-256 files,
and marks versions containing `-` as prereleases. An existing tag fails
rather than being moved or overwritten.

## Build and inspect

Run on the target OS from a clean checkout:

```sh
pnpm install
pnpm fetch-assets
pnpm package:preflight
```

`build/default-character` explicitly names the bundled package. Change that
one-line selection only to a redistribution-cleared package with its own
`NOTICE`; preflight refuses a missing notice or invalid runtime reference.

On macOS 13+:

```sh
pnpm package:mac
pnpm package:inspect -- dist/mac-universal/Lares.app darwin universal
lipo -archs dist/mac-universal/Lares.app/Contents/MacOS/Lares
shasum -a 256 dist/Lares-*-macOS-universal-unsigned.dmg
```

The inspector must pass and `lipo` must print both `x86_64` and `arm64`.

On x64 Windows 10/11:

```powershell
pnpm package:win
pnpm package:inspect -- dist\win-unpacked win32 x64
Get-AuthenticodeSignature .\dist\Lares-*-Windows-x64-unsigned.exe
Get-FileHash .\dist\Lares-*-Windows-x64-unsigned.exe -Algorithm SHA256
```

The inspector must pass, the unpacked app payload must report x64, and the
signature status is expected to be `NotSigned`.

The mechanical inspector reads the packaged ASAR and executable. It requires
the app, hook forwarder, Cubism Core, exactly one selected
`default-character`, its character-specific `NOTICE`, `LICENSE`, and the app
`NOTICE`; it rejects a whole `characters/` tree, IceGirl, extra character
manifests, and `.cmo3`/`.can3` source files.

## Local-only install entry points

These scripts never download. The artifact path is supplied explicitly.

```sh
./scripts/install-local.sh install "/absolute/path/Lares-0.1.0-alpha.4-macOS-universal-unsigned.dmg"
./scripts/install-local.sh uninstall
```

The macOS uninstall action opens Lares's native confirmation. **Also delete
Lares data** is unchecked by default. If Lares is already running, use
**Uninstall Lares…** from its tray instead.

```powershell
.\scripts\install-local.ps1 install "C:\local\Lares-0.1.0-alpha.4-Windows-x64-unsigned.exe"
.\scripts\install-local.ps1 uninstall
.\scripts\install-local.ps1 uninstall -DeleteData
```

The PowerShell fixture uses silent NSIS mode: omission of `-DeleteData`
retains data; including it deletes data. Apps & Features and the tray-launched
uninstaller use the native unchecked checkbox instead.

Automated checks redirect every destination to temporary fixture roots. Run
the Windows-native fixture with:

```powershell
.\scripts\install-local.windows.test.ps1
```

## macOS clean-machine pass — unclaimed

Use a clean Apple Silicon Mac running macOS 13 or newer.

1. Transfer the DMG and verify its SHA-256 against the build machine.
2. Open the DMG, copy **Lares.app** to `/Applications`, and try to open it.
3. The unsigned/unnotarized warning is expected. After that blocked attempt,
   open **System Settings → Privacy & Security**, scroll to Security, choose
   **Open Anyway**, authenticate, then choose **Open** in the repeated prompt.
   Apple warns that this override should be used only when the source and
   integrity are trusted; see [Open a Mac app from an unknown
   developer](https://support.apple.com/guide/mac-help/open-a-mac-app-from-an-unknown-developer-mh40616/mac)
   and [Safely open apps on your Mac](https://support.apple.com/en-us/102445).
4. Confirm Lares starts tray-only: tray icon present, no Dock icon and no
   settings window.
5. Import a real extracted Live2D folder. Import the same-named package again;
   confirm both appear as `Name` and `Name (2)`, switching is live, and a
   broken candidate leaves the prior Lar visible.
6. Change character, scale, DND, launch-at-login, position, and automatic
   update preference. Restart and confirm every setting persists. Confirm DND
   hides only the body and **Reset Position** uses the primary display.
7. Check red/yellow/complete calibration states. Arm mapping, verify the
   kickoff prompt reaches the clipboard, and verify only a newly opened MCP
   session receives the invite. Re-toggle or complete mapping to disarm.
8. Choose **Configure Agent Integrations…** and cancel once; verify no
   marketplace or plugin changes. Choose it again, accept the disclosed
   download, and verify both installed harnesses report configured. Start a
   new Claude Code session (or run `/reload-plugins`). Start a new local Codex
   task in the CLI or ChatGPT desktop app and review/trust Lares with `/hooks`.
   Confirm both drive baseline states and an agent emote over the plugin MCP
   entry. On a machine that ran a pre-009 build, also confirm the first app
   launch removed the legacy Claude settings/MCP block and Codex hooks file.
9. Run **Check for Updates…** once. This is the one disclosed app-owned request to
   `https://api.github.com/repos/Xyri1/lares/releases/latest`; verify a manual
   failure/no-update is visible and no update is downloaded or installed.
10. Choose **Uninstall Lares…**, leave **Also delete Lares data** unchecked,
    and confirm. Verify the app, any legacy Codex hooks-file and Claude
    settings/MCP entries, and the launcher shims are gone, while imported
    characters, authored expressions, settings, calibration, and position
    remain under Lares application support. The Claude Code and Codex
    plugins are user-installed and stay behind; remove them with
    `/plugin uninstall lares@lares` (Claude Code) and `/plugins` (Codex) as
    their READMEs document.
11. Reinstall and confirm the retained data is reused. Uninstall again with
    **Also delete Lares data** checked; verify the same integrations are gone
    and the Lares application-support directory is removed.

Verdict: **UNCLAIMED — the maintainer must record the real machine result.**

## Windows clean-machine pass — unclaimed

Use a clean x64 Windows 10 or Windows 11 machine.

1. Transfer the NSIS installer and verify its SHA-256 against the build
   machine.
2. Run it. An unsigned build is expected to show **Windows protected your
   PC**; choose **More info → Run anyway**, then complete installation.
   Microsoft documents that unsigned apps require **Run anyway** and that
   enterprise policy can disable the bypass in [SmartScreen reputation for
   Windows app developers](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation);
   its own sample install guidance shows [More info → Run
   anyway](https://learn.microsoft.com/en-us/windows/mixed-reality/design/add-custom-home-environments#trying-a-sample-environment).
   If policy or Smart App Control removes that option, record the gate as
   blocked on that machine; do not disable system-wide protection to create a
   false pass.
3. Repeat macOS steps 4–9 for tray-only startup, real import, duplicate/live
   switching, persistence/restart, DND/reset, calibration, both harness plugin
   installs, Codex hook trust, and the one disclosed live update request.
4. Launch uninstall from the tray or Apps & Features. Leave **Also delete
   Lares data** unchecked. Verify app and owned integrations are removed and
   `%APPDATA%\Lares` data is retained (the user-installed plugins stay;
   `/plugin uninstall lares@lares` in Claude Code and `/plugins` in Codex
   remove them).
5. Reinstall, confirm retained data is reused, then uninstall with the checkbox
   selected. Verify integrations and the Lares app-data directory are gone.

Verdict: **UNCLAIMED — the maintainer must record the real machine result.**
