import { describe, expect, it } from 'vitest'
import { productBodyTargets } from './productBody'

describe('authoritative product body routing', () => {
  it('targets only the overlay, never the framed dev stage', () => {
    const overlay = { name: 'overlay' }
    const dev = { name: 'dev' }

    expect(productBodyTargets(overlay, [overlay, dev])).toEqual([overlay])
    expect(productBodyTargets(null, [dev])).toEqual([])
    expect(productBodyTargets(overlay, [dev])).toEqual([])
  })
})
