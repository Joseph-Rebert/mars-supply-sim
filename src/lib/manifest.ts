// Cargo manifest math: launch mass per flight, its date-adjusted limit, and default flight dates.
// Pure, so the manifest editor (GEA-16) and the runner (GEA-22) agree on every kilogram.

import { COMPONENTS, DESTINATION_PROFILES, SHIPPING_OVERHEAD_KG_PER_KG } from './data'
import { addDays, daysBetween } from './dates'
import { launchDateRange, launchWindows, transferFor } from './transfers'
import {
  COMPONENT_KEYS,
  CONSUMABLE_KEYS,
  type CargoFlight,
  type ComponentKey,
  type ConsumableKey,
  type IsoDate,
  type MissionPlan,
  type Transfer,
} from './types'

/** A flight turns amber at this share of its limit. */
export const MASS_CAUTION_FRACTION = 0.9

export type BudgetStatus = 'ok' | 'caution' | 'over'

/** Launch mass of `kg` of a consumable, including its tank or packaging. */
export function consumableLaunchKg(key: ConsumableKey, kg: number): number {
  return kg * (1 + SHIPPING_OVERHEAD_KG_PER_KG[key])
}

export function spareLaunchKg(component: ComponentKey, count: number): number {
  return count * COMPONENTS[component].spareMassKg
}

export function flightMassKg(flight: CargoFlight): number {
  let kg = 0
  for (const r of CONSUMABLE_KEYS) kg += consumableLaunchKg(r, flight.consumablesKg[r])
  for (const c of COMPONENT_KEYS) kg += spareLaunchKg(c, flight.spares[c])
  return kg
}

export function planLaunchMassKg(plan: MissionPlan): number {
  return plan.flights.reduce((sum, f) => sum + flightMassKg(f), 0)
}

/** Transfer for a launch date, or undefined when the date is outside the destination's table. */
export function flightTransfer(plan: MissionPlan, launchDate: IsoDate): Transfer | undefined {
  const range = launchDateRange(plan.destination)
  if (range && (launchDate < range.first || launchDate > range.last)) return undefined
  return transferFor(plan.destination, launchDate)
}

export function budgetStatus(massKg: number, limitKg: number): BudgetStatus {
  if (massKg > limitKg) return 'over'
  if (massKg >= limitKg * MASS_CAUTION_FRACTION && massKg > 0) return 'caution'
  return 'ok'
}

export type FlightBudget = {
  flightId: string
  massKg: number
  /** baseVehiclePayloadKg × the launch date's payload factor; 0 when no transfer exists. */
  limitKg: number
  transfer?: Transfer
  status: BudgetStatus
}

export function flightBudget(plan: MissionPlan, flight: CargoFlight): FlightBudget {
  const transfer = flightTransfer(plan, flight.launchDate)
  const massKg = flightMassKg(flight)
  const limitKg = transfer ? plan.baseVehiclePayloadKg * transfer.payloadFactor : 0
  return { flightId: flight.id, massKg, limitKg, transfer, status: budgetStatus(massKg, limitKg) }
}

/** Why the plan can't be run, or null when every flight is within its limit. */
export function manifestBlocker(plan: MissionPlan): string | null {
  for (const flight of plan.flights) {
    const b = flightBudget(plan, flight)
    if (!b.transfer) return `${flight.label}: no transfer data for ${flight.launchDate}`
    if (b.status === 'over') {
      const overKg = Math.ceil(b.massKg - b.limitKg)
      return `${flight.label} is ${overKg.toLocaleString('en-US')} kg over its launch limit`
    }
  }
  return null
}

/**
 * Default launch dates: the initial landing first, then one resupply per slot that arrives before
 * the mission ends. Table destinations use each window's best date; fixed ones a regular cadence.
 */
export function defaultLaunchDates(
  plan: Pick<MissionPlan, 'destination' | 'startDate' | 'durationDays'>,
): IsoDate[] {
  const { destination, startDate, durationDays } = plan
  const arrivesBy = (launchDate: IsoDate) =>
    daysBetween(startDate, transferFor(destination, launchDate).arrivalDate)

  const model = DESTINATION_PROFILES[destination].transfer
  if (model.kind === 'fixed') {
    const dates: IsoDate[] = []
    for (let day = 0; day < durationDays; day += model.resupplyCadenceDays) {
      dates.push(addDays(startDate, day - model.transitDays))
    }
    return dates
  }

  const best = launchWindows(destination).map((w) => w.bestDate)
  // Initial landing: the last window whose cargo is down before the crew arrives (else the first).
  const initial = best.filter((d) => arrivesBy(d) <= 0).at(-1) ?? best[0]
  const resupply = best.filter((d) => d > initial && arrivesBy(d) < durationDays)
  return [initial, ...resupply]
}

export function emptyFlight(id: string, label: string, launchDate: IsoDate): CargoFlight {
  return {
    id,
    label,
    launchDate,
    consumablesKg: { o2: 0, water: 0, food: 0 },
    spares: { waterRecycler: 0, o2Generator: 0, co2Scrubber: 0, greenhouse: 0 },
  }
}

function nextFlightId(flights: readonly CargoFlight[]): string {
  const n = flights.reduce((max, f) => Math.max(max, Number(f.id.replace(/\D/g, '')) || 0), 0)
  return `f${n + 1}`
}

const flightLabel = (index: number) => (index === 0 ? 'Initial landing' : `Resupply ${index}`)

/**
 * Snaps flights onto the default dates, keeping each flight's cargo in order. Missing slots get an
 * empty flight; flights beyond the last slot share its date (a second launch in that window).
 */
export function withDefaultFlights(plan: MissionPlan): MissionPlan {
  const dates = defaultLaunchDates(plan)
  const flights: CargoFlight[] = []
  for (let i = 0; i < Math.max(dates.length, plan.flights.length); i++) {
    const launchDate = dates[Math.min(i, dates.length - 1)]
    const existing = plan.flights[i]
    flights.push(
      existing
        ? { ...existing, launchDate }
        : emptyFlight(nextFlightId([...plan.flights, ...flights]), flightLabel(i), launchDate),
    )
  }
  return { ...plan, flights }
}

/** Adds an empty flight launching alongside the last one (GEA-41 lets the planner move it). */
export function withFlightAdded(plan: MissionPlan): MissionPlan {
  const last = plan.flights.at(-1)
  const launchDate = last?.launchDate ?? defaultLaunchDates(plan)[0]
  const flight = emptyFlight(
    nextFlightId(plan.flights),
    flightLabel(plan.flights.length),
    launchDate,
  )
  return { ...plan, flights: [...plan.flights, flight] }
}

/** Removes a resupply flight. The initial landing (first flight) always stays. */
export function withFlightRemoved(plan: MissionPlan, flightId: string): MissionPlan {
  if (plan.flights[0]?.id === flightId) return plan
  return { ...plan, flights: plan.flights.filter((f) => f.id !== flightId) }
}

export function withFlightUpdated(
  plan: MissionPlan,
  flightId: string,
  update: (flight: CargoFlight) => CargoFlight,
): MissionPlan {
  return { ...plan, flights: plan.flights.map((f) => (f.id === flightId ? update(f) : f)) }
}
