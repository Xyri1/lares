import { homedir } from 'node:os'
import { join } from 'node:path'
import { removeClaudeCode } from '../src/main/adapters/claude-code/writer.ts'
import { removeCodexHooks } from '../src/main/adapters/codex/hooks.ts'

const home = homedir()

try {
  const result = await removeClaudeCode({
    claudeDirectory: join(home, '.claude'),
    settingsPath: join(home, '.claude', 'settings.json'),
    claudeConfigPath: join(home, '.claude.json'),
    log: (message) => console.error(`[lares] ${message}`)
  })
  console.log(`[lares] Claude Code adapter removal: hooks=${result.settings}, mcp=${result.mcp}`)
  const codex = await removeCodexHooks({
    codexDirectory: join(home, '.codex'),
    hooksPath: join(home, '.codex', 'hooks.json')
  })
  console.log(`[lares] Codex hooks removal: hooks=${codex}`)
} catch (error) {
  console.error('[lares] Claude Code adapter removal failed', error)
  process.exitCode = 1
}
