import { readFileSync } from 'node:fs'
import { errorMessage } from './errors'
import { atomicWrite } from './fs'
import { compareVersions } from './version'

export { compareVersions } from './version'

export const LATEST_RELEASE_URL =
  'https://api.github.com/repos/Xyri1/lares/releases/latest'
const DAY_MS = 24 * 60 * 60 * 1000
const MAX_RELEASE_BODY_BYTES = 64 * 1024

export interface UpdateCache {
  tag?: string
  url?: string
  etag?: string
  lastCheckAt?: number
}

interface UpdateResult {
  newer: boolean
  tag: string
  url: string
  cache: UpdateCache
}

export function isLaresReleaseUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return (
      url.protocol === 'https:' &&
      url.hostname === 'github.com' &&
      url.port === '' &&
      url.username === '' &&
      url.password === '' &&
      url.search === '' &&
      url.hash === '' &&
      /^\/Xyri1\/lares\/releases\/tag\/[^/]+$/.test(url.pathname)
    )
  } catch {
    return false
  }
}

function isMatchingRelease(tag: string, url: string): boolean {
  return (
    /^v?\d+\.\d+\.\d+$/.test(tag) &&
    isLaresReleaseUrl(url) &&
    new URL(url).pathname === `/Xyri1/lares/releases/tag/${tag}`
  )
}

function cleanCache(value: unknown): UpdateCache {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  const raw = value as Record<string, unknown>
  const cache: UpdateCache = {}
  if (
    typeof raw.tag === 'string' &&
    typeof raw.url === 'string' &&
    isMatchingRelease(raw.tag, raw.url)
  ) {
    cache.tag = raw.tag
    cache.url = raw.url
    if (typeof raw.etag === 'string') cache.etag = raw.etag
  }
  if (
    typeof raw.lastCheckAt === 'number' &&
    Number.isFinite(raw.lastCheckAt) &&
    raw.lastCheckAt >= 0
  ) {
    cache.lastCheckAt = raw.lastCheckAt
  }
  return cache
}

export function loadUpdateCache(path: string): UpdateCache {
  try {
    return cleanCache(JSON.parse(readFileSync(path, 'utf8')))
  } catch {
    return {}
  }
}

export async function saveUpdateCache(path: string, cache: UpdateCache): Promise<void> {
  await atomicWrite(path, { ...cleanCache(cache) })
}

async function parseReleaseBody(response: Response): Promise<unknown> {
  const declared = Number(response.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > MAX_RELEASE_BODY_BYTES) {
    throw new Error('GitHub release response exceeds 64 KiB')
  }
  if (!response.body) throw new Error('GitHub release response is empty')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_RELEASE_BODY_BYTES) {
        await reader.cancel()
        throw new Error('GitHub release response exceeds 64 KiB')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown
}

export async function checkLatestRelease(options: {
  endpoint?: string
  currentVersion: string
  cache: UpdateCache
  now?: () => number
}): Promise<UpdateResult> {
  const cached = cleanCache(options.cache)
  const headers: Record<string, string> = {
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2026-03-10',
    'user-agent': 'Lares'
  }
  if (cached.etag) headers['if-none-match'] = cached.etag

  const response = await fetch(options.endpoint ?? LATEST_RELEASE_URL, {
    headers,
    redirect: 'error',
    signal: AbortSignal.timeout(15_000)
  })
  const lastCheckAt = (options.now ?? Date.now)()
  if (response.status === 304) {
    const { tag, url } = cached
    if (!tag || !url) {
      throw new Error('GitHub returned 304 without a valid cached release')
    }
    return {
      newer: compareVersions(tag, options.currentVersion) > 0,
      tag,
      url,
      cache: { ...cached, lastCheckAt }
    }
  }
  if (!response.ok) throw new Error(`GitHub release check failed (${response.status})`)

  const body = await parseReleaseBody(response)
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new Error('GitHub release response is invalid')
  }
  const { tag_name: tag, html_url: url } = body as Record<string, unknown>
  if (
    typeof tag !== 'string' ||
    typeof url !== 'string' ||
    !isMatchingRelease(tag, url)
  ) {
    throw new Error('GitHub release response is invalid')
  }
  const comparison = compareVersions(tag, options.currentVersion)
  const etag = response.headers.get('etag')
  const cache = cleanCache({ tag, url, ...(etag ? { etag } : {}), lastCheckAt })
  return {
    newer: comparison > 0,
    tag,
    url,
    cache
  }
}

export function createUpdateChecks(deps: {
  enabled(): boolean
  cache: UpdateCache
  check(cache: UpdateCache): Promise<UpdateResult>
  persist(cache: UpdateCache): Promise<void>
  notify(release: { tag: string; url: string }): void
  showInfo(): void
  showError(message: string): void
  log(message: string): void
  setInterval(callback: () => void, milliseconds: number): unknown
  clearInterval(id: unknown): void
}) {
  let cache = cleanCache(deps.cache)
  let timer: unknown

  const disarm = (): void => {
    if (timer === undefined) return
    deps.clearInterval(timer)
    timer = undefined
  }

  const run = async (manual: boolean): Promise<void> => {
    try {
      const result = await deps.check(cache)
      cache = result.cache
      await deps.persist(cache)
      if (result.newer) deps.notify({ tag: result.tag, url: result.url })
      else if (manual) deps.showInfo()
    } catch (error) {
      const message = errorMessage(error)
      deps.log(message)
      if (manual) deps.showError(message)
    }
  }

  const runAutomatic = (): Promise<void> => run(false)
  const arm = (): void => {
    if (!deps.enabled() || timer !== undefined) return
    timer = deps.setInterval(() => void runAutomatic(), DAY_MS)
  }

  return {
    async start(): Promise<void> {
      if (!deps.enabled()) return
      await runAutomatic()
      arm()
    },
    async automaticPreferenceChanged(): Promise<void> {
      disarm()
      if (!deps.enabled()) return
      await runAutomatic()
      arm()
    },
    manual: (): Promise<void> => run(true),
    runAutomatic,
    stop: disarm
  }
}
