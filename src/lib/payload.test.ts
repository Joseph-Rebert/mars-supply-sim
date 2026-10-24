import { describe, expect, it } from 'vitest'
import { payloadKgAtC3 } from './payload'

describe('payloadKgAtC3', () => {
  it('returns the NASA LSP table value exactly at C3 0.264', () => {
    expect(payloadKgAtC3(0.264)).toBe(14935)
  })

  it('interpolates linearly between curve points', () => {
    // Halfway between [5, 13600] and [10, 12350]: 13600 − 1250 / 2 = 12975.
    expect(payloadKgAtC3(7.5)).toBeCloseTo(12975, 6)
  })

  it('holds flat below the curve and tapers to zero above it', () => {
    expect(payloadKgAtC3(-10)).toBe(15500)
    // Last segment [90, 1400] → [100, 750] loses 65 kg per C3: 750 − 65 × 5 = 425 at C3 105.
    expect(payloadKgAtC3(105)).toBeCloseTo(425, 6)
    expect(payloadKgAtC3(500)).toBe(0)
  })

  it('decreases as C3 rises', () => {
    for (let c3 = -2; c3 < 120; c3 += 0.5) {
      expect(payloadKgAtC3(c3 + 0.5)).toBeLessThanOrEqual(payloadKgAtC3(c3))
    }
  })
})
