// Plan a new mission (GEA-42): the cheapest cargo plan — fewest launches, then least launch mass — whose
// Monte Carlo survival reaches a target. Pure; runs as a generator so the UI can show progress between steps.

import { COMPONENTS, DESTINATION_PROFILES, LAUNCH_COST_USD } from './data'
import { addDays, daysBetween } from './dates'
import { flightCapacity, flightMassKg, totalLaunchMassKg } from './manifest'
import { mulberry32 } from './rng'
import { dailyRates, installedComponents, runOnce } from './sim'
import { launchWindows, transferFor } from './transfers'
import {
  COMPONENT_KEYS,
  CONSUMABLE_KEYS,
  type CargoFlight,
  type ComponentKey,
  type ConsumableKey,
  type CrewMember,
  type Destination,
  type IsoDate,
  type LifeSupportConfig,
  type MissionPlan,
} from './types'

/** What the wizard asks for; the optimizer decides the flights. */
export type MissionSpec = {
  name: string
  destination: Destination
  startDate: IsoDate
  durationDays: number
  crew: CrewMember[]
  lifeSupport: LifeSupportConfig
  /** Survival to reach, 0–1, e.g. 0.95. */
  targetSurvival: number
}

export type PlanCost = {
  launches: number
  launchMassKg: number
  costUsd: number
}

export type OptimizedPlan = PlanCost & {
  plan: MissionPlan
  /** Survival at the verification run count and seed. */
  survivalRate: number
  reachedTarget: boolean
  /** Plain-language summary of the choices, e.g. margin days and spare confidence. */
  notes: string[]
}

export type OptimizeProgress = { phase: 'search' | 'trim' | 'verify'; done: number; total: number }

export type OptimizeOptions = {
  /** Runs per candidate while searching (noisier, faster). */
  searchRuns: number
  /** Runs for the final check (matches the results view). */
  verifyRuns: number
  seed: number
  /** Extra survival required during search/trim so the verified number still clears the target. */
  noiseGuard: number
}

export const DEFAULT_OPTIMIZE_OPTIONS: OptimizeOptions = {
  searchRuns: 250,
  verifyRuns: 1000,
  seed: 1,
  noiseGuard: 0.015,
}

// Search grid: days of extra stock beyond the expected need, and per-delivery spare confidence.
const MARGIN_DAYS = [5, 15, 30, 60, 90]
const SPARE_CONFIDENCE = [0.8, 0.9, 0.95, 0.99, 0.999]
/** Moon: resupplies spread evenly over the mission (launch any day). */
const MOON_RESUPPLY_COUNTS = [0, 1, 2, 3]
const TRIM_FRACTION = 0.1
const MAX_TRIM_SWEEPS = 3

type Cargo = { kg: Record<ConsumableKey, number>; spares: Record<ComponentKey, number> }
/** Cargo that must land by a mission day, launched on one date (possibly several flights). */
type Delivery = { launchDate: IsoDate; arrivalDay: number; label: string; cargo: Cargo }

const emptyCargo = (): Cargo => ({
  kg: { o2: 0, water: 0, food: 0 },
  spares: { waterRecycler: 0, o2Generator: 0, co2Scrubber: 0, greenhouse: 0 },
})

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const monthYear = (d: IsoDate) => `${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`

/** Smallest n with P(Poisson(λ) ≤ n) ≥ q. */
export function poissonQuantile(lambda: number, q: number): number {
  let p = Math.exp(-lambda)
  let cdf = p
  let n = 0
  while (cdf < q && n < 1000) {
    n++
    p *= lambda / n
    cdf += p
  }
  return n
}

function basePlan(spec: MissionSpec, flights: CargoFlight[] = []): MissionPlan {
  return {
    name: spec.name,
    destination: spec.destination,
    startDate: spec.startDate,
    durationDays: spec.durationDays,
    crew: spec.crew,
    lifeSupport: spec.lifeSupport,
    flights,
    baseVehiclePayloadKg: DESTINATION_PROFILES[spec.destination].baseVehiclePayloadKg,
  }
}

/** Launch dates: the landing before the crew arrives, then resupplies that land mid-mission. */
function schedules(
  spec: MissionSpec,
): { launchDate: IsoDate; arrivalDay: number; label: string }[][] {
  const arrival = (date: IsoDate) =>
    daysBetween(spec.startDate, transferFor(spec.destination, date).arrivalDate)
  const windows = launchWindows(spec.destination)

  if (windows.length === 0) {
    // Any-day destination (Moon): land just before the crew; try 0–3 evenly spaced resupplies.
    const transit = transferFor(spec.destination, spec.startDate).transitDays
    const first = addDays(spec.startDate, -transit - 1)
    return MOON_RESUPPLY_COUNTS.map((k) => {
      const out = [{ launchDate: first, arrivalDay: arrival(first), label: 'Cargo lander' }]
      for (let i = 1; i <= k; i++) {
        const lands = Math.round((i * spec.durationDays) / (k + 1))
        const date = addDays(spec.startDate, lands - transit)
        out.push({ launchDate: date, arrivalDay: arrival(date), label: `Resupply ${i}` })
      }
      return out
    })
  }

  // Window destination (Mars): the last best date that lands before day 0, then every later window
  // whose cargo lands before the mission ends.
  const best = windows.map((w) => ({ launchDate: w.bestDate, arrivalDay: arrival(w.bestDate) }))
  const before = best.filter((b) => b.arrivalDay <= 0)
  if (before.length === 0) {
    throw new RangeError(
      `No ${spec.destination} launch window lands cargo before ${spec.startDate}`,
    )
  }
  const lander = { ...before[before.length - 1], label: 'Cargo lander' }
  const resupplies = best
    .filter((b) => b.arrivalDay > 0 && b.arrivalDay < spec.durationDays)
    .map((b, i) => ({ ...b, label: `Resupply ${i + 1}` }))
  // With and without the mid-mission windows (shipping everything up front can mean fewer launches).
  return resupplies.length > 0 ? [[lander, ...resupplies], [lander]] : [[lander]]
}

/** Size each delivery to cover its stretch of the mission, plus margin days and spares. */
function sizeDeliveries(
  spec: MissionSpec,
  schedule: ReturnType<typeof schedules>[number],
  marginDays: number,
  spareConfidence: number,
): Delivery[] {
  const plan = basePlan(spec)
  const rates = dailyRates(plan)
  const installed = installedComponents(plan)
  const net: Record<ConsumableKey, number> = {
    o2: Math.max(0, rates.consumeKg.o2 - rates.o2ProducedKg),
    water: Math.max(0, rates.consumeKg.water - rates.waterRecoveredKg + rates.o2WaterCostKg),
    food: Math.max(0, rates.consumeKg.food - rates.greenhouseFoodKg),
  }
  return schedule.map((s, i) => {
    const from = Math.max(0, s.arrivalDay)
    const to = i + 1 < schedule.length ? Math.max(0, schedule[i + 1].arrivalDay) : spec.durationDays
    const days = Math.max(0, to - from)
    const cargo = emptyCargo()
    for (const r of CONSUMABLE_KEYS) {
      // Margin covers outages (gross use while a recycler/generator/greenhouse is down) and noise.
      cargo.kg[r] = Math.ceil(net[r] * days + (i === 0 ? rates.consumeKg[r] * marginDays : 0))
    }
    for (const c of COMPONENT_KEYS) {
      cargo.spares[c] = installed[c]
        ? poissonQuantile(days / COMPONENTS[c].mtbfDays, spareConfidence)
        : 0
    }
    return { launchDate: s.launchDate, arrivalDay: s.arrivalDay, label: s.label, cargo }
  })
}

/** How many launches one delivery needs at its date-adjusted payload. */
function flightsFor(spec: MissionSpec, d: Delivery): number {
  const probe: CargoFlight = {
    id: 'probe',
    label: d.label,
    launchDate: d.launchDate,
    consumablesKg: d.cargo.kg,
    spares: d.cargo.spares,
  }
  const mass = flightMassKg(probe)
  if (mass === 0) return 0
  return Math.max(1, Math.ceil(mass / (flightCapacity(basePlan(spec), probe).capacityKg * 0.999)))
}

/** Turn deliveries into flights, splitting any that exceed one launch's date-adjusted payload. */
function pack(spec: MissionSpec, deliveries: Delivery[]): MissionPlan {
  const plan = basePlan(spec)
  const flights: CargoFlight[] = []
  for (const d of deliveries) {
    const probe: CargoFlight = {
      id: 'probe',
      label: d.label,
      launchDate: d.launchDate,
      consumablesKg: d.cargo.kg,
      spares: d.cargo.spares,
    }
    const capacity = flightCapacity(plan, probe).capacityKg
    const mass = flightMassKg(probe)
    if (mass === 0) continue
    const n = Math.max(1, Math.ceil(mass / (capacity * 0.999)))
    for (let k = 0; k < n; k++) {
      const spares = {} as Record<ComponentKey, number>
      for (const c of COMPONENT_KEYS) {
        // Spread spares as evenly as possible; the first flights take the remainder.
        spares[c] = Math.floor(d.cargo.spares[c] / n) + (k < d.cargo.spares[c] % n ? 1 : 0)
      }
      const kg = {} as Record<ConsumableKey, number>
      for (const r of CONSUMABLE_KEYS) kg[r] = d.cargo.kg[r] / n
      flights.push({
        id: `f${flights.length + 1}`,
        label:
          n > 1
            ? `${d.label} ${String.fromCharCode(65 + k)} (${monthYear(d.launchDate)})`
            : `${d.label} (${monthYear(d.launchDate)})`,
        launchDate: d.launchDate,
        consumablesKg: kg,
        spares,
      })
    }
  }
  return { ...plan, flights }
}

export function planCost(plan: MissionPlan): PlanCost {
  return {
    launches: plan.flights.length,
    launchMassKg: totalLaunchMassKg(plan),
    costUsd: plan.flights.length * LAUNCH_COST_USD,
  }
}

const cheaper = (a: PlanCost, b: PlanCost) =>
  a.launches - b.launches || a.launchMassKg - b.launchMassKg

/** Survival only, on one seeded stream (same sequence as runMission for the same seed). */
export function survivalOf(plan: MissionPlan, runs: number, seed: number): number {
  const rng = mulberry32(seed)
  let ok = 0
  for (let i = 0; i < runs; i++) if (runOnce(plan, rng, undefined, false).survived) ok++
  return ok / runs
}

/**
 * Whether survival over `runs` (one seeded stream) reaches `bar`. Exactly equivalent to
 * survivalOf(...) >= bar, but stops as soon as there are too many failures to get there.
 */
export function survivalReaches(
  plan: MissionPlan,
  runs: number,
  seed: number,
  bar: number,
): boolean {
  const allowedFailures = Math.floor(runs * (1 - bar) + 1e-9)
  const rng = mulberry32(seed)
  let failures = 0
  for (let i = 0; i < runs; i++) {
    if (!runOnce(plan, rng, undefined, false).survived && ++failures > allowedFailures) return false
  }
  return true
}

const cloneDeliveries = (ds: Delivery[]): Delivery[] =>
  ds.map((d) => ({ ...d, cargo: { kg: { ...d.cargo.kg }, spares: { ...d.cargo.spares } } }))

/**
 * Generator: yields progress, returns the plan. Search candidates cheapest-first, so the first one
 * that reaches the target (with a noise guard) is the cheapest; verify it at verifyRuns; then trim
 * single line items while survival holds, and keep the trimmed plan only if it still verifies.
 */
export function* optimizeMission(
  spec: MissionSpec,
  options: OptimizeOptions = DEFAULT_OPTIMIZE_OPTIONS,
): Generator<OptimizeProgress, OptimizedPlan> {
  const { searchRuns, verifyRuns, seed, noiseGuard } = options
  const target = spec.targetSurvival

  // Every candidate costed up front (cheap, no simulation), then simulated in cost order.
  const candidates = schedules(spec)
    .flatMap((schedule) =>
      MARGIN_DAYS.flatMap((marginDays) =>
        SPARE_CONFIDENCE.map((spareConfidence) => {
          const deliveries = sizeDeliveries(spec, schedule, marginDays, spareConfidence)
          const plan = pack(spec, deliveries)
          return { deliveries, plan, cost: planCost(plan), marginDays, spareConfidence }
        }),
      ),
    )
    .sort((a, b) => cheaper(a.cost, b.cost))

  let chosen: (typeof candidates)[number] | undefined
  let chosenSurvival = 0
  for (let i = 0; i < candidates.length; i++) {
    yield { phase: 'search', done: i, total: candidates.length }
    const c = candidates[i]
    if (!survivalReaches(c.plan, searchRuns, seed, target + noiseGuard)) continue
    const verified = survivalOf(c.plan, verifyRuns, seed)
    if (verified >= target) {
      chosen = c
      chosenSurvival = verified
      break
    }
  }

  if (!chosen) {
    // Nothing reached the target: return the most generous candidate so the user sees the gap.
    const last = candidates.reduce((a, b) =>
      b.marginDays * b.spareConfidence > a.marginDays * a.spareConfidence ? b : a,
    )
    const survivalRate = survivalOf(last.plan, verifyRuns, seed)
    return {
      ...last.cost,
      plan: last.plan,
      survivalRate,
      reachedTarget: false,
      notes: [
        `No plan in the search reached ${Math.round(target * 100)}%; best found ${(survivalRate * 100).toFixed(1)}%.`,
      ],
    }
  }

  // Trim: remove one spare, or 10% of one flight's supply, while survival still clears the bar.
  // Each item is cut repeatedly until it fails; sweeps repeat until a whole sweep changes nothing.
  // Same-day flights land together, so items are per delivery (the cut scales with its flight count).
  type Step = (ds: Delivery[]) => boolean
  const steps: Step[] = []
  chosen.deliveries.forEach((_, i) => {
    for (const c of COMPONENT_KEYS) {
      steps.push((ds) => {
        if (ds[i].cargo.spares[c] === 0) return false
        ds[i].cargo.spares[c]--
        return true
      })
    }
    for (const r of CONSUMABLE_KEYS) {
      steps.push((ds) => {
        const flights = Math.max(1, flightsFor(spec, ds[i]))
        const cut = Math.floor((ds[i].cargo.kg[r] / flights) * TRIM_FRACTION)
        if (cut < 1) return false
        ds[i].cargo.kg[r] -= cut
        return true
      })
    }
  })
  let current = cloneDeliveries(chosen.deliveries)
  const bar = target + noiseGuard
  for (let sweep = 0, changed = true; changed && sweep < MAX_TRIM_SWEEPS; sweep++) {
    changed = false
    for (let s = 0; s < steps.length; s++) {
      yield { phase: 'trim', done: sweep * steps.length + s, total: MAX_TRIM_SWEEPS * steps.length }
      for (;;) {
        const trial = cloneDeliveries(current)
        if (!steps[s](trial)) break
        if (!survivalReaches(pack(spec, trial), searchRuns, seed, bar)) break
        current = trial
        changed = true
      }
    }
  }

  yield { phase: 'verify', done: 0, total: 1 }
  let plan = pack(spec, current)
  let survivalRate = survivalOf(plan, verifyRuns, seed)
  const notes = [
    `${chosen.marginDays} days of extra stock on the first landing; spares sized for ${Math.round(chosen.spareConfidence * 1000) / 10}% confidence per resupply interval.`,
  ]
  if (survivalRate < target) {
    // The trimmed plan slipped under the target at full run count: keep the verified untrimmed one.
    plan = chosen.plan
    survivalRate = chosenSurvival
    notes.push('Trimming was undone: it fell below the target at the full run count.')
  } else {
    notes.push('Then trimmed line items one at a time while survival stayed above the target.')
  }
  return { ...planCost(plan), plan, survivalRate, reachedTarget: true, notes }
}

/** Runs the generator to completion (tests, scripts). */
export function optimizeMissionSync(spec: MissionSpec, options?: OptimizeOptions): OptimizedPlan {
  const it = optimizeMission(spec, options)
  for (;;) {
    const step = it.next()
    if (step.done) return step.value
  }
}
