// Pure simulation: MissionPlan in, SimResult out. No DOM, no React — runs in Node and Vitest.

import {
  CO2_SCRUBBER_GRACE_DAYS,
  COMPONENTS,
  CREW_NEEDS_KG_PER_CREW_DAY,
  DESTINATION_PROFILES,
  ELECTROLYSIS_WATER_KG_PER_KG_O2,
  GREENHOUSE_FOOD_KG_PER_M2_DAY,
} from './data'
import { crewFoodKgPerDay, type CrewProfile } from './crew'
import { createNutritionTracker } from './diet'
import { createHealthTracker } from './health'
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
  const health =
    nutrition &&
    createHealthTracker(plan.crew as CrewProfile[], DESTINATION_PROFILES[plan.destination].gravityG)
  const healthScore = health
    ? plan.crew.map(() => new Float64Array(Math.ceil(days / HEALTH_BAND_STEP_DAYS)))
    : null

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
        health?.step(nutrition)
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
      } else if (health) {
        const unfit = health.unfit()
        if (unfit) {
          failure = {
            kind: 'crewUnfit',
            day,
            crewId: plan.crew[unfit.index].id,
            driver: unfit.driver,
          }
        }
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
    if (health && healthScore) {
      if (day % HEALTH_BAND_STEP_DAYS === 0) {
        const w = day / HEALTH_BAND_STEP_DAYS
        for (let i = 0; i < healthScore.length; i++) healthScore[i][w] = health.score(i)
      }
    }
    stocks.spares[day] =
      spareStock.waterRecycler +
      spareStock.o2Generator +
      spareStock.co2Scrubber +
      spareStock.greenhouse
  }

  const result: RunResult = { survived: !failure, failure, stocks, componentEvents: events }
  if (nutrition) result.nutrition = nutrition.result()
  if (health && healthScore) {
    result.healthScore = Object.fromEntries(plan.crew.map((m, i) => [m.id, healthScore[i]]))
    result.body = Object.fromEntries(plan.crew.map((m, i) => [m.id, health.body(i)]))
  }
  return result
}

export const DEFAULT_RUN_OPTIONS: RunOptions = { runs: 1000, seed: 1 }

/** Health bands are computed every this many days and held in between (crew-card sparklines). */
export const HEALTH_BAND_STEP_DAYS = 7

/** Expands a band sampled every HEALTH_BAND_STEP_DAYS into one value per day (step-hold). */
function holdDaily(band: Band, days: number): Band {
  const hold = (s: number[]) =>
    Array.from({ length: days }, (_, d) => s[Math.floor(d / HEALTH_BAND_STEP_DAYS)])
  return { p10: hold(band.p10), p50: hold(band.p50), p90: hold(band.p90) }
}

/** Value at quantile q (0–1) of an ascending array, interpolating between neighbours. */
export function quantile(sorted: ArrayLike<number>, q: number): number {
  const pos = q * (sorted.length - 1)
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

/** Moves the k-th smallest value of a[left..right] to index k (quickselect, Hoare partition). */
function selectKth(a: Float64Array, k: number, left: number, right: number): void {
  while (left < right) {
    const pivot = a[(left + right) >> 1]
    let i = left
    let j = right
    while (i <= j) {
      while (a[i] < pivot) i++
      while (a[j] > pivot) j--
      if (i <= j) {
        const tmp = a[i]
        a[i] = a[j]
        a[j] = tmp
        i++
        j--
      }
    }
    if (k <= j) right = j
    else if (k >= i) left = i
    else return
  }
}

/** Same value as quantile() on the sorted array, without sorting it all (reorders `a`). */
function quantileSelect(a: Float64Array, q: number): number {
  const pos = q * (a.length - 1)
  const lo = Math.floor(pos)
  selectKth(a, lo, 0, a.length - 1)
  const low = a[lo]
  if (pos === lo) return low
  // Everything after index lo is ≥ a[lo]; the next order statistic is their minimum.
  let next = Infinity
  for (let i = lo + 1; i < a.length; i++) if (a[i] < next) next = a[i]
  return low + (next - low) * (pos - lo)
}

/** P10/P50/P90 per day from day-major samples (`samples[day * runs + run]`). Reorders in place. */
export function percentileBand(samples: Float64Array, days: number, runs: number): Band {
  const band: Band = { p10: new Array(days), p50: new Array(days), p90: new Array(days) }
  for (let day = 0; day < days; day++) {
    const values = samples.subarray(day * runs, (day + 1) * runs)
    band.p10[day] = quantileSelect(values, 0.1)
    band.p50[day] = quantileSelect(values, 0.5)
    band.p90[day] = quantileSelect(values, 0.9)
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

  // Health score samples per crew member, weekly (sparklines don't need daily resolution), filled only
  // when runs report health (full crew profiles).
  const weeks = Math.ceil(days / HEALTH_BAND_STEP_DAYS)
  const healthSamples = new Map<string, Float64Array>()

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
    for (const [id, series] of Object.entries(result.healthScore ?? {})) {
      let out = healthSamples.get(id)
      if (!out) healthSamples.set(id, (out = new Float64Array(weeks * runs)))
      for (let w = 0; w < weeks; w++) out[w * runs + run] = series[w]
    }
  }

  const bands = {} as Record<ResourceKey, Band>
  for (const k of RESOURCE_KEYS) bands[k] = percentileBand(samples[k], days, runs)

  const sim: SimResult = {
    runs,
    seed,
    survivalRate: survived / runs,
    durationDays: days,
    bands,
    failures,
    arrivals: cargoArrivals(plan),
    totalLaunchMassKg: totalLaunchMassKg(plan),
  }
  if (healthSamples.size > 0) {
    sim.crewHealth = Object.fromEntries(
      [...healthSamples].map(([id, s]) => [id, holdDaily(percentileBand(s, weeks, runs), days)]),
    )
  }
  return sim
}
