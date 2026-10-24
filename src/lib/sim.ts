// Pure simulation: MissionPlan in, SimResult out. No DOM, no React — runs in Node and Vitest.
// TODO(GEA-18): component failures (MTBF + spares)
// TODO(GEA-22): Monte Carlo runner (runMission)

import {
  CREW_NEEDS_KG_PER_CREW_DAY,
  ELECTROLYSIS_WATER_KG_PER_KG_O2,
  GREENHOUSE_FOOD_KG_PER_M2_DAY,
} from './data'
import { daysBetween } from './dates'
import type { Rng } from './rng'
import {
  COMPONENT_KEYS,
  type CargoFlight,
  type ComponentKey,
  type ConsumableKey,
  type FailureCause,
  type MissionPlan,
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
  // TODO(GEA-12): cap ISRU output by the destination profile (lunar regolith O₂ is far below crew demand).
  const o2ProducedKg = o2Source === 'tanks' ? 0 : consumeKg.o2
  return {
    consumeKg,
    waterRecoveredKg: consumeKg.water * waterRecoveryRate,
    o2ProducedKg,
    o2WaterCostKg: o2Source === 'electrolysis' ? o2ProducedKg * ELECTROLYSIS_WATER_KG_PER_KG_O2 : 0,
    greenhouseFoodKg: greenhouse.enabled ? greenhouse.areaM2 * GREENHOUSE_FOOD_KG_PER_M2_DAY : 0,
  }
}

/**
 * Day index a flight's cargo becomes usable (≤ 0 is clamped to day 0), or null if it never arrives.
 * TODO(GEA-19): use transferFor(destination, launchDate); until then only pre-launched cargo counts.
 */
export function arrivalDay(plan: MissionPlan, flight: CargoFlight): number | null {
  return daysBetween(plan.startDate, flight.launchDate) <= 0 ? 0 : null
}

type Delivery = { day: number; kg: Record<ConsumableKey, number>; spares: number }

function deliveries(plan: MissionPlan): Delivery[] {
  const out: Delivery[] = []
  for (const flight of plan.flights) {
    const day = arrivalDay(plan, flight)
    if (day === null || day >= plan.durationDays) continue
    const spares = COMPONENT_KEYS.reduce((sum, c) => sum + flight.spares[c], 0)
    out.push({ day: Math.max(0, day), kg: flight.consumablesKg, spares })
  }
  return out
}

/** One simulated mission, stepped day by day. Deterministic for a given plan and rng seed. */
export function runOnce(plan: MissionPlan, _rng: Rng): RunResult {
  const days = plan.durationDays
  const rates = dailyRates(plan)
  const arrivals = deliveries(plan)
  // GEA-18 takes components offline; until then everything stays online.
  const online: Record<ComponentKey, boolean> = {
    waterRecycler: true,
    o2Generator: true,
    co2Scrubber: true,
    greenhouse: true,
  }

  const stocks: Record<ResourceKey, number[]> = {
    o2: new Array<number>(days),
    water: new Array<number>(days),
    food: new Array<number>(days),
    spares: new Array<number>(days),
  }
  let o2 = 0
  let water = 0
  let food = 0
  let spares = 0
  let failure: FailureCause | undefined

  for (let day = 0; day < days; day++) {
    if (!failure) {
      for (const a of arrivals) {
        if (a.day !== day) continue
        o2 += a.kg.o2
        water += a.kg.water
        food += a.kg.food
        spares += a.spares
      }

      o2 -= rates.consumeKg.o2
      water -= rates.consumeKg.water
      food -= rates.consumeKg.food

      if (online.waterRecycler) water += rates.waterRecoveredKg
      if (online.o2Generator) {
        o2 += rates.o2ProducedKg
        water -= rates.o2WaterCostKg
      }
      if (online.greenhouse) food += rates.greenhouseFoodKg

      // O₂ first: if several run out the same day, suffocation is what ends the mission.
      const empty: ConsumableKey | undefined =
        o2 < 0 ? 'o2' : water < 0 ? 'water' : food < 0 ? 'food' : undefined
      if (empty) {
        failure = { kind: 'stockout', resource: empty, day }
        o2 = Math.max(0, o2)
        water = Math.max(0, water)
        food = Math.max(0, food)
      }
    }

    stocks.o2[day] = o2
    stocks.water[day] = water
    stocks.food[day] = food
    stocks.spares[day] = spares
  }

  return { survived: !failure, failure, stocks, componentEvents: [] }
}
