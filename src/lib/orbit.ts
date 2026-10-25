// Heliocentric geometry for the orbit view: Earth and Mars from the JPL Horizons cache, and each cargo
// flight's path from the same Lambert solve scripts/build-transfers.ts used to build the transfer table.

import horizons from '../cache/horizons-earth-mars.json'
import { EARTH_ORBIT_PERIOD_DAYS, MARS_ORBIT_PERIOD_DAYS, MU_SUN_KM3_PER_S2 } from './data'
import { addDays, daysBetween } from './dates'
import { solveLambert, type Vec3 } from './lambert'
import type { IsoDate } from './types'

type State = { r: Vec3; v: Vec3 }
export type EphemerisDay = { date: IsoDate; earth: State; mars: State; distanceKm: number }

const DAYS = horizons.days as unknown as EphemerisDay[]
const BY_DATE = new Map(DAYS.map((d) => [d.date, d]))

export const EPHEMERIS_RANGE = { first: DAYS[0].date, last: DAYS.at(-1)!.date }

export function ephemeris(date: IsoDate): EphemerisDay | undefined {
  return BY_DATE.get(date)
}

/** One full orbit of each planet, sampled daily from the ephemeris, for drawing the rings. */
export function orbitPaths(): { earth: Vec3[]; mars: Vec3[] } {
  return {
    earth: DAYS.slice(0, Math.round(EARTH_ORBIT_PERIOD_DAYS) + 1).map((d) => d.earth.r),
    mars: DAYS.slice(0, Math.round(MARS_ORBIT_PERIOD_DAYS) + 1).map((d) => d.mars.r),
  }
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const norm = (a: Vec3) => Math.sqrt(dot(a, a))

/** Stumpff functions C(z), S(z), with series near 0 (same as lambert.ts). */
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
 * Two-body position `dt` seconds after state (r0, v0). Universal-variable Kepler propagation, Curtis,
 * "Orbital Mechanics for Engineering Students", Algorithms 3.3 and 3.4 (the book lambert.ts follows).
 */
export function propagate(r0: Vec3, v0: Vec3, dt: number, mu = MU_SUN_KM3_PER_S2): Vec3 {
  const r0n = norm(r0)
  const vr0 = dot(r0, v0) / r0n
  const alpha = 2 / r0n - dot(v0, v0) / mu
  const sqMu = Math.sqrt(mu)
  let x = sqMu * Math.abs(alpha) * dt
  for (let i = 0; i < 100; i++) {
    const z = alpha * x * x
    const [C, S] = stumpff(z)
    const F =
      ((r0n * vr0) / sqMu) * x * x * C + (1 - alpha * r0n) * x ** 3 * S + r0n * x - sqMu * dt
    const dF = ((r0n * vr0) / sqMu) * x * (1 - z * S) + (1 - alpha * r0n) * x * x * C + r0n
    const step = F / dF
    x -= step
    if (Math.abs(step) < 1e-9) break
  }
  const [C, S] = stumpff(alpha * x * x)
  const f = 1 - ((x * x) / r0n) * C
  const g = dt - (x ** 3 / sqMu) * S
  return [f * r0[0] + g * v0[0], f * r0[1] + g * v0[1], f * r0[2] + g * v0[2]]
}

export type TransferArc = {
  launchDate: IsoDate
  arrivalDate: IsoDate
  transitDays: number
  /** Sampled path from Earth at launch to Mars at arrival. */
  points: Vec3[]
  /** Cargo position `days` after launch, clamped to the trip. */
  positionAt: (days: number) => Vec3
}

/** A Mars flight's path, or null when its dates fall outside the cached ephemeris. */
export function transferArc(
  launchDate: IsoDate,
  arrivalDate: IsoDate,
  samples = 160,
): TransferArc | null {
  const from = ephemeris(launchDate)
  const to = ephemeris(arrivalDate)
  if (!from || !to) return null
  const transitDays = daysBetween(launchDate, arrivalDate)
  const sol = solveLambert(from.earth.r, to.mars.r, transitDays * 86_400, MU_SUN_KM3_PER_S2)
  if (!sol) return null
  const positionAt = (days: number) =>
    propagate(from.earth.r, sol.v1, Math.min(Math.max(days, 0), transitDays) * 86_400)
  const points = Array.from({ length: samples + 1 }, (_, i) =>
    positionAt((transitDays * i) / samples),
  )
  return { launchDate, arrivalDate, transitDays, points, positionAt }
}

/** `first`..`last` clipped to the ephemeris, with its length in days. */
export function dateSpan(
  first: IsoDate,
  last: IsoDate,
): { first: IsoDate; last: IsoDate; days: number } {
  const a = first < EPHEMERIS_RANGE.first ? EPHEMERIS_RANGE.first : first
  const b = last > EPHEMERIS_RANGE.last ? EPHEMERIS_RANGE.last : last
  return { first: a, last: b, days: daysBetween(a, b) }
}

export { addDays }
