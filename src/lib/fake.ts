// Fake data so UI work can start before the sim exists (GEA-9).
// PLACEHOLDER numbers — shaped like the demo story (~62% survival, water fails ~month 19),
// NOT sourced. Real values come from data.ts; real results from sim.ts.

import { addDays, daysBetween } from './dates'
import { mulberry32, type Rng } from './rng'
import {
  COMPONENT_KEYS,
  CONSUMABLE_KEYS,
  type Band,
  type CargoArrival,
  type ConsumableKey,
  type FailureCause,
  type MissionPlan,
  type ResourceKey,
  type SimResult,
} from './types'

const PLACEHOLDER_TRANSIT_DAYS = { mars: 200, moon: 3 }
const PLACEHOLDER_SPARE_MASS_KG = 50

export function fakePlan(): MissionPlan {
  return {
    name: 'Ares Base: Draft Plan',
    destination: 'mars',
    startDate: '2029-09-01',
    durationDays: 900,
    crew: [
      {
        id: 'c1',
        name: 'Reyes',
        sex: 'female',
        ageYears: 41,
        massKg: 62,
        activity: 'moderate',
        exerciseMinPerDay: 120,
      },
      {
        id: 'c2',
        name: 'Okafor',
        sex: 'male',
        ageYears: 38,
        massKg: 81,
        activity: 'heavy',
        exerciseMinPerDay: 120,
      },
      {
        id: 'c3',
        name: 'Lindqvist',
        sex: 'female',
        ageYears: 35,
        massKg: 58,
        activity: 'moderate',
        exerciseMinPerDay: 90,
      },
      {
        id: 'c4',
        name: 'Tanaka',
        sex: 'male',
        ageYears: 46,
        massKg: 74,
        activity: 'light',
        exerciseMinPerDay: 90,
      },
    ],
    lifeSupport: {
      waterRecoveryRate: 0.93,
      o2Source: 'electrolysis',
      greenhouse: { enabled: false, areaM2: 0 },
    },
    flights: [
      {
        id: 'f1',
        label: 'Initial landing',
        launchDate: '2028-12-01',
        consumablesKg: { o2: 900, water: 2400, food: 3000 },
        spares: { waterRecycler: 2, o2Generator: 2, co2Scrubber: 2, greenhouse: 0 },
      },
      {
        id: 'f2',
        label: 'Resupply 1',
        launchDate: '2031-01-15',
        consumablesKg: { o2: 400, water: 800, food: 2600 },
        spares: { waterRecycler: 1, o2Generator: 1, co2Scrubber: 1, greenhouse: 0 },
      },
    ],
    baseVehiclePayloadKg: 15_000,
  }
}

function gaussian(rng: Rng, mean: number, sd: number): number {
  // Box–Muller
  const u = 1 - rng()
  const v = rng()
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

function fakeArrivals(plan: MissionPlan): CargoArrival[] {
  const transit = PLACEHOLDER_TRANSIT_DAYS[plan.destination]
  return plan.flights.map((f) => {
    const arrivalDate = addDays(f.launchDate, transit)
    return {
      flightId: f.id,
      launchDate: f.launchDate,
      arrivalDate,
      arrivalDay: daysBetween(plan.startDate, arrivalDate),
    }
  })
}

function band(
  days: number,
  p50At: (day: number) => number,
  spreadAt: (day: number) => number,
): Band {
  const p10: number[] = []
  const p50: number[] = []
  const p90: number[] = []
  for (let d = 0; d < days; d++) {
    const mid = Math.max(0, p50At(d))
    const s = spreadAt(d)
    p50.push(mid)
    p10.push(Math.max(0, mid - s))
    p90.push(mid + s)
  }
  return { p10, p50, p90 }
}

/** Amount delivered by flights that have arrived by `day` (initial stock counts at day 0). */
function deliveredBy(arrivals: CargoArrival[], amounts: number[], day: number): number {
  return arrivals.reduce((sum, a, i) => (a.arrivalDay <= day ? sum + amounts[i] : sum), 0)
}

function fakeFailures(rng: Rng, failedRuns: number): FailureCause[] {
  const failures: FailureCause[] = []
  for (let i = 0; i < failedRuns; i++) {
    const r = rng()
    if (r < 0.7) {
      const day = Math.round(gaussian(rng, 570, 40))
      failures.push({ kind: 'stockout', resource: 'water', day, offlineComponent: 'waterRecycler' })
    } else if (r < 0.9) {
      const day = Math.round(gaussian(rng, 700, 50))
      failures.push({ kind: 'stockout', resource: 'o2', day, offlineComponent: 'o2Generator' })
    } else {
      failures.push({ kind: 'stockout', resource: 'food', day: Math.round(gaussian(rng, 820, 30)) })
    }
  }
  return failures
}

export function fakeResult(plan: MissionPlan = fakePlan(), seed = 1, runs = 1000): SimResult {
  const rng = mulberry32(seed)
  const days = plan.durationDays
  const arrivals = fakeArrivals(plan)

  // Water drains fastest and spreads widest after ~day 400 (recycler failures) → weakest link.
  const drainShare: Record<ConsumableKey, number> = { o2: 0.85, water: 0.97, food: 0.88 }
  const bands = {} as Record<ResourceKey, Band>
  for (const r of CONSUMABLE_KEYS) {
    const amounts = plan.flights.map((f) => f.consumablesKg[r])
    const total = amounts.reduce((a, b) => a + b, 0)
    const drainPerDay = (total * drainShare[r]) / days
    const initial = deliveredBy(arrivals, amounts, 0)
    bands[r] = band(
      days,
      (d) => deliveredBy(arrivals, amounts, d) - drainPerDay * d,
      (d) => initial * (r === 'water' && d > 400 ? 0.012 : 0.004) * Math.sqrt(d),
    )
  }

  const spareCounts = plan.flights.map((f) => COMPONENT_KEYS.reduce((s, c) => s + f.spares[c], 0))
  bands.spares = band(
    days,
    (d) => deliveredBy(arrivals, spareCounts, d) - d / 120,
    (d) => 0.6 * Math.sqrt(d / 30),
  )

  const failures = fakeFailures(rng, Math.round(runs * 0.38))

  const totalLaunchMassKg = plan.flights.reduce((sum, f) => {
    const consumables = CONSUMABLE_KEYS.reduce((s, r) => s + f.consumablesKg[r], 0)
    const spares = COMPONENT_KEYS.reduce((s, c) => s + f.spares[c], 0) * PLACEHOLDER_SPARE_MASS_KG
    return sum + consumables + spares
  }, 0)

  const crewHealth: Record<string, Band> = {}
  for (const member of plan.crew) {
    const decline = 0.02 + rng() * 0.02
    crewHealth[member.id] = band(
      days,
      (d) => 100 - decline * d,
      (d) => 2 + d * 0.01,
    )
  }

  return {
    runs,
    seed,
    survivalRate: 1 - failures.length / runs,
    durationDays: days,
    bands,
    failures,
    arrivals,
    totalLaunchMassKg,
    crewHealth,
  }
}
