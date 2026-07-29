import { resolve } from 'node:path'
import { parseInventory, type ParamInfo } from '../nerves'
import { listCharacterPackages } from './library'
import type { ManifestResult } from './manifest'

export interface CharacterPackage {
  manifestPath: string
  character: Extract<ManifestResult, { ok: true }>
  label: string
}

export interface CharacterLoadRequest {
  id: number
  candidate: CharacterPackage
}

export interface CharacterSwitchOperations<Precomputed, CommitState> {
  precompute(candidate: CharacterPackage): Precomputed
  prepare(request: CharacterLoadRequest, precomputed: Precomputed): Promise<unknown>
  prepareCommit(
    candidate: CharacterPackage,
    inventory: ParamInfo[],
    precomputed: Precomputed,
    id: number
  ): CommitState
  commit(id: number, state: CommitState): boolean
  cancel(id: number, reason: string): boolean
  publish(candidate: CharacterPackage, state: CommitState, id: number): void
}

export type CharacterSwitchResult =
  | { ok: true; manifestPath: string }
  | { ok: false; error: string }

export interface CharacterSwitcher {
  active(): CharacterPackage
  switchTo(manifestPath: string): Promise<CharacterSwitchResult>
}

export function createCharacterSwitcher<Precomputed, CommitState>(
  root: string,
  initial: CharacterPackage,
  operations: CharacterSwitchOperations<Precomputed, CommitState>
): CharacterSwitcher {
  let active = initial
  let latestId = 0
  let pendingId: number | null = null

  return {
    active: () => active,
    async switchTo(manifestPath) {
      const candidate = listCharacterPackages(root).find(
        (entry) => resolve(entry.manifestPath) === resolve(manifestPath)
      )
      if (!candidate) return { ok: false, error: 'character is not a valid managed package' }
      let precomputed: Precomputed
      try {
        precomputed = operations.precompute(candidate)
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) }
      }
      const id = ++latestId
      if (pendingId !== null) {
        operations.cancel(pendingId, 'character switch was superseded')
      }
      pendingId = id
      let inventory: ParamInfo[]
      let state: CommitState
      try {
        const parsed = parseInventory(await operations.prepare({ id, candidate }, precomputed))
        if (id !== latestId) {
          operations.cancel(id, 'character switch was superseded')
          return { ok: false, error: 'character switch was superseded' }
        }
        if (!parsed) throw new Error('renderer returned an invalid body inventory')
        inventory = parsed
        state = operations.prepareCommit(candidate, inventory, precomputed, id)
      } catch (error) {
        operations.cancel(id, 'character switch preparation failed')
        if (pendingId === id) pendingId = null
        return id !== latestId
          ? { ok: false, error: 'character switch was superseded' }
          : { ok: false, error: error instanceof Error ? error.message : String(error) }
      }
      if (!operations.commit(id, state)) {
        operations.cancel(id, 'character body commit was refused')
        if (pendingId === id) pendingId = null
        return { ok: false, error: 'character body commit was refused' }
      }
      operations.publish(candidate, state, id)
      active = candidate
      if (pendingId === id) pendingId = null
      return { ok: true, manifestPath: candidate.manifestPath }
    }
  }
}
