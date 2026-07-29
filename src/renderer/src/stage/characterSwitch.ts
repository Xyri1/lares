import type { IRuntime } from '../runtime/iface'

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
  runtime: Pick<
    IRuntime,
    | 'prepareLoad'
    | 'commitLoad'
    | 'rollbackLoad'
    | 'finalizeLoad'
    | 'cancelLoad'
    | 'parameters'
  >,
  driver: { characterChanged(): void | (() => void) },
  cueParams: Record<string, Record<string, number>>,
  cueMotions: Record<string, string>,
  reportPrepared: (result: unknown) => void,
  reportCommitted: (result: unknown) => void,
  finalized?: (request: CharacterLoadRequest) => void
): {
  prepare(request: unknown): Promise<void>
  commit(request: unknown): boolean
  rollback(id: unknown): boolean
  finalize(id: unknown): boolean
  cancel(id: unknown): boolean
} {
  let latestId = 0
  const cancelled = new Set<number>()
  let prepared: CharacterLoadRequest | undefined
  let tentative:
    | {
        request: CharacterLoadRequest
        params: [string, Record<string, number>][]
        motions: [string, string][]
        rollbackDriver?: () => void
      }
    | undefined

  const report = (send: (result: unknown) => void, result: unknown): void => {
    try {
      send(result)
    } catch {
      // Main owns timeout recovery if IPC delivery itself is unavailable.
    }
  }

  const rollback = (rawId: unknown): boolean => {
    const transaction = tentative
    if (
      !Number.isSafeInteger(rawId) ||
      transaction === undefined ||
      transaction.request.id !== rawId
    ) {
      return false
    }
    tentative = undefined
    runtime.rollbackLoad(rawId as number)
    replace(cueParams, transaction.params)
    replace(cueMotions, transaction.motions)
    try {
      transaction.rollbackDriver?.()
    } catch {
      // Runtime and cue state are already restored.
    }
    return true
  }

  const cancel = (rawId: unknown): boolean => {
    if (!Number.isSafeInteger(rawId)) return false
    const id = rawId as number
    cancelled.add(id)
    if (tentative?.request.id === id) return rollback(id)
    const result = runtime.cancelLoad(id)
    if (prepared?.id === id) prepared = undefined
    return result
  }

  return {
    async prepare(raw) {
      const request = parseCharacterPrepareRequest(raw)
      if (!request || request.id <= latestId) return
      if (latestId > 0) cancel(latestId)
      latestId = request.id
      cancelled.delete(request.id)
      try {
        const inventory = await runtime.prepareLoad(
          request.id,
          request.character.live2d.model
        )
        if (cancelled.has(request.id) || request.id !== latestId) {
          runtime.cancelLoad(request.id)
          return
        }
        for (const cue of request.cues) {
          if (!cue.params) continue
          const unknown = Object.keys(cue.params).filter(
            (id) => !inventory.some((param) => param.id === id)
          )
          if (unknown.length) {
            throw new Error(
              `Cue ${JSON.stringify(cue.name)}: unknown parameter ${unknown.map((id) => JSON.stringify(id)).join(', ')}`
            )
          }
        }
        prepared = request
        report(reportPrepared, { id: request.id, ok: true, inventory })
      } catch (error) {
        runtime.cancelLoad(request.id)
        if (request.id === latestId && !cancelled.has(request.id)) {
          report(reportPrepared, {
            id: request.id,
            ok: false,
            error: error instanceof Error ? error.message : String(error)
          })
        }
      }
    },
    commit(rawCommit) {
      const commit = parseCharacterCommitRequest(rawCommit)
      if (!commit || prepared?.id !== commit.id) return false
      const request = prepared
      prepared = undefined
      const previousParams = Object.entries(cueParams)
      const previousMotions = Object.entries(cueMotions)
      if (!runtime.commitLoad(commit.id)) {
        report(reportCommitted, { id: commit.id, ok: false, error: 'runtime commit failed' })
        return false
      }
      tentative = { request, params: previousParams, motions: previousMotions }
      try {
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
        tentative.rollbackDriver = driver.characterChanged() ?? undefined
        reportCommitted({ id: commit.id, ok: true })
        return true
      } catch (error) {
        rollback(commit.id)
        report(reportCommitted, {
          id: commit.id,
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        })
        return false
      }
    },
    rollback,
    finalize(rawId) {
      const transaction = tentative
      if (
        !Number.isSafeInteger(rawId) ||
        transaction === undefined ||
        transaction.request.id !== rawId
      ) {
        return false
      }
      const request = transaction.request
      tentative = undefined
      const result = runtime.finalizeLoad(rawId as number)
      if (result) {
        try {
          finalized?.(request)
        } catch {
          // Old resources are already final; no failure is reported after this point.
        }
      }
      return result
    },
    cancel
  }
}
