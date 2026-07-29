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

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseRequest(value: unknown): CharacterLoadRequest | null {
  if (!record(value) || !Number.isSafeInteger(value.id) || (value.id as number) < 1) return null
  if (!record(value.character) || value.character.ok !== true) return null
  const character = value.character
  if (typeof character.name !== 'string' || !character.name || !record(character.live2d)) return null
  if (
    typeof character.live2d.model !== 'string' ||
    !character.live2d.model ||
    !Array.isArray(value.cues)
  ) {
    return null
  }
  const cues: CuePayload[] = []
  for (const raw of value.cues) {
    if (!record(raw) || typeof raw.name !== 'string' || !raw.name) return null
    if (
      raw.params !== undefined &&
      (!record(raw.params) ||
        Object.values(raw.params).some(
          (parameter) => typeof parameter !== 'number' || !Number.isFinite(parameter)
        ))
    ) {
      return null
    }
    if (raw.motion !== undefined && (typeof raw.motion !== 'string' || !raw.motion)) return null
    cues.push({
      name: raw.name,
      ...(raw.params === undefined ? {} : { params: raw.params as Record<string, number> }),
      ...(raw.motion === undefined ? {} : { motion: raw.motion })
    })
  }
  return {
    id: value.id as number,
    character: character as unknown as CharacterLoadRequest['character'],
    cues
  }
}

function replace<T>(target: Record<string, T>, entries: [string, T][]): void {
  for (const key of Object.keys(target)) delete target[key]
  Object.assign(target, Object.fromEntries(entries))
}

export function createCharacterLoadHandler(
  runtime: Pick<IRuntime, 'load' | 'parameters'>,
  driver: Pick<AffectDriver, 'characterChanged'>,
  cueParams: Record<string, Record<string, number>>,
  cueMotions: Record<string, string>,
  report: (result: unknown) => void,
  committed?: (request: CharacterLoadRequest) => void
): (request: unknown) => Promise<void> {
  let latestId = 0
  return async (raw) => {
    const request = parseRequest(raw)
    if (!request || request.id <= latestId) return
    latestId = request.id
    try {
      await runtime.load(request.character.live2d.model)
      if (request.id !== latestId) return
      replace(
        cueParams,
        request.cues.flatMap((cue) =>
          cue.params === undefined ? [] : [[cue.name, cue.params]]
        )
      )
      replace(
        cueMotions,
        request.cues.flatMap((cue) =>
          cue.motion === undefined ? [] : [[cue.name, cue.motion]]
        )
      )
      driver.characterChanged()
      committed?.(request)
      report({ id: request.id, ok: true, inventory: runtime.parameters() })
    } catch (error) {
      if (request.id === latestId) {
        report({
          id: request.id,
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }
  }
}
