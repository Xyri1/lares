/** Formats a caught value as a display message, whether or not it's an Error. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
