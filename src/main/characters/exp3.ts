import { readFileSync, realpathSync } from 'node:fs'
import { dirname, relative, resolve, sep } from 'node:path'

export type Exp3Blend = 'Add' | 'Multiply' | 'Overwrite'

export interface Exp3Parameter {
  id: string
  value: number
  blend: Exp3Blend
  name?: string
}

export type Exp3Result = { ok: true; parameters: Exp3Parameter[] } | { ok: false; error: string }

function parseExp3(raw: unknown, displayNames?: ReadonlyMap<string, string>): Exp3Result {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ok: false, error: 'exp3 must be an object' }
  const parameters = (raw as { Parameters?: unknown }).Parameters
  if (!Array.isArray(parameters)) return { ok: false, error: 'exp3 Parameters must be an array' }
  const parsed: Exp3Parameter[] = []
  for (let index = 0; index < parameters.length; index++) {
    const value = parameters[index] as { Id?: unknown; Value?: unknown; Blend?: unknown }
    if (typeof value?.Id !== 'string' || value.Id === '') return { ok: false, error: `exp3 Parameters[${index}].Id must be a non-empty string` }
    if (typeof value.Value !== 'number' || !Number.isFinite(value.Value)) return { ok: false, error: `exp3 Parameters[${index}].Value must be a finite number` }
    const blend = value.Blend ?? 'Add'
    if (blend !== 'Add' && blend !== 'Multiply' && blend !== 'Overwrite') return { ok: false, error: `exp3 Parameters[${index}].Blend is unsupported: ${String(blend)}` }
    parsed.push({ id: value.Id, value: value.Value, blend, ...(displayNames?.get(value.Id) ? { name: displayNames.get(value.Id) } : {}) })
  }
  return { ok: true, parameters: parsed }
}

export function parseExp3File(path: string, displayNames?: ReadonlyMap<string, string>): Exp3Result {
  try {
    return parseExp3(JSON.parse(readFileSync(path, 'utf8')), displayNames)
  } catch (error) {
    return { ok: false, error: `cannot parse ${path}: ${error instanceof Error ? error.message : String(error)}` }
  }
}

export function parseCdi3File(path: string): ReadonlyMap<string, string> {
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as { Parameters?: unknown }
    if (!Array.isArray(raw.Parameters)) return new Map()
    return new Map(
      raw.Parameters.flatMap((value) => {
        const parameter = value as { Id?: unknown; Name?: unknown }
        return typeof parameter.Id === 'string' && typeof parameter.Name === 'string'
          ? [[parameter.Id, parameter.Name] as const]
          : []
      })
    )
  } catch {
    return new Map()
  }
}

export function parseModelCdi3File(
  modelPath: string,
  packageRoot: string
): ReadonlyMap<string, string> {
  try {
    const model = JSON.parse(readFileSync(modelPath, 'utf8')) as {
      FileReferences?: { DisplayInfo?: unknown }
    }
    const ref = model.FileReferences?.DisplayInfo
    if (typeof ref !== 'string') return new Map()
    const path = realpathSync(resolve(dirname(modelPath), ref))
    const root = realpathSync(packageRoot)
    const rel = relative(root, path)
    if (rel === '' || rel === '..' || rel.startsWith(`..${sep}`)) return new Map()
    return parseCdi3File(path)
  } catch {
    return new Map()
  }
}

export function applyExp3(
  parameters: readonly Exp3Parameter[],
  defaults: Readonly<Record<string, number>>
): Record<string, number> {
  const result: Record<string, number> = {}
  for (const parameter of parameters) {
    const base = defaults[parameter.id]
    if (base === undefined) continue
    result[parameter.id] = parameter.blend === 'Add' ? base + parameter.value : parameter.blend === 'Multiply' ? base * parameter.value : parameter.value
  }
  return result
}
