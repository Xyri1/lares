#!/usr/bin/env node
// Fetches the proprietary Live2D Cubism Core and the Hiyori sample runtime
// into gitignored paths. Neither ships in the repo: license §6.8 compels
// excluding the Core (D20); Hiyori exclusion is repo-hygiene (slice
// decision 001-D3, sdd/slices/001-canvas/DECISIONS.md).
//
// Usage: node scripts/fetch-assets.mjs [--force]
//   --force  re-download even if a target file already exists
//
// Zero dependencies (Node >=24 built-in fetch). Idempotent: skips files
// that already exist unless --force is given. Exits non-zero on any
// failure so `pnpm fetch-assets` fails loudly in CI/first-run.

import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FORCE = process.argv.includes('--force');

// Live2D's official Web SDK CDN. Verified 2026-07-25: serves
// live2dcubismcore.min.js (real JS, Live2D copyright header) with 200 OK.
// NOTE: the "…/sdk-web/cubismcore/…" path is labeled "Cubism 5.2 (Legacy
// URL)" in Live2D's own download.js — it serves an older Core (207155
// bytes) than the one bundled in the current SDK release 5-r.5 (Core 5.3,
// 228042 bytes). This versioned path is byte-identical to that 5.3 Core
// and to the "Latest" pointer as of the pin date, so it's used instead.
const CORE_URL = 'https://cubism.live2d.com/sdk-web/core/06/live2dcubismcore.min.js';
const CORE_DEST = join(ROOT, 'vendor/live2d/live2dcubismcore.min.js');

// Live2D org's official CubismWebSamples repo, pinned to the "5-r.5" release
// commit (Cubism 5 SDK for Web R5) — never a moving branch. We fetch
// Hiyori.model3.json first, then every file it references in
// FileReferences, so this stays zero-dep (no unzip needed).
const HIYORI_COMMIT = 'ed1e0b714826d92469b9e51cacc3346f4e393f03'; // tag 5-r.5
const HIYORI_BASE = `https://raw.githubusercontent.com/Live2D/CubismWebSamples/${HIYORI_COMMIT}/Samples/Resources/Hiyori/`;
const HIYORI_DEST = join(ROOT, 'characters/hiyori/runtime');

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/** Downloads url to dest unless it already exists (skipped without --force). Returns the file's bytes either way. */
async function fetchTo(url, dest) {
  if (!FORCE && (await exists(dest))) {
    console.log(`skip  ${dest} (exists)`);
    return readFile(dest);
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} fetching ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, buf);
  console.log(`fetch ${dest} (${buf.length} bytes)`);
  return buf;
}

async function fetchCore() {
  await fetchTo(CORE_URL, CORE_DEST);
}

async function fetchHiyori() {
  const modelDest = join(HIYORI_DEST, 'Hiyori.model3.json');
  const modelBuf = await fetchTo(HIYORI_BASE + 'Hiyori.model3.json', modelDest);
  const { FileReferences: refs } = JSON.parse(modelBuf.toString('utf8'));

  const files = new Set([refs.Moc]);
  for (const t of refs.Textures ?? []) files.add(t);
  for (const key of ['Physics', 'Pose', 'UserData', 'DisplayInfo']) {
    if (refs[key]) files.add(refs[key]);
  }
  for (const e of refs.Expressions ?? []) files.add(e.File);
  for (const group of Object.values(refs.Motions ?? {})) {
    for (const m of group) files.add(m.File);
  }

  for (const rel of files) {
    await fetchTo(HIYORI_BASE + rel, join(HIYORI_DEST, rel));
  }
}

try {
  await fetchCore();
  await fetchHiyori();
} catch (err) {
  console.error(`fetch-assets: ${err.message}`);
  process.exit(1);
}
