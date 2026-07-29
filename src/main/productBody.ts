export function productBodyTargets<T>(overlay: T | null, windows: readonly T[]): T[] {
  return overlay !== null && windows.includes(overlay) ? [overlay] : []
}
