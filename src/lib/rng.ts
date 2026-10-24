// Seedable PRNG so Monte Carlo runs are reproducible (same seed → same demo numbers).

export type Rng = () => number

// mulberry32: tiny, fast, good enough for simulation. Returns floats in [0, 1).
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
