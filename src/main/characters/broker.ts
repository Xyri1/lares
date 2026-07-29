import { parseInventory, type ParamInfo } from '../nerves'

export interface CharacterBody {
  id: string
  isDestroyed(): boolean
  send(channel: string, value: unknown): void
  onDestroyed(listener: () => void): () => void
}

export class CharacterAssetState {
  private readonly candidates = new Map<number, string>()
  private activeCandidate: number | null = null

  constructor(private activeRoot: string) {}

  prepare(id: number, root: string): void {
    this.candidates.set(id, root)
  }

  cancel(id: number): boolean {
    if (id === this.activeCandidate || !this.candidates.delete(id)) return false
    return true
  }

  commit(id: number): boolean {
    const root = this.candidates.get(id)
    if (!root) return false
    if (this.activeCandidate !== null && this.activeCandidate !== id) {
      this.candidates.delete(this.activeCandidate)
    }
    this.activeCandidate = id
    this.activeRoot = root
    return true
  }

  resolve(value: string): { root: string; path: string } | null {
    if (value.includes('?') || value.includes('#')) return null
    const active = /^lares:\/\/characters\/(.+)$/.exec(value)
    if (active) {
      const path = safePath(active[1])
      return path ? { root: this.activeRoot, path } : null
    }
    const candidate = /^lares:\/\/candidate\/([1-9]\d*)\/(.+)$/.exec(value)
    if (!candidate) return null
    const id = Number(candidate[1])
    const root = Number.isSafeInteger(id) ? this.candidates.get(id) : undefined
    const path = safePath(candidate[2])
    return root && path ? { root, path } : null
  }
}

function safePath(rawPath: string): string | null {
  try {
    const segments = rawPath.split('/')
    if (
      segments.some((raw) => {
        const segment = decodeURIComponent(raw)
        return (
          !raw ||
          segment === '.' ||
          segment === '..' ||
          segment.includes('/') ||
          segment.includes('\\')
        )
      })
    ) {
      return null
    }
    return segments.map(decodeURIComponent).join('/')
  } catch {
    return null
  }
}

interface Bodies {
  bodies: CharacterBody[]
  removeDestroyedListeners: Array<() => void>
}

interface Pending extends Bodies {
  results: Map<string, ParamInfo[]>
  resolve(inventory: ParamInfo[]): void
  reject(error: Error): void
  timer: ReturnType<typeof setTimeout>
}

export class CharacterLoadBroker {
  private readonly pending = new Map<number, Pending>()
  private readonly prepared = new Map<number, Bodies>()

  constructor(
    private readonly assets: CharacterAssetState,
    private readonly bodies: () => CharacterBody[],
    private readonly timeoutMs: number
  ) {}

  prepare(id: number, root: string, payload: unknown): Promise<ParamInfo[]> {
    this.assets.prepare(id, root)
    const bodies = this.bodies().filter((body) => !body.isDestroyed())
    if (bodies.length === 0) {
      this.assets.cancel(id)
      return Promise.reject(new Error('character body is unavailable'))
    }
    return new Promise((resolve, reject) => {
      const transaction: Pending = {
        bodies,
        results: new Map(),
        resolve,
        reject,
        timer: setTimeout(
          () => this.fail(id, new Error('character body prepare timed out')),
          this.timeoutMs
        ),
        removeDestroyedListeners: []
      }
      transaction.removeDestroyedListeners = bodies.map((body) =>
        body.onDestroyed(() =>
          this.fail(id, new Error(`character body ${JSON.stringify(body.id)} was destroyed`))
        )
      )
      this.pending.set(id, transaction)
      try {
        for (const body of bodies) body.send('character:prepare', payload)
      } catch (error) {
        this.fail(id, error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  receive(bodyId: string, raw: unknown): boolean {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return false
    const result = raw as Record<string, unknown>
    if (!Number.isSafeInteger(result.id)) return false
    const id = result.id as number
    const pending = this.pending.get(id)
    if (!pending || !pending.bodies.some((body) => body.id === bodyId)) return false
    if (result.ok === false && typeof result.error === 'string') {
      this.fail(id, new Error(result.error))
      return true
    }
    if (result.ok !== true) return false
    const inventory = parseInventory(result.inventory)
    if (!inventory) {
      this.fail(id, new Error('renderer returned an invalid body inventory'))
      return true
    }
    pending.results.set(bodyId, inventory)
    if (pending.results.size !== pending.bodies.length) return true
    const inventories = [...pending.results.values()]
    if (inventories.some((value) => JSON.stringify(value) !== JSON.stringify(inventories[0]))) {
      this.fail(id, new Error('character bodies returned different parameter inventories'))
      return true
    }
    this.cleanupPending(id)
    this.prepared.set(id, {
      bodies: pending.bodies,
      removeDestroyedListeners: pending.bodies.map((body) =>
        body.onDestroyed(() => this.cancel(id, 'character body was destroyed before commit'))
      )
    })
    pending.resolve(inventories[0])
    return true
  }

  commit(id: number, payload: unknown = id): boolean {
    const prepared = this.prepared.get(id)
    if (!prepared || prepared.bodies.some((body) => body.isDestroyed())) {
      this.cancel(id, 'character body was destroyed before commit')
      return false
    }
    this.prepared.delete(id)
    for (const remove of prepared.removeDestroyedListeners) remove()
    for (const body of prepared.bodies) body.send('character:commit', payload)
    this.assets.commit(id)
    return true
  }

  cancel(id: number, reason = 'character switch was cancelled'): boolean {
    const pending = this.pending.get(id)
    const prepared = this.prepared.get(id)
    const bodies = pending?.bodies ?? prepared?.bodies
    if (!bodies) return this.assets.cancel(id)
    if (pending) {
      this.cleanupPending(id)
      pending.reject(new Error(reason))
    }
    if (prepared) {
      this.prepared.delete(id)
      for (const remove of prepared.removeDestroyedListeners) remove()
    }
    for (const body of bodies) {
      if (!body.isDestroyed()) body.send('character:cancel', id)
    }
    this.assets.cancel(id)
    return true
  }

  private fail(id: number, error: Error): void {
    const pending = this.pending.get(id)
    if (!pending) return
    this.cleanupPending(id)
    for (const body of pending.bodies) {
      if (!body.isDestroyed()) body.send('character:cancel', id)
    }
    this.assets.cancel(id)
    pending.reject(error)
  }

  private cleanupPending(id: number): void {
    const pending = this.pending.get(id)
    if (!pending) return
    this.pending.delete(id)
    clearTimeout(pending.timer)
    for (const remove of pending.removeDestroyedListeners) remove()
  }
}
