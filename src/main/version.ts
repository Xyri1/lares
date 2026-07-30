const VERSION_PATTERN = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/

export function isVersion(version: string): boolean {
  return VERSION_PATTERN.test(version)
}

function versionParts(version: string): { core: bigint[]; prerelease: string[] } {
  const match = VERSION_PATTERN.exec(version)
  if (!match) throw new Error(`Invalid version: ${version}`)
  return {
    core: match.slice(1, 4).map(BigInt),
    prerelease: match[4]?.split('.') ?? []
  }
}

export function compareVersions(left: string, right: string): -1 | 0 | 1 {
  const a = versionParts(left)
  const b = versionParts(right)
  for (let index = 0; index < a.core.length; index += 1) {
    if (a.core[index]! > b.core[index]!) return 1
    if (a.core[index]! < b.core[index]!) return -1
  }
  if (a.prerelease.length === 0 || b.prerelease.length === 0) {
    return a.prerelease.length === b.prerelease.length
      ? 0
      : a.prerelease.length === 0
        ? 1
        : -1
  }
  const length = Math.max(a.prerelease.length, b.prerelease.length)
  for (let index = 0; index < length; index += 1) {
    const leftPart = a.prerelease[index]
    const rightPart = b.prerelease[index]
    if (leftPart === undefined || rightPart === undefined) {
      return leftPart === rightPart ? 0 : leftPart === undefined ? -1 : 1
    }
    if (leftPart === rightPart) continue
    const leftNumeric = /^\d+$/.test(leftPart)
    const rightNumeric = /^\d+$/.test(rightPart)
    if (leftNumeric && rightNumeric) return BigInt(leftPart) > BigInt(rightPart) ? 1 : -1
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1
    return leftPart > rightPart ? 1 : -1
  }
  return 0
}
