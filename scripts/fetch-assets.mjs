#!/usr/bin/env node
// Fetches the proprietary Live2D Cubism Core plus the Haru runtime into
// gitignored paths. Neither ships in the repo: license §6.8 compels
// excluding the Core (D20); runtime-asset exclusion is repo-hygiene (slice
// decision 001-D3, sdd/slices/001-canvas/DECISIONS.md).
//
// Usage: node scripts/fetch-assets.mjs [--force]
//   --force  re-download even if a target file already exists
//
// Zero dependencies (Node >=24 built-in fetch). Idempotent: skips files
// that already exist unless --force is given. Exits non-zero on any
// failure so `pnpm fetch-assets` fails loudly in CI/first-run.

import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
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

const HARU_URL = 'https://cubism.live2d.com/sample-data/bin/haru/haru_ja.zip';
const HARU_SHA256 = '3686daa9ed014d0d56c623ef66ba85132fbee3558d2e3e34a154d833c86cebdd';
const HARU_DEST = join(ROOT, 'characters/haru/runtime');

const require = createRequire(import.meta.url);
const electronDir = dirname(require.resolve('electron/package.json'));
const extractZip = require(require.resolve('extract-zip', { paths: [electronDir] }));

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

async function fetchHaru() {
  if (!FORCE && (await exists(join(HARU_DEST, 'haru.moc3')))) {
    console.log(`skip  ${HARU_DEST} (exists)`);
    return;
  }
  const scratch = await mkdtemp(join(tmpdir(), 'lares-haru-'));
  try {
    const archive = join(scratch, 'haru.zip');
    const bytes = await fetchTo(HARU_URL, archive);
    const digest = createHash('sha256').update(bytes).digest('hex');
    if (digest !== HARU_SHA256) throw new Error(`Haru archive checksum mismatch: ${digest}`);
    const extracted = join(scratch, 'extracted');
    await extractZip(archive, { dir: extracted });
    const runtime = join(extracted, 'runtime');
    await cp(runtime, HARU_DEST, {
      recursive: true,
      filter: (path) => {
        const rel = path.slice(runtime.length).replace(/^[/\\]/, '');
        return rel !== 'haru.model3.json' && !/^sounds(?:[/\\]|$)/.test(rel);
      }
    });
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

try {
  await fetchCore();
  await fetchHaru();
} catch (err) {
  console.error(`fetch-assets: ${err.message}`);
  process.exit(1);
}
