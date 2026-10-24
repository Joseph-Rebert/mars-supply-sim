import { describe, expect, it } from 'vitest'
import { mulberry32 } from './rng'

describe('mulberry32', () => {
  it('is deterministic for a given seed', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    for (let i = 0; i < 100; i++) expect(a()).toBe(b())
  })

  it('returns values in [0, 1)', () => {
    const rng = mulberry32(1)
    for (let i = 0; i < 10_000; i++) {
      const x = rng()
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(1)
    }
  })
})
