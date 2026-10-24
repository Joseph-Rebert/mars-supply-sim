import { describe, expect, it } from 'vitest'
import { solveLambert, type Vec3 } from './lambert'

const MU_EARTH = 398_600 // km³/s², as used in Curtis

function expectVec(actual: Vec3, expected: Vec3, digits: number) {
  actual.forEach((x, i) => expect(x).toBeCloseTo(expected[i], digits))
}

describe('solveLambert', () => {
  it('matches Curtis, Orbital Mechanics for Engineering Students, Example 5.2', () => {
    // r1, r2 one hour apart around Earth; book answer v1 and v2 in km/s.
    const sol = solveLambert([5000, 10000, 2100], [-14600, 2500, 7000], 3600, MU_EARTH)!
    expectVec(sol.v1, [-5.9925, 1.9254, 3.2456], 3)
    expectVec(sol.v2, [-3.3125, -4.1966, -0.38529], 3)
  })

  it('recovers a circular orbit over a quarter period', () => {
    // r = 7000 km circle: v = √(μ/r), period T = 2π√(r³/μ). After T/4 the craft has moved 90°.
    const r = 7000
    const v = Math.sqrt(MU_EARTH / r)
    const quarter = (Math.PI / 2) * Math.sqrt(r ** 3 / MU_EARTH)
    const sol = solveLambert([r, 0, 0], [0, r, 0], quarter, MU_EARTH)!
    expectVec(sol.v1, [0, v, 0], 6)
    expectVec(sol.v2, [-v, 0, 0], 6)
  })

  it('goes the long way round (prograde) when the target is clockwise of the start', () => {
    // 270° of a circular orbit takes 3T/4.
    const r = 7000
    const v = Math.sqrt(MU_EARTH / r)
    const threeQuarters = ((3 * Math.PI) / 2) * Math.sqrt(r ** 3 / MU_EARTH)
    const sol = solveLambert([r, 0, 0], [0, -r, 0], threeQuarters, MU_EARTH)!
    expectVec(sol.v1, [0, v, 0], 6)
  })

  it('returns undefined for a 180° transfer, where the plane is undefined', () => {
    expect(solveLambert([7000, 0, 0], [-9000, 0, 0], 5000, MU_EARTH)).toBeUndefined()
  })
})
