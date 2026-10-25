import { describe, expect, it } from 'vitest'
import { AU_KM, MU_SUN_KM3_PER_S2 } from './data'
import type { Vec3 } from './lambert'
import { ephemeris, orbitPaths, propagate, transferArc } from './orbit'
import { presetById } from './presets'
import { transferFor } from './transfers'

const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

describe('propagate', () => {
  const r = AU_KM
  const v = Math.sqrt(MU_SUN_KM3_PER_S2 / r)
  const period = 2 * Math.PI * Math.sqrt(r ** 3 / MU_SUN_KM3_PER_S2)

  it('comes back to the start after one period of a circular orbit', () => {
    expect(dist(propagate([r, 0, 0], [0, v, 0], period), [r, 0, 0])).toBeLessThan(1)
  })

  it('is a quarter of the way round after a quarter period', () => {
    expect(dist(propagate([r, 0, 0], [0, v, 0], period / 4), [0, r, 0])).toBeLessThan(1)
  })

  it('follows Earth along the JPL ephemeris for 30 days to within 0.1% of 1 AU', () => {
    const a = ephemeris('2029-01-01')!
    const b = ephemeris('2029-01-31')!
    expect(dist(propagate(a.earth.r, a.earth.v, 30 * 86_400), b.earth.r) / AU_KM).toBeLessThan(1e-3)
  })
})

describe('transferArc', () => {
  it('starts at Earth on launch day and ends at Mars on arrival day for every draft flight', () => {
    for (const f of presetById('draft').plan().flights) {
      const t = transferFor('mars', f.launchDate)
      const arc = transferArc(t.launchDate, t.arrivalDate)
      expect(arc).not.toBeNull()
      expect(dist(arc!.points[0], ephemeris(t.launchDate)!.earth.r)).toBeLessThan(1)
      // Lambert there and Kepler back: within 1,000 km of Mars after a 220–300 day trip.
      expect(dist(arc!.points.at(-1)!, ephemeris(t.arrivalDate)!.mars.r)).toBeLessThan(1000)
    }
  })

  it('is null outside the cached ephemeris', () => {
    expect(transferArc('2050-01-01', '2050-08-01')).toBeNull()
  })
})

describe('orbitPaths', () => {
  it('closes each ring: one sidereal period of positions ends near where it started', () => {
    const { earth, mars } = orbitPaths()
    expect(dist(earth[0], earth.at(-1)!) / AU_KM).toBeLessThan(0.01)
    expect(dist(mars[0], mars.at(-1)!) / AU_KM).toBeLessThan(0.01)
  })
})
