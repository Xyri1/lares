import { describe, expect, it, vi } from 'vitest'
import { CharacterAssetState, CharacterLoadBroker, type CharacterBody } from './broker'

const INVENTORY = [
  { id: 'Param', name: 'Param', min: -1, max: 1, default: 0 }
]

class Body implements CharacterBody {
  readonly sent: Array<{ channel: string; value: unknown }> = []
  destroyed = false
  throwOnChannel: string | null = null
  private listeners = new Set<() => void>()

  constructor(readonly id: string) {}

  isDestroyed(): boolean {
    return this.destroyed
  }

  send(channel: string, value: unknown): void {
    if (channel === this.throwOnChannel) throw new Error(`${channel} send failed`)
    this.sent.push({ channel, value })
  }

  onDestroyed(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  destroy(): void {
    this.destroyed = true
    for (const listener of this.listeners) listener()
  }
}

describe('character asset transaction state', () => {
  it('commits or rolls back protocol roots and rejects traversal-shaped paths', () => {
    const assets = new CharacterAssetState('/characters/first')
    assets.prepare(1, '/characters/second')
    expect(assets.resolve('lares://characters/runtime/model.json')).toEqual({
      root: '/characters/first',
      path: 'runtime/model.json'
    })
    expect(assets.resolve('lares://candidate/1/runtime/model.json')).toEqual({
      root: '/characters/second',
      path: 'runtime/model.json'
    })
    expect(assets.resolve('lares://candidate/1/%2e%2e/secret')).toBeNull()
    expect(assets.resolve('lares://candidate/2/runtime/model.json')).toBeNull()

    assets.cancel(1)
    expect(assets.resolve('lares://candidate/1/runtime/model.json')).toBeNull()
    expect(assets.resolve('lares://characters/runtime/model.json')?.root).toBe('/characters/first')

    assets.prepare(2, '/characters/second')
    expect(assets.commit(2)).toBe(true)
    expect(assets.resolve('lares://characters/runtime/model.json')?.root).toBe('/characters/second')
    expect(assets.resolve('lares://candidate/2/runtime/model.json')?.root).toBe('/characters/second')
  })
})

describe('main character load broker', () => {
  it('prepares and commits every live body before changing the active protocol root', async () => {
    const overlay = new Body('overlay')
    const dev = new Body('dev')
    const assets = new CharacterAssetState('/characters/first')
    const broker = new CharacterLoadBroker(assets, () => [overlay, dev], 1000)

    const prepared = broker.prepare(1, '/characters/second', { id: 1 })
    expect(overlay.sent[0]).toEqual({ channel: 'character:prepare', value: { id: 1 } })
    expect(dev.sent[0]).toEqual({ channel: 'character:prepare', value: { id: 1 } })
    expect(assets.resolve('lares://characters/model')?.root).toBe('/characters/first')
    broker.receive('overlay', { id: 1, ok: true, inventory: INVENTORY })
    let settled = false
    void prepared.then(() => {
      settled = true
    })
    await Promise.resolve()
    expect(settled).toBe(false)
    broker.receive('dev', { id: 1, ok: true, inventory: INVENTORY })
    await expect(prepared).resolves.toEqual(INVENTORY)

    const commit = { id: 1, cues: [{ name: 'Expression', params: { Param: 0.5 } }] }
    expect(broker.commit(1, commit)).toBe(true)
    expect(overlay.sent.at(-1)).toEqual({ channel: 'character:commit', value: commit })
    expect(dev.sent.at(-1)).toEqual({ channel: 'character:commit', value: commit })
    expect(assets.resolve('lares://characters/model')?.root).toBe('/characters/second')
  })

  it('cancels all bodies on timeout and ignores a late prepared result', async () => {
    vi.useFakeTimers()
    try {
      const overlay = new Body('overlay')
      const dev = new Body('dev')
      const assets = new CharacterAssetState('/characters/first')
      const broker = new CharacterLoadBroker(assets, () => [overlay, dev], 50)
      const prepared = broker.prepare(1, '/characters/second', { id: 1 })
      const rejected = expect(prepared).rejects.toThrow('timed out')

      await vi.advanceTimersByTimeAsync(50)
      await rejected
      expect(overlay.sent.at(-1)).toEqual({ channel: 'character:cancel', value: 1 })
      expect(dev.sent.at(-1)).toEqual({ channel: 'character:cancel', value: 1 })
      expect(assets.resolve('lares://candidate/1/model')).toBeNull()
      expect(broker.receive('overlay', { id: 1, ok: true, inventory: INVENTORY })).toBe(false)
      expect(broker.commit(1)).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('cancels immediately when a participating body is destroyed', async () => {
    const overlay = new Body('overlay')
    const dev = new Body('dev')
    const broker = new CharacterLoadBroker(
      new CharacterAssetState('/characters/first'),
      () => [overlay, dev],
      30_000
    )
    const prepared = broker.prepare(1, '/characters/second', { id: 1 })
    const rejected = expect(prepared).rejects.toThrow('destroyed')

    dev.destroy()

    await rejected
    expect(overlay.sent.at(-1)).toEqual({ channel: 'character:cancel', value: 1 })
  })

  it('rolls back immediately when prepare delivery fails', async () => {
    const body = new Body('overlay')
    body.throwOnChannel = 'character:prepare'
    const assets = new CharacterAssetState('/characters/first')
    const broker = new CharacterLoadBroker(assets, () => [body], 30_000)

    await expect(broker.prepare(1, '/characters/second', { id: 1 })).rejects.toThrow(
      'prepare send failed'
    )
    expect(assets.resolve('lares://candidate/1/model')).toBeNull()
    expect(broker.commit(1)).toBe(false)
  })

  it('cancels a prepared predecessor when superseded', async () => {
    const body = new Body('overlay')
    const broker = new CharacterLoadBroker(
      new CharacterAssetState('/characters/first'),
      () => [body],
      1000
    )
    const first = broker.prepare(1, '/characters/second', { id: 1 })
    broker.receive('overlay', { id: 1, ok: true, inventory: INVENTORY })
    await first

    expect(broker.cancel(1, 'character switch was superseded')).toBe(true)
    expect(body.sent.at(-1)).toEqual({ channel: 'character:cancel', value: 1 })
    expect(broker.commit(1)).toBe(false)
  })
})
