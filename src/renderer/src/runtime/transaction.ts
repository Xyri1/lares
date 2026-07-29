export async function commitLatestLoad<T>(
  loading: Promise<T>,
  isLatest: () => boolean,
  commit: (candidate: T) => void,
  discard: (candidate: T) => void
): Promise<boolean> {
  const candidate = await loading
  if (!isLatest()) {
    discard(candidate)
    return false
  }
  commit(candidate)
  return true
}
