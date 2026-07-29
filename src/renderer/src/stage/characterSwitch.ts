import type { IRuntime } from '../runtime/iface'
import type { AffectDriver } from './affect'

interface CuePayload {
  name: string
  params?: Record<string, number>
  motion?: string
}

export interface CharacterLoadRequest {
  id: number
  character: { ok: true; name: string; live2d: { model: string } }
  cues: CuePayload[]
}

interface CharacterCommitRequest {
  id: number
  cues: CuePayload[]
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function candidateUrl(value: unknown, id: number): value is string {
  if (typeof value !== 'string') return false
  const prefix = `lares://candidate/${id}/`
  if (!value.startsWith(prefix) || value.includes('?') || value.includes('#')) return false
  const path = value.slice(prefix.length)
  if (!path) return false
  try {
    return path.split('/').every((raw) => {
      const segment = decodeURIComponent(raw)
      return (
        raw.length > 0 &&
        segment !== '.' &&
        segment !== '..' &&
        !segment.includes('/') &&
        !segment.includes('\\')
      )
    })
  } catch {
    return false
  }
}

export function parseCharacterPrepareRequest(value: unknown): CharacterLoadRequest | null {
  if (!record(value) || !Number.isSafeInteger(value.id) || (value.id as number) < 1) return null
  const id = value.id as number
  if (!record(value.character) || value.character.ok !== true) return null
  const character = value.character
  if (typeof character.name !== 'string' || !character.name || !record(character.live2d)) return null
  if (!candidateUrl(character.live2d.model, id) || !Array.isArray(value.cues)) {
    return null
  }
  const cues: CuePayload[] = []
  for (const raw of value.cues) {
    if (!record(raw) || typeof raw.name !== 'string' || !raw.name) return null
    const hasParams = raw.params !== undefined
    const hasMotion = raw.motion !== undefined
    if (hasParams === hasMotion) return null
    if (
      hasParams &&
      (!record(raw.params) ||
        Object.values(raw.params).some(
          (parameter) => typeof parameter !== 'number' || !Number.isFinite(parameter)
        ))
    ) {
      return null
    }
    if (hasMotion && !candidateUrl(raw.motion, id)) return null
    cues.push(
      hasParams
        ? { name: raw.name, params: raw.params as Record<string, number> }
        : { name: raw.name, motion: raw.motion as string }
    )
  }
  return {
    id,
    character: character as unknown as CharacterLoadRequest['character'],
    cues
  }
}

function parseCharacterCommitRequest(value: unknown): CharacterCommitRequest | null {
  if (!record(value) || !Number.isSafeInteger(value.id) || !Array.isArray(value.cues)) return null
  const prepared = parseCharacterPrepareRequest({
    id: value.id,
    character: {
      ok: true,
      name: 'commit',
      live2d: { model: `lares://candidate/${String(value.id)}/commit.model3.json` }
    },
    cues: value.cues
  })
  return prepared ? { id: prepared.id, cues: prepared.cues } : null
}

function replace<T>(target: Record<string, T>, entries: [string, T][]): void {
  for (const key of Object.keys(target)) delete target[key]
  Object.assign(target, Object.fromEntries(entries))
}

export function createCharacterLoadHandler(
  runtimes: () => Pick<IRuntime, 'prepareLoad' | 'commitLoad' | 'cancelLoad' | 'parameters'>[],
  driver: Pick<AffectDriver, 'characterChanged'>,
  cueParams: Record<string, Record<string, number>>,
  cueMotions: Record<string, string>,
  report: (result: unknown) => void,
  committed?: (request: CharacterLoadRequest) => void
): {
  prepare(request: unknown): Promise<void>
  commit(id: unknown): boolean
  cancel(id: unknown): boolean
  busy(): boolean
} {
  let latestId = 0
  const preparing = new Set<number>()
  const cancelled = new Set<number>()
  let prepared:
    | {
        request: CharacterLoadRequest
        runtimes: ReturnType<typeof runtimes>
      }
    | undefined

  const cancel = (rawId: unknown): boolean => {
    if (!Number.isSafeInteger(rawId)) return false
    const id = rawId as number
    cancelled.add(id)
    const targets = prepared?.request.id === id ? prepared.runtimes : runtimes()
    const result = targets.map((runtime) => runtime.cancelLoad(id)).some(Boolean)
    if (prepared?.request.id === id) prepared = undefined
    return result
  }

  return {
    async prepare(raw) {
      const request = parseCharacterPrepareRequest(raw)
      if (!request || request.id <= latestId) return
      if (latestId > 0) cancel(latestId)
      latestId = request.id
      cancelled.delete(request.id)
      const targets = runtimes()
      if (targets.length === 0) {
        report({ id: request.id, ok: false, error: 'character body is unavailable' })
        return
      }
      preparing.add(request.id)
      try {
        const results = await Promise.allSettled(
          targets.map((runtime) =>
            runtime.prepareLoad(request.id, request.character.live2d.model)
          )
        )
        const failed = results.find(
          (result): result is PromiseRejectedResult => result.status === 'rejected'
        )
        if (failed) throw failed.reason
        const inventories = results.map(
          (result) => (result as PromiseFulfilledResult<ReturnType<IRuntime['parameters']>>).value
        )
        if (cancelled.has(request.id) || request.id !== latestId) {
          for (const runtime of targets) runtime.cancelLoad(request.id)
          return
        }
        for (const cue of request.cues) {
          if (!cue.params) continue
          const unknown = Object.keys(cue.params).filter((id) =>
            inventories.some((inventory) => !inventory.some((param) => param.id === id))
          )
          if (unknown.length) {
            throw new Error(
              `Cue ${JSON.stringify(cue.name)}: unknown parameter ${unknown.map((id) => JSON.stringify(id)).join(', ')}`
            )
          }
        }
        prepared = {
          request,
          runtimes: targets
        }
        report({ id: request.id, ok: true, inventory: inventories[0] })
      } catch (error) {
        for (const runtime of targets) runtime.cancelLoad(request.id)
        if (request.id === latestId && !cancelled.has(request.id)) {
          report({
            id: request.id,
            ok: false,
            error: error instanceof Error ? error.message : String(error)
          })
        }
      } finally {
        preparing.delete(request.id)
      }
    },
    commit(rawCommit) {
      const commit = parseCharacterCommitRequest(rawCommit)
      if (!commit || prepared?.request.id !== commit.id) return false
      const transaction = prepared
      prepared = undefined
      const committedAll = transaction.runtimes
        .map((runtime) => runtime.commitLoad(commit.id))
        .every(Boolean)
      if (!committedAll) return false
      replace(
        cueParams,
        commit.cues.flatMap((cue) =>
          cue.params === undefined ? [] : [[cue.name, cue.params]]
        )
      )
      replace(
        cueMotions,
        commit.cues.flatMap((cue) =>
          cue.motion === undefined ? [] : [[cue.name, cue.motion]]
        )
      )
      driver.characterChanged()
      committed?.(transaction.request)
      return true
    },
    cancel,
    busy: () => preparing.size > 0 || prepared !== undefined
  }
}
