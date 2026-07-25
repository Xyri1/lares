import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

export interface Live2dBlock {
  model: string
  [key: string]: unknown
}

export type ManifestResult =
  | { ok: true; name: string; live2d: Live2dBlock }
  | { ok: false; error: string }

// M1a checks only (slice SPEC §4): format, identity.name/license, model file
// exists. Full schema validation lands in M4. On success the live2d block is
// returned with `model` resolved to an absolute path; the renderer receives
// only this block over IPC (P6 — raw paths travel no further than the block).
export function loadCharacter(manifestPath: string): ManifestResult {
  if (!existsSync(manifestPath)) {
    return { ok: false, error: `Character manifest not found: ${manifestPath}` }
  }

  let json: unknown
  try {
    json = JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch (err) {
    return {
      ok: false,
      error: `Character manifest is not valid JSON (${manifestPath}): ${(err as Error).message}`
    }
  }

  const m = json as {
    format?: unknown
    identity?: { name?: unknown; license?: unknown }
    renderers?: { live2d?: Record<string, unknown> }
  }

  if (m.format !== 'lares/1') {
    return { ok: false, error: `Unsupported manifest format ${JSON.stringify(m.format)} — expected "lares/1"` }
  }
  const name = m.identity?.name
  if (typeof name !== 'string' || name === '') {
    return { ok: false, error: 'Manifest missing identity.name' }
  }
  if (typeof m.identity?.license !== 'string' || m.identity.license === '') {
    return { ok: false, error: 'Manifest missing identity.license' }
  }
  const live2d = m.renderers?.live2d
  if (!live2d || typeof live2d.model !== 'string') {
    return { ok: false, error: 'Manifest missing renderers.live2d.model' }
  }

  const modelPath = resolve(dirname(manifestPath), live2d.model)
  if (!existsSync(modelPath)) {
    return {
      ok: false,
      error: `Model file not found: ${modelPath} — run "pnpm fetch-assets" to download the bundled assets`
    }
  }

  return { ok: true, name, live2d: { ...live2d, model: modelPath } }
}
