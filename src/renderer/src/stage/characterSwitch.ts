import {
  ANCHOR_KEYS,
  CORNER_KEYS,
  isPoseOverrides,
  OPERATIONAL_KEYS,
  resolvePoses,
  type CornerKey,
  type FeelPoses
} from '../feel/feel'
import type { IRuntime } from '../runtime/iface'
import { isSynthPreset, type SynthPreset } from '../synth/synth'

/** Authored choreography map (slice 014 SPEC §3). Existence and motion
 * references are validated main-side; this is shape-only parsing. */
export interface ChoreographyRef {
  group: string
  index: number
}

export interface ChoreographyBlock {
  fallback: ChoreographyRef
  anchors?: Partial<Record<CornerKey, ChoreographyRef>>
}

export interface CharacterLoadRequest {
  id: number
  character: {
    ok: true
    name: string
    anchors?: Record<string, Record<string, number>>
    operational?: Record<string, Record<string, number>>
    live2d: {
      model: string
      fallbackPhysics?: string
      performance?: SynthPreset
      choreography?: ChoreographyBlock
    }
  }
}

interface CharacterCommitRequest {
  id: number
}

interface DriverCharacterChange {
  rollback(): void
  finalize(): void
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
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

function validId(id: unknown): id is number {
  return Number.isSafeInteger(id) && (id as number) >= 1
}

function isChoreographyRef(value: unknown): value is ChoreographyRef {
  if (!record(value)) return false
  const keys = Object.keys(value)
  return (
    keys.length === 2 &&
    typeof value.group === 'string' &&
    value.group !== '' &&
    Number.isSafeInteger(value.index) &&
    (value.index as number) >= 0
  )
}

function isChoreography(value: unknown): value is ChoreographyBlock {
  if (!record(value)) return false
  const keys = Object.keys(value)
  if (keys.some((key) => key !== 'fallback' && key !== 'anchors')) return false
  if (!isChoreographyRef(value.fallback)) return false
  if (value.anchors === undefined) return true
  if (!record(value.anchors)) return false
  return Object.entries(value.anchors).every(
    ([key, ref]) => CORNER_KEYS.includes(key as CornerKey) && isChoreographyRef(ref)
  )
}

export function parseCharacterPrepareRequest(value: unknown): CharacterLoadRequest | null {
  if (!record(value) || !validId(value.id)) return null
  const id = value.id
  if (!record(value.character) || value.character.ok !== true) return null
  const character = value.character
  if (typeof character.name !== 'string' || !character.name || !record(character.live2d)) return null
  if (!candidateUrl(character.live2d.model, id)) return null
  if (
    character.live2d.fallbackPhysics !== undefined &&
    !candidateUrl(character.live2d.fallbackPhysics, id)
  ) {
    return null
  }
  if (
    character.live2d.performance !== undefined &&
    !isSynthPreset(character.live2d.performance)
  ) {
    return null
  }
  if (
    character.live2d.choreography !== undefined &&
    !isChoreography(character.live2d.choreography)
  ) {
    return null
  }
  if (character.anchors !== undefined && !isPoseOverrides(character.anchors, ANCHOR_KEYS)) {
    return null
  }
  if (
    character.operational !== undefined &&
    !isPoseOverrides(character.operational, OPERATIONAL_KEYS)
  ) {
    return null
  }
  return {
    id,
    character: character as unknown as CharacterLoadRequest['character']
  }
}

function parseCharacterCommitRequest(value: unknown): CharacterCommitRequest | null {
  if (!record(value) || !validId(value.id)) return null
  return { id: value.id }
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
    | 'compatibility'
  >,
  driver: {
    characterChanged(
      preset?: SynthPreset,
      poses?: FeelPoses,
      choreography?: ChoreographyBlock
    ): void | (() => void) | DriverCharacterChange
  },
  reportPrepared: (result: unknown) => void,
  reportCommitted: (result: unknown) => void,
  finalized?: (request: CharacterLoadRequest) => void,
  getDecision: (id: number) => Promise<unknown> = async () => null,
  tentativeTimeoutMs = 30_000
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
        rollbackDriver?: () => void
        finalizeDriver?: () => void
        watchdog?: ReturnType<typeof setTimeout>
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
    if (transaction.watchdog) clearTimeout(transaction.watchdog)
    runtime.rollbackLoad(rawId as number)
    try {
      transaction.rollbackDriver?.()
    } catch {
      // Runtime state is already restored.
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

  const finalize = (rawId: unknown): boolean => {
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
    if (transaction.watchdog) clearTimeout(transaction.watchdog)
    try {
      runtime.finalizeLoad(rawId as number)
    } catch {
      // Matching finalization is one-way; cleanup cannot reopen the transaction.
    }
    try {
      transaction.finalizeDriver?.()
    } catch {
      // The new body is already final; playback cleanup is best effort here.
    }
    try {
      finalized?.(request)
    } catch {
      // Old resources are already final; no failure is reported after this point.
    }
    return true
  }

  const retryMs = Math.min(1000, Math.max(10, Math.floor(tentativeTimeoutMs / 2)))
  const scheduleDecision = (id: number, delayMs: number): void => {
    if (tentative?.request.id !== id) return
    tentative.watchdog = setTimeout(() => {
      void Promise.resolve()
        .then(() => getDecision(id))
        .then((decision) => {
          if (tentative?.request.id !== id) return
          if (decision === 'commit') {
            finalize(id)
          } else if (decision === 'rollback') {
            rollback(id)
          } else {
            scheduleDecision(id, retryMs)
          }
        })
        .catch(() => {
          scheduleDecision(id, retryMs)
        })
    }, delayMs)
  }

  return {
    async prepare(raw) {
      const request = parseCharacterPrepareRequest(raw)
      if (!request || request.id <= latestId) return
      const previousId = latestId
      latestId = request.id
      cancelled.delete(request.id)
      const predecessorId = tentative?.request.id
      if (predecessorId !== undefined) {
        let decision: unknown
        try {
          decision = await getDecision(predecessorId)
        } catch (error) {
          if (request.id !== latestId) return
          if (tentative?.request.id === predecessorId) {
            report(reportPrepared, {
              id: request.id,
              ok: false,
              error: `previous character switch decision failed: ${errorMessage(error)}`
            })
            return
          }
        }
        if (request.id !== latestId) return
        if (tentative?.request.id === predecessorId) {
          if (decision === 'commit') finalize(predecessorId)
          else if (decision === 'rollback') rollback(predecessorId)
          else {
            report(reportPrepared, {
              id: request.id,
              ok: false,
              error: 'previous character switch decision is unavailable'
            })
            return
          }
        }
      }
      if (previousId > 0) cancel(previousId)
      try {
        const inventory = await runtime.prepareLoad(
          request.id,
          request.character.live2d.model,
          request.character.live2d.fallbackPhysics,
          request.character.live2d.choreography !== undefined
        )
        if (cancelled.has(request.id) || request.id !== latestId) {
          runtime.cancelLoad(request.id)
          return
        }
        prepared = request
        const compatibility = runtime.compatibility?.()
        const performanceIds = request.character.live2d.performance
          ? [
              ...request.character.live2d.performance.params.map((binding) => binding.id),
              request.character.live2d.performance.idle.breath.id,
              ...request.character.live2d.performance.idle.blink.ids,
              request.character.live2d.performance.idle.sway.id
            ]
          : []
        report(reportPrepared, {
          id: request.id,
          ok: true,
          inventory,
          ...(compatibility
            ? {
                compatibility: {
                  ...compatibility,
                  performanceGaps: [
                    ...new Set(
                      performanceIds.filter(
                        (id) => !inventory.some((parameter) => parameter.id === id)
                      )
                    )
                  ]
                }
              }
            : {})
        })
      } catch (error) {
        runtime.cancelLoad(request.id)
        if (request.id === latestId && !cancelled.has(request.id)) {
          report(reportPrepared, {
            id: request.id,
            ok: false,
            error: errorMessage(error)
          })
        }
      }
    },
    commit(rawCommit) {
      const commit = parseCharacterCommitRequest(rawCommit)
      if (!commit || prepared?.id !== commit.id) return false
      const request = prepared
      prepared = undefined
      if (!runtime.commitLoad(commit.id)) {
        report(reportCommitted, { id: commit.id, ok: false, error: 'runtime commit failed' })
        return false
      }
      tentative = { request }
      try {
        const driverChange = driver.characterChanged(
          request.character.live2d.performance,
          resolvePoses(request.character),
          request.character.live2d.choreography
        )
        if (typeof driverChange === 'function') {
          tentative.rollbackDriver = driverChange
        } else if (driverChange) {
          tentative.rollbackDriver = () => driverChange.rollback()
          tentative.finalizeDriver = () => driverChange.finalize()
        }
        scheduleDecision(commit.id, tentativeTimeoutMs)
        reportCommitted({ id: commit.id, ok: true })
        return true
      } catch (error) {
        rollback(commit.id)
        report(reportCommitted, {
          id: commit.id,
          ok: false,
          error: errorMessage(error)
        })
        return false
      }
    },
    rollback,
    finalize,
    cancel
  }
}
