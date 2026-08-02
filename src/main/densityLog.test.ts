import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DensityLog } from './densityLog'

const directories: string[] = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })))
})

describe('DensityLog', () => {
  it('records only baseline changes as JSONL', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'lares-density-'))
    directories.push(directory)
    const file = join(directory, 'nested', 'density.jsonl')
    const log = new DensityLog(file)

    log.recordBaseline('idle', 0)
    log.recordBaseline('idle', 1)
    log.recordBaseline('working', 2)

    expect(
      (await readFile(file, 'utf8'))
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line))
    ).toEqual([
      {
        timestamp: '1970-01-01T00:00:00.002Z',
        type: 'baseline',
        from: 'idle',
        to: 'working'
      }
    ])
  })
})
