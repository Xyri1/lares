import { createServer, type Server } from 'node:http'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  checkLatestRelease,
  compareVersions,
  createUpdateChecks,
  isLaresReleaseUrl,
  loadUpdateCache,
  saveUpdateCache,
  type UpdateCache
} from './updates'

describe('update cache and version trust boundary', () => {
  it('compares normal release tags without a semver dependency', () => {
    expect(compareVersions('v1.2.4', '1.2.3')).toBe(1)
    expect(compareVersions('1.2.3', 'v1.2.3')).toBe(0)
    expect(compareVersions('1.1.9', '1.2.0')).toBe(-1)
    expect(compareVersions('v0.5.0', '0.5.0-alpha.1')).toBe(1)
    expect(compareVersions('0.5.0-alpha.2', '0.5.0-alpha.1')).toBe(1)
    expect(() => compareVersions('latest', '1.2.3')).toThrow('version')
  })

  it('accepts only Lares GitHub release HTTPS URLs', () => {
    expect(isLaresReleaseUrl('https://github.com/Xyri1/lares/releases/tag/v1.2.3')).toBe(true)
    expect(isLaresReleaseUrl('http://github.com/Xyri1/lares/releases/tag/v1.2.3')).toBe(false)
    expect(isLaresReleaseUrl('https://evil.example/Xyri1/lares/releases/tag/v1.2.3')).toBe(false)
    expect(isLaresReleaseUrl('https://github.com/Xyri1/other/releases/tag/v1.2.3')).toBe(false)
  })

  it('round-trips only the four cache fields and preserves malformed bytes', async () => {
    const root = mkdtempSync(join(tmpdir(), 'lares-updates-'))
    const file = join(root, 'updates.json')
    const cache: UpdateCache = {
      tag: 'v1.2.3',
      url: 'https://github.com/Xyri1/lares/releases/tag/v1.2.3',
      etag: '"abc"',
      lastCheckAt: 42
    }
    await saveUpdateCache(file, { ...cache, ignored: 'drop' } as UpdateCache)
    expect(loadUpdateCache(file)).toEqual(cache)
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(cache)

    await saveUpdateCache(file, {
      tag: 'v2.0.0',
      url: 'https://github.com/Xyri1/lares/releases/tag/v1.0.0',
      etag: '"stale"',
      lastCheckAt: 43
    })
    expect(loadUpdateCache(file)).toEqual({ lastCheckAt: 43 })

    writeFileSync(file, '{"tag":')
    expect(loadUpdateCache(file)).toEqual({})
    expect(readFileSync(file, 'utf8')).toBe('{"tag":')
  })
})

describe('GitHub latest-release client', () => {
  let server: Server
  let endpoint: string
  let mode: 'release' | 'not-modified' | 'http-error' | 'malformed' | 'mismatched'
  const requests: Array<Record<string, string | string[] | undefined>> = []

  beforeEach(async () => {
    mode = 'release'
    requests.length = 0
    server = createServer((req, res) => {
      requests.push(req.headers)
      if (mode === 'not-modified') {
        res.writeHead(304)
        res.end()
        return
      }
      if (mode === 'http-error') {
        res.writeHead(503)
        res.end('offline')
        return
      }
      res.writeHead(200, {
        'content-type': 'application/json',
        etag: '"release-v2"'
      })
      res.end(
        mode === 'malformed'
          ? JSON.stringify({ tag_name: 'v2.0.0', html_url: 'https://evil.example/release' })
          : mode === 'mismatched'
            ? JSON.stringify({
                tag_name: 'v2.0.0',
                html_url: 'https://github.com/Xyri1/lares/releases/tag/v1.0.0'
              })
            : JSON.stringify({
                tag_name: 'v2.0.0',
                html_url: 'https://github.com/Xyri1/lares/releases/tag/v2.0.0',
                body: 'must not persist',
                assets: [{ browser_download_url: 'https://evil.example/payload.exe' }]
              })
      )
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('fixture did not bind')
    endpoint = `http://127.0.0.1:${address.port}/latest`
  })

  afterEach(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    )
  })

  it('persists the minimal 200 response, compares it, and sends ETag on 304', async () => {
    const first = await checkLatestRelease({
      endpoint,
      currentVersion: '1.0.0',
      cache: {},
      now: () => 100
    })
    expect(first).toEqual({
      newer: true,
      tag: 'v2.0.0',
      url: 'https://github.com/Xyri1/lares/releases/tag/v2.0.0',
      cache: {
        tag: 'v2.0.0',
        url: 'https://github.com/Xyri1/lares/releases/tag/v2.0.0',
        etag: '"release-v2"',
        lastCheckAt: 100
      }
    })
    expect(requests[0]?.accept).toBe('application/vnd.github+json')
    expect(requests[0]?.['x-github-api-version']).toBeTypeOf('string')

    mode = 'not-modified'
    const second = await checkLatestRelease({
      endpoint,
      currentVersion: '2.0.0',
      cache: first.cache,
      now: () => 200
    })
    expect(requests[1]?.['if-none-match']).toBe('"release-v2"')
    expect(second.newer).toBe(false)
    expect(second.cache).toEqual({ ...first.cache, lastCheckAt: 200 })
  })

  it('rejects HTTP and malformed release responses', async () => {
    mode = 'http-error'
    await expect(
      checkLatestRelease({ endpoint, currentVersion: '1.0.0', cache: {}, now: () => 1 })
    ).rejects.toThrow('503')

    mode = 'malformed'
    await expect(
      checkLatestRelease({ endpoint, currentVersion: '1.0.0', cache: {}, now: () => 1 })
    ).rejects.toThrow('release')

    mode = 'mismatched'
    await expect(
      checkLatestRelease({ endpoint, currentVersion: '1.0.0', cache: {}, now: () => 1 })
    ).rejects.toThrow('release')
  })
})

describe('update scheduling and visibility', () => {
  it('owns one timer, respects toggles, and keeps manual checks independent', async () => {
    let enabled = true
    let nextTimer = 0
    const timers = new Map<number, () => void>()
    const cleared: number[] = []
    const check = vi.fn(async (cache: UpdateCache) => ({
      newer: false,
      tag: 'v1.0.0',
      url: 'https://github.com/Xyri1/lares/releases/tag/v1.0.0',
      cache: { ...cache, tag: 'v1.0.0', lastCheckAt: (cache.lastCheckAt ?? 0) + 1 }
    }))
    const info = vi.fn()
    const errors = vi.fn()
    const checks = createUpdateChecks({
      enabled: () => enabled,
      cache: {},
      check,
      persist: async () => undefined,
      notify: vi.fn(),
      showInfo: info,
      showError: errors,
      log: vi.fn(),
      setInterval: (callback) => {
        const id = ++nextTimer
        timers.set(id, callback)
        return id
      },
      clearInterval: (id) => {
        timers.delete(id as number)
        cleared.push(id as number)
      }
    })

    await checks.start()
    expect(check).toHaveBeenCalledOnce()
    expect(timers.size).toBe(1)
    await [...timers.values()][0]!()
    expect(check).toHaveBeenCalledTimes(2)

    enabled = false
    await checks.automaticPreferenceChanged()
    expect(timers.size).toBe(0)
    expect(cleared).toHaveLength(1)

    await checks.manual()
    expect(check).toHaveBeenCalledTimes(3)
    expect(info).toHaveBeenCalledOnce()

    enabled = true
    await checks.automaticPreferenceChanged()
    expect(check).toHaveBeenCalledTimes(4)
    expect(timers.size).toBe(1)
    checks.stop()
    expect(timers.size).toBe(0)
  })

  it('notifies newer releases, keeps automatic failures quiet, and shows manual failures', async () => {
    let fail = false
    const notify = vi.fn()
    const showError = vi.fn()
    const log = vi.fn()
    const checks = createUpdateChecks({
      enabled: () => false,
      cache: {},
      check: async () => {
        if (fail) throw new Error('offline')
        return {
          newer: true,
          tag: 'v2.0.0',
          url: 'https://github.com/Xyri1/lares/releases/tag/v2.0.0',
          cache: {}
        }
      },
      persist: async () => undefined,
      notify,
      showInfo: vi.fn(),
      showError,
      log,
      setInterval: () => 1,
      clearInterval: () => undefined
    })

    await checks.manual()
    expect(notify).toHaveBeenCalledWith({
      tag: 'v2.0.0',
      url: 'https://github.com/Xyri1/lares/releases/tag/v2.0.0'
    })

    fail = true
    await checks.runAutomatic()
    expect(log).toHaveBeenCalled()
    expect(showError).not.toHaveBeenCalled()
    await checks.manual()
    expect(showError).toHaveBeenCalledWith('offline')
  })
})
