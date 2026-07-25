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

// Live2D's official Web SDK CDN, versioned path. PINNED TO CORE 5.2
// (core/05, 207155 bytes) DELIBERATELY — do not bump: Core 5.3+ (core/06)
// has a clip-mask regression against the Cubism 4 framework port inside
// pixi-live2d-display and all its forks; masked models (Hiyori) crash in
// CubismRenderer_WebGL. Known upstream: guansss/pixi-live2d-display#118.
// Verified 2026-07-26: core/05 is byte-identical to the "Cubism 5.2
// (Legacy URL)" pointer and renders Hiyori cleanly (001-D2 spike). Bump
// only together with a runtime that supports Cubism 5 (root D24).
const CORE_URL = 'https://cubism.live2d.com/sdk-web/core/05/live2dcubismcore.min.js';
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
