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

  canCommit(id: number): boolean {
    return this.candidates.has(id)
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

interface BodyState {
  body: CharacterBody
  removeDestroyedListener: () => void
}

interface Pending extends BodyState {
  resolve(inventory: ParamInfo[]): void
  reject(error: Error): void
  timer: ReturnType<typeof setTimeout>
}

interface AwaitingCommit extends BodyState {
  resolve(): void
  reject(error: Error): void
  timer: ReturnType<typeof setTimeout>
}

function bestEffortSend(body: CharacterBody, channel: string, value: unknown): void {
  if (body.isDestroyed()) return
  try {
    body.send(channel, value)
  } catch {
    // Cleanup is authoritative; renderer cancellation is best-effort.
  }
}

export class CharacterLoadBroker {
  private readonly pending = new Map<number, Pending>()
  private readonly prepared = new Map<number, BodyState>()
  private readonly committing = new Map<number, AwaitingCommit>()
  private readonly committed = new Map<number, BodyState>()

  constructor(
    private readonly assets: CharacterAssetState,
    private readonly body: () => CharacterBody | null,
    private readonly timeoutMs: number
  ) {}

  prepare(id: number, root: string, payload: unknown): Promise<ParamInfo[]> {
    this.assets.prepare(id, root)
    const body = this.body()
    if (!body || body.isDestroyed()) {
      this.assets.cancel(id)
      return Promise.reject(new Error('character body is unavailable'))
    }
    return new Promise((resolve, reject) => {
      const transaction: Pending = {
        body,
        resolve,
        reject,
        timer: setTimeout(
          () => this.failPrepare(id, new Error('character body prepare timed out')),
          this.timeoutMs
        ),
        removeDestroyedListener: () => {}
      }
      transaction.removeDestroyedListener = body.onDestroyed(() =>
        this.failPrepare(id, new Error(`character body ${JSON.stringify(body.id)} was destroyed`))
      )
      this.pending.set(id, transaction)
      try {
        body.send('character:prepare', payload)
      } catch (error) {
        this.failPrepare(id, error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  receive(bodyId: string, raw: unknown): boolean {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return false
    const result = raw as Record<string, unknown>
    if (!Number.isSafeInteger(result.id)) return false
    const id = result.id as number
    const pending = this.pending.get(id)
    if (!pending || pending.body.id !== bodyId) return false
    if (result.ok === false && typeof result.error === 'string') {
      this.failPrepare(id, new Error(result.error))
      return true
    }
    if (result.ok !== true) return false
    const inventory = parseInventory(result.inventory)
    if (!inventory) {
      this.failPrepare(id, new Error('renderer returned an invalid body inventory'))
      return true
    }
    this.cleanupPending(id)
    this.prepared.set(id, {
      body: pending.body,
      removeDestroyedListener: pending.body.onDestroyed(() =>
        this.rollback(id, 'character body was destroyed before commit')
      )
    })
    pending.resolve(inventory)
    return true
  }

  commit(id: number, payload: unknown = id): Promise<void> {
    const prepared = this.prepared.get(id)
    if (!prepared) return Promise.reject(new Error('character switch is not prepared'))
    if (prepared.body.isDestroyed()) {
      this.rollback(id, 'character body was destroyed before commit')
      return Promise.reject(new Error('character body was destroyed before commit'))
    }
    this.prepared.delete(id)
    prepared.removeDestroyedListener()
    return new Promise((resolve, reject) => {
      const transaction: AwaitingCommit = {
        body: prepared.body,
        resolve,
        reject,
        timer: setTimeout(
          () =>
            this.failCommit(id, new Error('character body commit acknowledgement timed out')),
          this.timeoutMs
        ),
        removeDestroyedListener: () => {}
      }
      transaction.removeDestroyedListener = prepared.body.onDestroyed(() =>
        this.failCommit(id, new Error('character body was destroyed during commit'))
      )
      this.committing.set(id, transaction)
      try {
        prepared.body.send('character:commit', payload)
      } catch (error) {
        this.failCommit(id, error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  receiveCommit(bodyId: string, raw: unknown): boolean {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return false
    const result = raw as Record<string, unknown>
    if (!Number.isSafeInteger(result.id)) return false
    const id = result.id as number
    const committing = this.committing.get(id)
    if (!committing || committing.body.id !== bodyId) return false
    if (result.ok === false && typeof result.error === 'string') {
      this.failCommit(id, new Error(result.error))
      return true
    }
    if (result.ok !== true) return false
    this.cleanupCommitting(id)
    this.committed.set(id, {
      body: committing.body,
      removeDestroyedListener: committing.body.onDestroyed(() =>
        this.rollback(id, 'character body was destroyed before finalization')
      )
    })
    committing.resolve()
    return true
  }

  finalize(id: number): boolean {
    const committed = this.committed.get(id)
    if (!committed) return false
    if (committed.body.isDestroyed()) throw new Error('character body was destroyed before finalize')
    if (!this.assets.canCommit(id)) throw new Error('character asset transaction cannot finalize')
    // Electron preserves FIFO for sends to the same live WebContents. A
    // successful send is the finalization handoff; a throw leaves rollback
    // state and the old root intact.
    committed.body.send('character:finalize', id)
    this.committed.delete(id)
    committed.removeDestroyedListener()
    this.assets.commit(id)
    return true
  }

  cancel(id: number, reason = 'character switch was cancelled'): boolean {
    return this.rollback(id, reason)
  }

  rollback(id: number, reason = 'character switch was rolled back'): boolean {
    const pending = this.pending.get(id)
    const prepared = this.prepared.get(id)
    const committing = this.committing.get(id)
    const committed = this.committed.get(id)
    const body = pending?.body ?? prepared?.body ?? committing?.body ?? committed?.body
    if (!body) return this.assets.cancel(id)
    if (pending) {
      this.cleanupPending(id)
      pending.reject(new Error(reason))
    }
    if (prepared) {
      this.prepared.delete(id)
      prepared.removeDestroyedListener()
    }
    if (committing) {
      this.cleanupCommitting(id)
      committing.reject(new Error(reason))
    }
    if (committed) {
      this.committed.delete(id)
      committed.removeDestroyedListener()
    }
    this.assets.cancel(id)
    bestEffortSend(
      body,
      committing || committed ? 'character:rollback' : 'character:cancel',
      id
    )
    return true
  }

  private failPrepare(id: number, error: Error): void {
    const pending = this.pending.get(id)
    if (!pending) return
    this.cleanupPending(id)
    this.assets.cancel(id)
    pending.reject(error)
    bestEffortSend(pending.body, 'character:cancel', id)
  }

  private failCommit(id: number, error: Error): void {
    const committing = this.committing.get(id)
    if (!committing) return
    this.cleanupCommitting(id)
    this.assets.cancel(id)
    committing.reject(error)
    bestEffortSend(committing.body, 'character:rollback', id)
  }

  private cleanupPending(id: number): void {
    const pending = this.pending.get(id)
    if (!pending) return
    this.pending.delete(id)
    clearTimeout(pending.timer)
    pending.removeDestroyedListener()
  }

  private cleanupCommitting(id: number): void {
    const committing = this.committing.get(id)
    if (!committing) return
    this.committing.delete(id)
    clearTimeout(committing.timer)
    committing.removeDestroyedListener()
  }
}
