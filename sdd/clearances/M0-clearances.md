# M0 Clearances — license reads

**Artifact:** Clearance note · **Project:** Lares · **Date:** 2026-07-25 · **Seals:** D19, D20

Evidence standard (agreed 2026-07-25): the published license texts are the
"confirmed in writing" of the M0 exit gate — quoted clauses, URLs, retrieval
dates. Escalation to a direct Live2D inquiry reserved for genuine ambiguity;
none was found. All quotes retrieved 2026-07-25 from live pages.

---

## 1. D19 — Hiyori under the Free Material License

**Scope:** v1 bundles **one** character: Hiyori Momose (Live2D Original
Character, official sample). Other samples (Haru/Mao/Mark/Natori/Rice/Wanko)
deliberately unread — read their per-character terms before ever bundling.
Akari remains excluded (D19, test-stream-only terms).

**Sources**
- Free Material License Agreement (EN):
  https://www.live2d.com/eula/live2d-free-material-license-agreement_en.html
- Live2D Cubism Sample Data terms (per-character supplementary terms):
  https://www.live2d.com/en/learn/sample/model-terms/
- Sample collection page: https://www.live2d.com/en/learn/sample/

**Key clauses (FML)**
- §2.1.3 grant: "The Customer, as long as the Customer complies with terms
  and conditions for utilizing each Live2D Original Character described in
  each download page thereof, is licensed to use, alter and Distribute
  Live2D Original Character for Purpose of Use only."
- §2.1.3.1 (General User / Small-Scale Enterprise): "Purpose of Use:
  irrespective of commercial or Non-commercial purposes."
- §1 definition, Distribute: "to perform, show, publicly transmit, display
  or distribute the Material, in whole or in part, or publications
  containing the Derivative Work and Output File that are produced using
  the Material available to third parties with or without consideration."
- §2.1.5 notice duty: "shall indicate the copyright notice designated in
  terms and conditions for utilizing each Live2D Original Character."
- §1.23 Small-Scale Enterprise: "enterprises with Latest Sales of less than
  10 million yen (including individuals…)." Founder qualifies (individual,
  under threshold); the §2.1.3.1 grant therefore applies.
- §4.1.1/§4.1.2 default prohibitions on redistribution/modification are
  each prefixed "Except as expressly permitted in this Agreement" — §2.1.3
  is that express permission for Live2D Original Characters.

**Hiyori per-character supplementary term**
- "No changes of any kind to the design of this character are permitted."
- Reading: runtime parameter animation, bundled expression/motion playback,
  and locally-authored `.exp3.json` gap expressions (D25 rung 2) drive
  parameters within the rig; they do not alter the character's design.
  Never modify or redistribute altered Hiyori artwork/model files.

**Required copyright notice (verbatim, from sample-data terms)**
- Long form (about screens, READMEs, store descriptions):
  "This content uses sample data owned and copyrighted by Live2D Inc. The
  sample data are utilized in accordance with terms and conditions set by
  Live2D Inc. This content itself is created at the author's sole
  discretion."
- Short form (no description field available):
  "This content uses sample data owned and copyrighted by Live2D Inc."

**Conclusion — CONFIRMED.** Bundling Hiyori (unaltered original files) in
the distributed app is an express §2.1.3 Distribute grant for a General
User / Small-Scale Enterprise, commercial or not, conditional on the
per-character terms and the notice above. Ship the FML text, Hiyori's
per-character terms, and the long-form notice with the app.

### D19 additive clearance — Haru (2026-07-30)

**Exact artifact.** Haru PRO sample, converted from Cubism 2.1 and exported
2020-09-17 for SDK 3.0 / Cubism 3.0 (3.2), obtained from Live2D's official
Haru sample page:
https://www.live2d.com/en/learn/sample/haru/

Local artifact anchors:

- official `haru_ja.zip` SHA-256
  `3686daa9ed014d0d56c623ef66ba85132fbee3558d2e3e34a154d833c86cebdd`
  from `https://cubism.live2d.com/sample-data/bin/haru/haru_ja.zip`;
- `ReadMe.txt` SHA-256
  `8592116af30a8d6bd31b1b57748c4f83f154ef8fe76d14ba6cf44a6bd94f8431`;
- `runtime/haru.moc3` SHA-256
  `6b1076c2ca8bcc18f680c13c8cb76c713f1a64c5d3767a71c73dc5107c618149`;
- `runtime/haru.model3.json` SHA-256
  `3e567677bb27353969291fd76027dfc9aec5f1bf09575c77de306b54db756245`;
- curated `haru.model3.json` SHA-256
  `be32a3d098fd37a996b1262cf308f804d7c2816c2d6d1c4ba7c74e06b2787e5c`.

**Terms.** Haru is listed as a Live2D Original Character by the current
Terms of Use for Live2D Cubism Sample Data:
https://www.live2d.com/eula/live2d-sample-model-terms_en.html

The FML §2.1.3 and §2.1.3.1 grant already recorded above therefore applies,
subject to the same General User / Small-Scale Enterprise scope. Haru's
official page records no extra per-character restriction beyond the sample
terms. The required long-form notice is copied verbatim into
`characters/haru/NOTICE`.

**Sound decision.** The sample credits voice to 癒月, but neither the Haru
page nor its README expressly grants sound redistribution. FML §2.1.3
forbids use, distribution, or redistribution of included sound data unless
expressly permitted. Lares therefore packages the curated model3 above with
the optional motion `Sound` entries removed, excludes every `.wav`, and keeps
the same stripping as a defensive runtime rule. Source/editor `.cmo3` and
`.can3` files and the untouched artist model3 are also excluded from builds.

**Conclusion — CONFIRMED WITH VOICE EXCLUDED.** The curated Haru runtime
files may replace Hiyori as D33's selected default under the same notice and
eligibility conditions. This clearance does not authorize the voice files or
another sample character.

## 2. D20 — Cubism Core: bundled with notice

**Sources**
- Live2D Proprietary Software License Agreement (governs Cubism Core):
  https://www.live2d.com/eula/live2d-proprietary-software-license-agreement_en.html
- Cubism SDK license overview: https://www.live2d.com/en/sdk/license/

**Key clauses**
- §1.15 Redistributable Code: "the Object Code form or Source Code form
  which is indicated in the 'RedistributableFiles.txt' file included in the
  Software."
- §1.4 Derivative Work: "application, animation, or any work developed
  through using all or any part of the Software." Lares is one.
- §5.1 grant: "The Customer may copy and distribute the Redistributable
  Code. In addition, the Customer may allow the Distributors of Derivative
  Works and Output Files to copy and distribute the Redistributable Code as
  a part of the Derivative Works and Output Files of the Customer."
- §5.2 conditions: add major functions using the code (yes — the entire
  renderer); require equivalent protective provisions downstream (ship
  Live2D's terms in third-party notices); indemnify Live2D; redistribute
  as-is in original form (never patch the Core).
- §2.2 exemption: General Users / Qualified Educational Institutions /
  Small-Scale Enterprises are exempt from the Publication License Agreement
  and fee. SDK page confirms: "License only required upon releasing your
  content," individuals and small-scale enterprises exempt. No fee, no
  registration, no pre-release filing applies to Lares.
- §6.8 license carve-out: may not release "any software code or content of
  the Software … under a license that is not from Live2D." The Core can
  never be placed under Apache-2.0.
- ¥20M/year mandatory-statement clause on the SDK page applies to tracking
  software (VTube-class content-production apps); not applicable to Lares.
  Noted in case scope ever drifts that way.

**Conclusion — CONFIRMED, D20 sealed as bundled-with-notice.**
- The shipped installer bundles `live2dcubismcore` with Live2D's copyright
  notice and license reference in the app's third-party notices (§5.1
  grant; §5.2 conditions above).
- §6.8 compliance mechanic: the Core is **not committed to the Apache-2.0
  repo**; the build/package step fetches it from Live2D's official
  distribution. Repo stays pure Apache-2.0; users still get zero-effort
  first run.

**M1a verification hooks** (recorded here, not blockers)
- Confirm `live2dcubismcore` appears in `RedistributableFiles.txt` of the
  SDK release actually pulled (§1.15 makes that file the authority).
- pixi-live2d-display's Cubism 4 support vendors the Cubism Framework
  (Live2D Open Software License — a separate, source-available agreement).
  Read it when the dependency lands in M1a; out of M0 scope (M0 covers FML
  + Core per ROADMAP).

## 3. lares.io registration

Deferred by the maintainer 2026-07-25. Not in the M0 exit gate; must land before
launch prep (M5). D17 unaffected.

## 4. M1a verification hooks — both hooks closed

**Retrieval date:** 2026-07-26.

### RedistributableFiles.txt verdict — CONFIRMED

Downloaded the official Cubism SDK for Web zip and unzipped it (scratchpad
only, never the repo). `Core/RedistributableFiles.txt` reads:

```
The following is a list of files available for redistribution
under the terms of the Live2D Proprietary Software License Agreement:

- live2dcubismcore.d.ts
- live2dcubismcore.js
- live2dcubismcore.min.js
```

`live2dcubismcore.min.js` — the file `scripts/fetch-assets.mjs` vendors —
is listed. §1.15's authority condition (D20) is satisfied.

**SDK version checked:** Cubism 5 SDK for Web R5 (tag `5-r.5`, released
2026-04-02) — the current stable release at retrieval time.

### Cubism Core source — pin corrected during verification

`https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js`
serves real, correctly-licensed JS — but Live2D's own `download.js` on the
SDK download page labels that path **"Cubism 5.2 (Legacy URL)"**: it is a
stale, older Core (207,155 bytes) than the one bundled in the current SDK
release. `scripts/fetch-assets.mjs` instead pins the versioned path,
confirmed byte-identical (228,042 bytes) to `Core/live2dcubismcore.min.js`
inside `CubismSdkForWeb-5-r.5.zip` and to Live2D's "Latest" pointer as of
the retrieval date. Versioned path chosen over "Latest" so the pin is
reproducible rather than a silently-moving target.

**Re-pinned 2026-07-26 to Core 5.2 (`core/05`, 207,155 bytes)** after the
001-D2 runtime spike isolated a Core 5.3 clip-mask regression against the
chosen runtime package (see slice 001 DECISIONS). Same official CDN, still
a versioned path (byte-identical to the "Cubism 5.2 (Legacy URL)"
pointer). Redistribution authority unchanged: `RedistributableFiles.txt`
in the Cubism-4-era SDK zip (`CubismSdkForWeb-4-r.7.zip`, checked
2026-07-26) lists `live2dcubismcore.min.js` with wording identical to the
5-r.5 listing quoted above.

### Hiyori source — CubismWebSamples GitHub repo, not the sample-data zip

Per 001-D3, Hiyori is fetched at setup rather than committed. The script
sources it from Live2D org's official **`CubismWebSamples`** repository
(the git mirror the SDK samples app itself uses), pinned to commit
`ed1e0b714826d92469b9e51cacc3346f4e393f03` (tag `5-r.5`, same release as
the SDK zip verified above), path `Samples/Resources/Hiyori/`. Same
official FML-licensed assets as the sample-data zip — the repo's root
`LICENSE.md` lists `Samples/Resources/Hiyori` under the Free Material
License, matching D19's read. This keeps the fetch script zero-dependency:
`Hiyori.model3.json` is fetched first, its `FileReferences` parsed, then
every referenced file fetched individually (18 files; no `Expressions`
array present — relevant to acceptance A7).

### Exact pinned URLs

- Core: `https://cubism.live2d.com/sdk-web/core/06/live2dcubismcore.min.js`
- Hiyori base: `https://raw.githubusercontent.com/Live2D/CubismWebSamples/ed1e0b714826d92469b9e51cacc3346f4e393f03/Samples/Resources/Hiyori/`

### License surprises — none

Checked CubismWebSamples' root `NOTICE.md`/`LICENSE.md` and looked for a
Hiyori-folder-local license/readme in both the git repo and the unzipped
SDK (none exists — licensing lives only at the repo/zip root). Nothing
contradicts §1: Hiyori sits under the FML alongside the other seven
samples, per-character terms unchanged.

### Open Software License read — Cubism Framework (second hook closed)

The Cubism Framework (the TypeScript layer above the Core) is governed by
the **Live2D Open Software License Agreement**:
https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html
It is vendored by every pixi-live2d-display-lineage package *and* ships
with the official Web SDK — so this read holds regardless of which
runtime path 001-D2 lands on. Read 2026-07-26 during the runtime spike.

**Key clauses**
- §2.1 grant: "Live2D grants the Customer a non-exclusive right to use,
  copy, show, demonstrate and alter the Software for lawful purposes."
- §5.7 restriction: "The Customer may not release any software code or
  content of the Software included in the Software or Output File under
  a license that is not from Live2D."

**Conclusion — CONFIRMED, same treatment as the Core (D20).** Using and
shipping the Framework (directly or inside a runtime package) is granted;
what is forbidden is relicensing it. The Framework code is never
represented as Apache-2.0 regardless of any npm package's stated MIT
license, and the app's third-party notices carry the Open Software
License reference alongside the Core and FML notices. No new blocker; no
change to D19/D20.
