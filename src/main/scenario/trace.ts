import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// Thin fs sink for runScenario's output. Kept out of run.ts so the
// trace-producing loop stays pure and fs-free.
// ponytail: one flat traces/ dir, no per-run subfolders — add if collisions
// across runs become a real problem.
export function writeTrace(name: string, lines: string[], dir = 'traces'): string {
  mkdirSync(dir, { recursive: true })
  const path = join(dir, `${name}.jsonl`)
  writeFileSync(path, lines.length ? lines.join('\n') + '\n' : '')
  return path
}
