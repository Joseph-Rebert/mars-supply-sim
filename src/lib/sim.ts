// Pure simulation: MissionPlan in, SimResult out. No DOM, no React — runs in Node and Vitest.
// TODO(GEA-22): Monte Carlo runner (runMission)

import {
  CO2_SCRUBBER_GRACE_DAYS,
  COMPONENTS,
  CREW_NEEDS_KG_PER_CREW_DAY,
  DESTINATION_PROFILES,
  ELECTROLYSIS_WATER_KG_PER_KG_O2,
  GREENHOUSE_FOOD_KG_PER_M2_DAY,
} from './data'
import { daysBetween } from './dates'
import type { Rng } from './rng'
import {
  COMPONENT_KEYS,
  type CargoFlight,
  type ComponentEvent,
  type ComponentKey,
  type ConsumableKey,
  type FailureCause,
  type MissionPlan,
  type O2Source,
  type ResourceKey,
  type RunResult,
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
    food: crew * CREW_NEEDS_KG_PER_CREW_DAY.food,
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
 * Day index a flight's cargo becomes usable (≤ 0 is clamped to day 0), or null if it never arrives.
 * TODO(GEA-19): use transferFor(destination, launchDate); until then only pre-launched cargo counts.
 */
export function arrivalDay(plan: MissionPlan, flight: CargoFlight): number | null {
  return daysBetween(plan.startDate, flight.launchDate) <= 0 ? 0 : null
}

type Delivery = {
  day: number
  kg: Record<ConsumableKey, number>
  spares: Record<ComponentKey, number>
}

function deliveries(plan: MissionPlan): Delivery[] {
  const out: Delivery[] = []
  for (const flight of plan.flights) {
    const day = arrivalDay(plan, flight)
    if (day === null || day >= plan.durationDays) continue
    out.push({ day: Math.max(0, day), kg: flight.consumablesKg, spares: flight.spares })
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
export function runOnce(plan: MissionPlan, rng: Rng): RunResult {
  const days = plan.durationDays
  const rates = dailyRates(plan)
  const arrivals = deliveries(plan)
  const installed = installedComponents(plan)
  const failProbability = {} as Record<ComponentKey, number>
  for (const c of COMPONENT_KEYS) failProbability[c] = 1 / COMPONENTS[c].mtbfDays

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
            downUntil[c] = day + COMPONENTS[c].repairDays
          }
        } else if (downUntil[c] === ONLINE && rng() < failProbability[c]) {
          const spareUsed = spareStock[c] > 0
          if (spareUsed) spareStock[c]--
          downUntil[c] = spareUsed ? day + COMPONENTS[c].repairDays : AWAITING_SPARE
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

  return { survived: !failure, failure, stocks, componentEvents: events }
}
