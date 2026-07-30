# Slice 010 — Format Compatibility · DECISIONS

Slice 010 extends the closed slice 007 format path and slice 008's D33
managed library. It does not replace either implementation.

---

**010-D1 — VTS-style Cubism 3/4 is the complete v1 Live2D runtime
claim.** *Chosen:* accept `.model3.json` packages whose MOC reports SDK
3.0–3.2, 3.3, 4.0, or 4.2; reject Cubism 2.1 and Cubism 5 outright. An
Editor 5-authored model exported for SDK 4.2 remains accepted.
*Rejected:* shipping the dependency's separate Cubism 2 stack;
carrying the Cubism 5 fork; swapping to the official SDK when a Cubism
5 model appears; guessing from extensions or model3 `"Version"`.
*Status:* decided by the maintainer.

**010-D2 — VTS compatibility means model assets, not VTS
configuration.** *Chosen:* support the model3/MOC/textures folder,
arbitrary parameter IDs/ranges, nested expressions/motions, and
optional sidecars. `.vtube.json` is ignored metadata. *Rejected:*
treating VTS tracking mappings, hotkeys, VFX, items, persistent
customization, or expression groups as part of `lares/1`. *Status:*
decided by the maintainer.

**010-D3 — Extend slice 007's union; do not create a second asset
path.** *Chosen:* model3 remains authoritative for required runtime
resources; expressions and motions remain the canonical-path union of
registered and recursively scanned files and continue through the
existing brain-side apply path. Runtime resolution is in memory and
never rewrites artist files. Exactly one unregistered physics file is
the VTS fallback; multiple are ambiguous. *Rejected:* a pixi-native
expression registry beside the existing parser; basename identity;
first-file-wins; model3 mutation. *Status:* decided by
the maintainer.

**010-D4 — Discovery makes assets callable, not emotional.** *Chosen:*
retain 007-D3's artist-name, null-coordinate cue entries so every valid
asset is immediately agent-emote-able. Only explicit calibration adds
affect coordinates for autonomous selection. *Rejected:* filename
sentiment inference; VTS hotkeys as emotions; dropping uncalibrated
assets from `list_cues`. *Status:* decided by the maintainer.

**010-D5 — Compatibility reporting enriches D33's transaction.**
*Chosen:* extend the existing shared validation report with static and
body capabilities; the app import, dev check, app load, and tests use
the same findings. D33's managed copy and validate/load-before-commit
flow remains the installer. *Rejected:* a second importer; copying
before static validation; running from arbitrary external paths.
*Status:* decided by the maintainer.

**010-D6 — The MOC gate is a body probe behind a revocable asset
root.** *Chosen:* the runtime calls Core's `csmGetMocVersion` before
revival and returns a normalized result. Main exposes the inspected
package only through an opaque, revocable `lares://` mapping; no Core
object or broad local-file proxy crosses the P6 seam. *Rejected:*
duplicating a private MOC parser in main; letting pixi fail late and
parsing its error. *Status:* decided by the maintainer after implementation
recon.

**010-D7 — Haru is the intended default and uses the generic path.**
*Chosen:* after additive D19 clearance, Haru replaces Hiyori as the
build-selected first-run Lar because her supplied expressions exercise
the VTS path. Legacy IDs live in package performance data; Hiyori stays
a regression fixture. *Rejected:* Hiyori as the permanent product
identity; IceGirl as a redistributable default; a Haru-specific loader.
*Status:* decided by the maintainer; additive D19 packaging clearance closed.

**010-D8 — Slice 007 authoring semantics stand.** *Chosen:* dedicated
preview, conversational user acceptance, direct save/update, null
coordinates, and the existing timeout remain unchanged. *Rejected:*
reintroducing the superseded five-second auto-revert or in-app pending
proposal queue. *Status:* decided by 007-D3/D5/D6; reaffirmed.
