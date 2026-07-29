import { homedir } from 'node:os'
import { removeOwnedIntegrations } from '../src/main/uninstall.ts'

try {
  const { claude, codex } = await removeOwnedIntegrations(
    homedir(),
    (message) => console.error(`[lares] ${message}`)
  )
  console.log(`[lares] Claude Code adapter removal: hooks=${claude.settings}, mcp=${claude.mcp}`)
  console.log(`[lares] Codex hooks removal: hooks=${codex}`)
} catch (error) {
  console.error('[lares] adapter removal failed', error)
  process.exitCode = 1
}
