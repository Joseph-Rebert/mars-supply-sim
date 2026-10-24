// Pure simulation: MissionPlan in, SimResult out. No DOM, no React — runs in Node and Vitest.

import {
  CO2_SCRUBBER_GRACE_DAYS,
  COMPONENTS,
  CREW_NEEDS_KG_PER_CREW_DAY,
  DESTINATION_PROFILES,
  ELECTROLYSIS_WATER_KG_PER_KG_O2,
  GREENHOUSE_FOOD_KG_PER_M2_DAY,
} from './data'
import { crewFoodKgPerDay } from './crew'
import { createNutritionTracker } from './diet'
import { daysBetween } from './dates'
import { cargoArrivals, totalLaunchMassKg } from './manifest'
import { mulberry32, type Rng } from './rng'
import { transferFor } from './transfers'
import {
  COMPONENT_KEYS,
  RESOURCE_KEYS,
  type Band,
  type CargoFlight,
  type ComponentEvent,
  type ComponentKey,
  type ComponentSpec,
  type ConsumableKey,
  type FailureCause,
  type MissionPlan,
  type O2Source,
  type ResourceKey,
  type RunOptions,
  type RunResult,
  type SimResult,
} from './types'

/** Per-day flows for a plan with every system online, computed once per plan. */
export type DailyRates = {
  consumeKg: Record<ConsumableKey, number>
  /** Water returned by the recycler. */
  waterRecoveredKg: number
  /** O₂ made by the O₂ generator (electrolysis or ISRU). Sized to crew demand. */
  o2ProducedKg: number
  /** Water split to make that O₂. Zero for ISRU; no Sabatier, so electrolysis water is lost. */
  o2WaterCostKg: number
  greenhouseFoodKg: number
}

export function dailyRates(plan: MissionPlan): DailyRates {
  const crew = plan.crew.length
  const consumeKg = {
    o2: crew * CREW_NEEDS_KG_PER_CREW_DAY.o2,
    water: crew * CREW_NEEDS_KG_PER_CREW_DAY.water,
    // Personal needs (GEA-17) when every crew member has a full profile; else the BVAD flat rate.
    food: crewFoodKgPerDay(plan.crew) ?? crew * CREW_NEEDS_KG_PER_CREW_DAY.food,
  }
  const { waterRecoveryRate, o2Source, greenhouse } = plan.lifeSupport
  const profile = DESTINATION_PROFILES[plan.destination]
  // ISRU is capped by what the destination's plant can make (lunar regolith O₂ falls short of crew demand).
  const o2CapacityKg: Record<O2Source, number> = {
    electrolysis: consumeKg.o2,
    isru: profile.isruO2KgPerDay,
    tanks: 0,
  }
  const o2ProducedKg = Math.min(consumeKg.o2, o2CapacityKg[o2Source])
  return {
    consumeKg,
    waterRecoveredKg: consumeKg.water * waterRecoveryRate,
    o2ProducedKg,
    o2WaterCostKg: o2Source === 'electrolysis' ? o2ProducedKg * ELECTROLYSIS_WATER_KG_PER_KG_O2 : 0,
    greenhouseFoodKg: greenhouse.enabled
      ? greenhouse.areaM2 * GREENHOUSE_FOOD_KG_PER_M2_DAY * profile.greenhouseOutputFactor
      : 0,
  }
}

/**
 * Day index a flight's cargo becomes usable: its transfer-table arrival, with anything landing on or
 * before the start clamped to day 0 (initial stock). Null if it lands after the mission ends.
 */
export function arrivalDay(plan: MissionPlan, flight: CargoFlight): number | null {
  const { arrivalDate } = transferFor(plan.destination, flight.launchDate)
  const day = daysBetween(plan.startDate, arrivalDate)
  return day < plan.durationDays ? Math.max(0, day) : null
}

type Delivery = {
  day: number
  /** Mission day the cargo launched, used as the food's production date for shelf age. */
  producedDay: number
  kg: Record<ConsumableKey, number>
  spares: Record<ComponentKey, number>
}

function deliveries(plan: MissionPlan): Delivery[] {
  const out: Delivery[] = []
  for (const flight of plan.flights) {
    const day = arrivalDay(plan, flight)
    if (day === null || day >= plan.durationDays) continue
    out.push({
      day: Math.max(0, day),
      producedDay: daysBetween(plan.startDate, flight.launchDate),
      kg: flight.consumablesKg,
      spares: flight.spares,
    })
  }
  return out
}

/** The component whose output keeps each stock topped up. */
const SUPPLIED_BY: Record<ConsumableKey, ComponentKey> = {
  o2: 'o2Generator',
  water: 'waterRecycler',
  food: 'greenhouse',
}

/** Hardware the plan actually carries: no O₂ generator on tanks, no greenhouse when it's off. */
export function installedComponents(plan: MissionPlan): Record<ComponentKey, boolean> {
  return {
    waterRecycler: true,
    o2Generator: plan.lifeSupport.o2Source !== 'tanks',
    co2Scrubber: true,
    greenhouse: plan.lifeSupport.greenhouse.enabled,
  }
}

// Never equal to a day index, so 'repair finishes today' can't match an online component.
const ONLINE = -1
const AWAITING_SPARE = Infinity

/**
 * One simulated mission, stepped day by day. Deterministic for a given plan and rng seed.
 * Each day: cargo lands → repairs finish → installed, online components fail with p = 1 / MTBF
 * (a spare starts a repair; none leaves it down until one arrives) → consume / recycle / produce.
 */
export function runOnce(
  plan: MissionPlan,
  rng: Rng,
  components: Record<ComponentKey, ComponentSpec> = COMPONENTS,
): RunResult {
  const days = plan.durationDays
  const rates = dailyRates(plan)
  const arrivals = deliveries(plan)
  const installed = installedComponents(plan)
  const failProbability = {} as Record<ComponentKey, number>
  for (const c of COMPONENT_KEYS) failProbability[c] = 1 / components[c].mtbfDays

  // Day a component comes back: ONLINE, a repair-finish day, or AWAITING_SPARE.
  const downUntil: Record<ComponentKey, number> = {
    waterRecycler: ONLINE,
    o2Generator: ONLINE,
    co2Scrubber: ONLINE,
    greenhouse: ONLINE,
  }
  const spareStock: Record<ComponentKey, number> = {
    waterRecycler: 0,
    o2Generator: 0,
    co2Scrubber: 0,
    greenhouse: 0,
  }
  const online = (c: ComponentKey) => installed[c] && downUntil[c] === ONLINE
  const events: ComponentEvent[] = []
  const nutrition = createNutritionTracker(plan.crew)

  const stocks: Record<ResourceKey, number[]> = {
    o2: new Array<number>(days),
    water: new Array<number>(days),
    food: new Array<number>(days),
    spares: new Array<number>(days),
  }
  let o2 = 0
  let water = 0
  let food = 0
  let co2DownDays = 0
  let failure: FailureCause | undefined

  for (let day = 0; day < days; day++) {
    if (!failure) {
      for (const a of arrivals) {
        if (a.day !== day) continue
        o2 += a.kg.o2
        water += a.kg.water
        food += a.kg.food
        nutrition?.deliver(a.kg.food, a.producedDay)
        for (const c of COMPONENT_KEYS) spareStock[c] += a.spares[c]
      }

      for (const c of COMPONENT_KEYS) {
        if (!installed[c]) continue
        if (downUntil[c] === day) {
          downUntil[c] = ONLINE
          events.push({ day, component: c, type: 'repaired' })
        }
        if (downUntil[c] === AWAITING_SPARE) {
          if (spareStock[c] > 0) {
            spareStock[c]--
            downUntil[c] = day + components[c].repairDays
          }
        } else if (downUntil[c] === ONLINE && rng() < failProbability[c]) {
          const spareUsed = spareStock[c] > 0
          if (spareUsed) spareStock[c]--
          downUntil[c] = spareUsed ? day + components[c].repairDays : AWAITING_SPARE
          events.push({ day, component: c, type: 'failed', spareUsed })
        }
      }

      o2 -= rates.consumeKg.o2
      water -= rates.consumeKg.water
      food -= rates.consumeKg.food

      if (online('waterRecycler')) water += rates.waterRecoveredKg
      if (online('o2Generator')) {
        o2 += rates.o2ProducedKg
        water -= rates.o2WaterCostKg
      }
      if (online('greenhouse')) food += rates.greenhouseFoodKg
      if (nutrition) {
        // Fresh greenhouse produce is eaten first; any surplus goes into stock as today's batch.
        const grown = online('greenhouse') ? rates.greenhouseFoodKg : 0
        const fresh = Math.min(grown, rates.consumeKg.food)
        nutrition.eat(day, rates.consumeKg.food - fresh, fresh)
        nutrition.deliver(grown - fresh, day)
      }
      co2DownDays = online('co2Scrubber') ? 0 : co2DownDays + 1

      // O₂ first: if several run out the same day, suffocation is what ends the mission.
      const empty: ConsumableKey | undefined =
        o2 < 0 ? 'o2' : water < 0 ? 'water' : food < 0 ? 'food' : undefined
      if (empty) {
        const supplier = SUPPLIED_BY[empty]
        failure = { kind: 'stockout', resource: empty, day }
        if (installed[supplier] && !online(supplier)) {
          failure.offlineComponent = supplier
          failure.awaitingSpare = downUntil[supplier] === AWAITING_SPARE
        }
      } else if (co2DownDays > CO2_SCRUBBER_GRACE_DAYS) {
        failure = { kind: 'systemDown', component: 'co2Scrubber', day }
      }
      if (failure) {
        o2 = Math.max(0, o2)
        water = Math.max(0, water)
        food = Math.max(0, food)
      }
    }

    stocks.o2[day] = o2
    stocks.water[day] = water
    stocks.food[day] = food
    stocks.spares[day] =
      spareStock.waterRecycler +
      spareStock.o2Generator +
      spareStock.co2Scrubber +
      spareStock.greenhouse
  }

  const result: RunResult = { survived: !failure, failure, stocks, componentEvents: events }
  if (nutrition) result.nutrition = nutrition.result()
  return result
}

export const DEFAULT_RUN_OPTIONS: RunOptions = { runs: 1000, seed: 1 }

/** Value at quantile q (0–1) of an ascending array, interpolating between neighbours. */
export function quantile(sorted: ArrayLike<number>, q: number): number {
  const pos = q * (sorted.length - 1)
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

/** P10/P50/P90 per day from day-major samples (`samples[day * runs + run]`). Sorts in place. */
export function percentileBand(samples: Float64Array, days: number, runs: number): Band {
  const band: Band = { p10: new Array(days), p50: new Array(days), p90: new Array(days) }
  for (let day = 0; day < days; day++) {
    const values = samples.subarray(day * runs, (day + 1) * runs).sort()
    band.p10[day] = quantile(values, 0.1)
    band.p50[day] = quantile(values, 0.5)
    band.p90[day] = quantile(values, 0.9)
  }
  return band
}

/**
 * Monte Carlo verdict: `runs` missions from one seeded stream, so the same seed always gives the
 * same numbers. Survival = runs with no failure ÷ runs.
 */
export function runMission(
  plan: MissionPlan,
  options: RunOptions = DEFAULT_RUN_OPTIONS,
): SimResult {
  const { runs, seed, components = COMPONENTS } = options
  if (!Number.isInteger(runs) || runs < 1) throw new RangeError(`runs must be ≥ 1, got ${runs}`)
  const days = plan.durationDays
  const rng = mulberry32(seed)
  const samples = {} as Record<ResourceKey, Float64Array>
  for (const k of RESOURCE_KEYS) samples[k] = new Float64Array(days * runs)

  const failures: FailureCause[] = []
  let survived = 0
  for (let run = 0; run < runs; run++) {
    const result = runOnce(plan, rng, components)
    if (result.failure) failures.push(result.failure)
    else survived++
    for (const k of RESOURCE_KEYS) {
      const series = result.stocks[k]
      const out = samples[k]
      for (let day = 0; day < days; day++) out[day * runs + run] = series[day]
    }
  }

  const bands = {} as Record<ResourceKey, Band>
  for (const k of RESOURCE_KEYS) bands[k] = percentileBand(samples[k], days, runs)

  return {
    runs,
    seed,
    survivalRate: survived / runs,
    durationDays: days,
    bands,
    failures,
    arrivals: cargoArrivals(plan),
    totalLaunchMassKg: totalLaunchMassKg(plan),
  }
}
