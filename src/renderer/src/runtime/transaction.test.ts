import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { commitLatestLoad } from './transaction'

const failureFixture = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'load-failure.json'), 'utf8')
) as { error: string }

describe('renderer model transaction', () => {
  it('keeps the prior visible model when candidate loading fails', async () => {
    let visible = 'first'

    await expect(
      commitLatestLoad(
        Promise.reject(new Error(failureFixture.error)),
        () => true,
        (candidate) => {
          visible = candidate
        },
        () => {}
      )
    ).rejects.toThrow('renderer fixture refused model')
    expect(visible).toBe('first')
  })

  it('discards an out-of-order candidate instead of making it visible', async () => {
    let visible = 'first'
    const discarded: string[] = []

    await expect(
      commitLatestLoad(
        Promise.resolve('stale'),
        () => false,
        (candidate) => {
          visible = candidate
        },
        (candidate) => discarded.push(candidate)
      )
    ).resolves.toBe(false)
    expect(visible).toBe('first')
    expect(discarded).toEqual(['stale'])
  })
})
