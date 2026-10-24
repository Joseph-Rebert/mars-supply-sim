// Lambert's problem: the orbit connecting two positions in a given time.
// Universal-variable formulation, Curtis, "Orbital Mechanics for Engineering Students", Algorithm 5.2.
// Bisection on z instead of Newton: single-revolution time of flight is monotonic in z, so bisection
// always converges, which matters when solving ~330k Earth–Mars cases unattended.

export type Vec3 = readonly [number, number, number]

export type LambertSolution = { v1: Vec3; v2: Vec3 }

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const norm = (a: Vec3) => Math.sqrt(dot(a, a))

/** Stumpff functions C(z), S(z), with series near 0 to avoid cancellation. */
function stumpff(z: number): [number, number] {
  if (z > 1e-6) {
    const s = Math.sqrt(z)
    return [(1 - Math.cos(s)) / z, (s - Math.sin(s)) / (s * s * s)]
  }
  if (z < -1e-6) {
    const s = Math.sqrt(-z)
    return [(Math.cosh(s) - 1) / -z, (Math.sinh(s) - s) / (s * s * s)]
  }
  return [1 / 2 - z / 24, 1 / 6 - z / 120]
}

/**
 * Single-revolution, prograde (angular momentum along +z) Lambert solution.
 * Units are whatever μ uses (km, s for km³/s²). Returns undefined when no solution exists,
 * e.g. a transfer angle of exactly 180°, where the transfer plane is undefined.
 */
export function solveLambert(
  r1: Vec3,
  r2: Vec3,
  tofSeconds: number,
  mu: number,
): LambertSolution | undefined {
  const r1n = norm(r1)
  const r2n = norm(r2)
  const crossZ = r1[0] * r2[1] - r1[1] * r2[0]
  let dTheta = Math.acos(Math.min(1, Math.max(-1, dot(r1, r2) / (r1n * r2n))))
  if (crossZ < 0) dTheta = 2 * Math.PI - dTheta

  const A = Math.sin(dTheta) * Math.sqrt((r1n * r2n) / (1 - Math.cos(dTheta)))
  if (!Number.isFinite(A) || Math.abs(A) < 1e-9) return undefined

  const y = (z: number) => {
    const [C, S] = stumpff(z)
    return r1n + r2n + (A * (z * S - 1)) / Math.sqrt(C)
  }
  // √μ · t(z); invalid (y < 0) only happens at low z when A > 0, so treat it as "too short".
  const scaledTof = (z: number) => {
    const yz = y(z)
    if (yz < 0) return -Infinity
    const [C, S] = stumpff(z)
    return (yz / C) ** 1.5 * S + A * Math.sqrt(yz)
  }

  const target = Math.sqrt(mu) * tofSeconds
  let lo = -4 * Math.PI ** 2
  // Upper limit of a single revolution is z = (2π)², where t → ∞. Any closer than ~1e-4 and 1 − cos(√z)
  // loses all precision in float64.
  let hi = 4 * Math.PI ** 2 - 1e-4
  while (scaledTof(lo) > target) {
    lo *= 2
    if (lo < -1e6) return undefined
  }
  if (scaledTof(hi) < target) return undefined

  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    if (scaledTof(mid) > target) hi = mid
    else lo = mid
    if (hi - lo < 1e-12) break
  }
  const yz = y((lo + hi) / 2)

  const f = 1 - yz / r1n
  const g = A * Math.sqrt(yz / mu)
  const gDot = 1 - yz / r2n
  const v1: Vec3 = [(r2[0] - f * r1[0]) / g, (r2[1] - f * r1[1]) / g, (r2[2] - f * r1[2]) / g]
  const v2: Vec3 = [
    (gDot * r2[0] - r1[0]) / g,
    (gDot * r2[1] - r1[1]) / g,
    (gDot * r2[2] - r1[2]) / g,
  ]
  return { v1, v2 }
}
