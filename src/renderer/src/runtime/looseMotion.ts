export interface Cubism4MotionManager {
  definitions: Partial<Record<string, Array<{ File: string }>>>
  motionGroups: Partial<Record<string, Array<unknown>>>
  startMotion(group: string, index: number, priority?: number): Promise<boolean>
}

export const LARES_MOTION_GROUP = '__lares__'

/** Registers a loose motion only in the live Cubism manager, never on disk. */
export function registerLooseMotion(manager: Cubism4MotionManager, url: string): number {
  const definitions = (manager.definitions[LARES_MOTION_GROUP] ??= [])
  const existing = definitions.findIndex((definition) => definition.File === url)
  if (existing >= 0) return existing
  definitions.push({ File: url })
  const motions = (manager.motionGroups[LARES_MOTION_GROUP] ??= [])
  motions.push(undefined)
  return definitions.length - 1
}

export function isCubism4MotionManager(value: unknown): value is Cubism4MotionManager {
  if (typeof value !== 'object' || value === null) return false
  const manager = value as Partial<Cubism4MotionManager>
  return (
    typeof manager.startMotion === 'function' &&
    typeof manager.definitions === 'object' &&
    manager.definitions !== null &&
    typeof manager.motionGroups === 'object' &&
    manager.motionGroups !== null
  )
}
