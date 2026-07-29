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

export type CharacterSwitchResult =
  | { ok: true; manifestPath: string }
  | { ok: false; error: string }

export interface CharacterSwitcher {
  active(): CharacterPackage
  switchTo(manifestPath: string): Promise<CharacterSwitchResult>
}

export function createCharacterSwitcher(
  root: string,
  initial: CharacterPackage,
  load: (request: CharacterLoadRequest) => Promise<unknown>,
  commit: (candidate: CharacterPackage, inventory: ParamInfo[], id: number) => void
): CharacterSwitcher {
  let active = initial
  let latestId = 0

  return {
    active: () => active,
    async switchTo(manifestPath) {
      const candidate = listCharacterPackages(root).find(
        (entry) => resolve(entry.manifestPath) === resolve(manifestPath)
      )
      if (!candidate) return { ok: false, error: 'character is not a valid managed package' }
      const id = ++latestId
      try {
        const inventory = parseInventory(await load({ id, candidate }))
        if (id !== latestId) return { ok: false, error: 'character switch was superseded' }
        if (!inventory) return { ok: false, error: 'renderer returned an invalid body inventory' }
        commit(candidate, inventory, id)
        active = candidate
        return { ok: true, manifestPath: candidate.manifestPath }
      } catch (error) {
        return id !== latestId
          ? { ok: false, error: 'character switch was superseded' }
          : { ok: false, error: error instanceof Error ? error.message : String(error) }
      }
    }
  }
}
