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
  it('waits for the overlay commit acknowledgement before finalizing the root', async () => {
    const overlay = new Body('overlay')
    const assets = new CharacterAssetState('/characters/first')
    const broker = new CharacterLoadBroker(assets, () => overlay, 1000)

    const prepared = broker.prepare(1, '/characters/second', { id: 1 })
    expect(overlay.sent[0]).toEqual({ channel: 'character:prepare', value: { id: 1 } })
    expect(assets.resolve('lares://characters/model')?.root).toBe('/characters/first')
    broker.receive('overlay', { id: 1, ok: true, inventory: INVENTORY })
    await expect(prepared).resolves.toEqual(INVENTORY)

    const commit = { id: 1, cues: [{ name: 'Expression', params: { Param: 0.5 } }] }
    const committed = broker.commit(1, commit)
    expect(overlay.sent.at(-1)).toEqual({ channel: 'character:commit', value: commit })
    expect(assets.resolve('lares://characters/model')?.root).toBe('/characters/first')
    broker.receiveCommit('overlay', { id: 1, ok: true })
    await expect(committed).resolves.toBeUndefined()

    expect(broker.finalize(1)).toBe(true)
    expect(overlay.sent.at(-1)).toEqual({ channel: 'character:finalize', value: 1 })
    expect(assets.resolve('lares://characters/model')?.root).toBe('/characters/second')
  })

  it('rolls back on commit acknowledgement timeout and ignores a late result', async () => {
    vi.useFakeTimers()
    try {
      const overlay = new Body('overlay')
      const assets = new CharacterAssetState('/characters/first')
      const broker = new CharacterLoadBroker(assets, () => overlay, 50)
      const prepared = broker.prepare(1, '/characters/second', { id: 1 })
      broker.receive('overlay', { id: 1, ok: true, inventory: INVENTORY })
      await prepared
      const committed = broker.commit(1, { id: 1, cues: [] })
      const rejected = expect(committed).rejects.toThrow('commit acknowledgement timed out')

      await vi.advanceTimersByTimeAsync(50)
      await rejected
      expect(overlay.sent.at(-1)).toEqual({ channel: 'character:rollback', value: 1 })
      expect(assets.resolve('lares://candidate/1/model')).toBeNull()
      expect(broker.receiveCommit('overlay', { id: 1, ok: true })).toBe(false)
      expect(broker.finalize(1)).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('cleans an unacknowledged prepare without waiting for a later switch', async () => {
    vi.useFakeTimers()
    try {
      const body = new Body('overlay')
      const assets = new CharacterAssetState('/characters/first')
      const broker = new CharacterLoadBroker(assets, () => body, 50)
      const prepared = broker.prepare(1, '/characters/second', { id: 1 })
      const rejected = expect(prepared).rejects.toThrow('prepare timed out')

      await vi.advanceTimersByTimeAsync(50)
      await rejected
      expect(body.sent.at(-1)).toEqual({ channel: 'character:cancel', value: 1 })
      expect(assets.resolve('lares://candidate/1/model')).toBeNull()
      expect(broker.receive('overlay', { id: 1, ok: true, inventory: INVENTORY })).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('rolls back immediately when the overlay is destroyed during commit', async () => {
    const overlay = new Body('overlay')
    const broker = new CharacterLoadBroker(
      new CharacterAssetState('/characters/first'),
      () => overlay,
      30_000
    )
    const prepared = broker.prepare(1, '/characters/second', { id: 1 })
    broker.receive('overlay', { id: 1, ok: true, inventory: INVENTORY })
    await prepared
    const committed = broker.commit(1, { id: 1, cues: [] })
    const rejected = expect(committed).rejects.toThrow('destroyed')

    overlay.destroy()

    await rejected
  })

  it('rolls back when the body reports a tentative commit exception', async () => {
    const body = new Body('overlay')
    const assets = new CharacterAssetState('/characters/first')
    const broker = new CharacterLoadBroker(assets, () => body, 30_000)
    const prepared = broker.prepare(1, '/characters/second', { id: 1 })
    broker.receive('overlay', { id: 1, ok: true, inventory: INVENTORY })
    await prepared
    const committed = broker.commit(1, { id: 1, cues: [] })

    expect(
      broker.receiveCommit('overlay', { id: 1, ok: false, error: 'driver refresh failed' })
    ).toBe(true)
    await expect(committed).rejects.toThrow('driver refresh failed')
    expect(body.sent.at(-1)).toEqual({ channel: 'character:rollback', value: 1 })
    expect(assets.resolve('lares://candidate/1/model')).toBeNull()
  })

  it('cleans commit state before best-effort rollback when commit delivery throws', async () => {
    const body = new Body('overlay')
    const assets = new CharacterAssetState('/characters/first')
    const broker = new CharacterLoadBroker(assets, () => body, 30_000)
    const prepared = broker.prepare(1, '/characters/second', { id: 1 })
    broker.receive('overlay', { id: 1, ok: true, inventory: INVENTORY })
    await prepared
    body.throwOnChannel = 'character:commit'

    await expect(broker.commit(1, { id: 1, cues: [] })).rejects.toThrow('commit send failed')
    expect(assets.resolve('lares://candidate/1/model')).toBeNull()
    expect(broker.receiveCommit('overlay', { id: 1, ok: true })).toBe(false)
  })

  it('keeps the old root when main rolls an acknowledged commit back', async () => {
    const body = new Body('overlay')
    const assets = new CharacterAssetState('/characters/first')
    const broker = new CharacterLoadBroker(assets, () => body, 30_000)
    const prepared = broker.prepare(1, '/characters/second', { id: 1 })
    broker.receive('overlay', { id: 1, ok: true, inventory: INVENTORY })
    await prepared
    const committed = broker.commit(1, { id: 1, cues: [] })
    broker.receiveCommit('overlay', { id: 1, ok: true })
    await committed

    expect(broker.rollback(1, 'main publication failed')).toBe(true)
    expect(body.sent.at(-1)).toEqual({ channel: 'character:rollback', value: 1 })
    expect(assets.resolve('lares://characters/model')?.root).toBe('/characters/first')
    expect(assets.resolve('lares://candidate/1/model')).toBeNull()
  })

  it('retains rollback state and the old root when finalize delivery throws', async () => {
    const body = new Body('overlay')
    const assets = new CharacterAssetState('/characters/first')
    const broker = new CharacterLoadBroker(assets, () => body, 30_000)
    const prepared = broker.prepare(1, '/characters/second', { id: 1 })
    broker.receive('overlay', { id: 1, ok: true, inventory: INVENTORY })
    await prepared
    const committed = broker.commit(1, { id: 1, cues: [] })
    broker.receiveCommit('overlay', { id: 1, ok: true })
    await committed
    body.throwOnChannel = 'character:finalize'

    expect(() => broker.finalize(1)).toThrow('finalize send failed')
    expect(assets.resolve('lares://characters/model')?.root).toBe('/characters/first')
    expect(assets.resolve('lares://candidate/1/model')?.root).toBe('/characters/second')

    body.throwOnChannel = null
    expect(broker.rollback(1, 'finalize handoff failed')).toBe(true)
    expect(body.sent.at(-1)).toEqual({ channel: 'character:rollback', value: 1 })
    expect(assets.resolve('lares://candidate/1/model')).toBeNull()
  })

  it('rolls back immediately when prepare delivery fails', async () => {
    const body = new Body('overlay')
    body.throwOnChannel = 'character:prepare'
    const assets = new CharacterAssetState('/characters/first')
    const broker = new CharacterLoadBroker(assets, () => body, 30_000)

    await expect(broker.prepare(1, '/characters/second', { id: 1 })).rejects.toThrow(
      'prepare send failed'
    )
    expect(assets.resolve('lares://candidate/1/model')).toBeNull()
    await expect(broker.commit(1)).rejects.toThrow('not prepared')
  })

  it('cleans pending state before best-effort cancel delivery', async () => {
    const body = new Body('overlay')
    const assets = new CharacterAssetState('/characters/first')
    const broker = new CharacterLoadBroker(assets, () => body, 30_000)
    const prepared = broker.prepare(1, '/characters/second', { id: 1 })
    body.throwOnChannel = 'character:cancel'

    expect(() => broker.receive('overlay', { id: 1, ok: false, error: 'body failed' })).not.toThrow()
    await expect(prepared).rejects.toThrow('body failed')
    expect(assets.resolve('lares://candidate/1/model')).toBeNull()
  })

  it('cleans prepared state before best-effort cancel delivery', async () => {
    const body = new Body('overlay')
    const assets = new CharacterAssetState('/characters/first')
    const broker = new CharacterLoadBroker(assets, () => body, 30_000)
    const prepared = broker.prepare(1, '/characters/second', { id: 1 })
    broker.receive('overlay', { id: 1, ok: true, inventory: INVENTORY })
    await prepared
    body.throwOnChannel = 'character:cancel'

    expect(() => broker.cancel(1)).not.toThrow()
    expect(assets.resolve('lares://candidate/1/model')).toBeNull()
    await expect(broker.commit(1)).rejects.toThrow('not prepared')
  })

  it('cancels a prepared predecessor when superseded', async () => {
    const body = new Body('overlay')
    const broker = new CharacterLoadBroker(
      new CharacterAssetState('/characters/first'),
      () => body,
      1000
    )
    const first = broker.prepare(1, '/characters/second', { id: 1 })
    broker.receive('overlay', { id: 1, ok: true, inventory: INVENTORY })
    await first

    expect(broker.cancel(1, 'character switch was superseded')).toBe(true)
    expect(body.sent.at(-1)).toEqual({ channel: 'character:cancel', value: 1 })
    await expect(broker.commit(1)).rejects.toThrow('not prepared')
  })
})
