/// <reference types="vite/client" />

interface Window {
  /** Cubism Core global, loaded by the plain script tag in index.html. */
  Live2DCubismCore?: unknown
  /** Dev-only console handle for gate checks (A2/A4). */
  __runtime?: unknown
  /** Dev-only console handle for scripted replay smokes (A4). */
  __driver?: unknown
}
