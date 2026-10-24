// Cargo flights: launch mass, date-adjusted capacity, and when each one lands.
// Shared by the sim (arrival days), the Monte Carlo result (arrivals, total mass) and the manifest UI.

import { COMPONENTS, DESTINATION_PROFILES, SHIPPING_OVERHEAD_KG_PER_KG } from './data'
import { addDays, daysBetween } from './dates'
import { launchWindows, transferFor } from './transfers'
import {
  COMPONENT_KEYS,
  CONSUMABLE_KEYS,
  type CargoArrival,
  type CargoFlight,
  type IsoDate,
  type MissionPlan,
  type Transfer,
} from './types'

/** Launch mass of one flight: consumables plus their containers, plus spare parts. */
export function flightMassKg(flight: CargoFlight): number {
  const consumables = CONSUMABLE_KEYS.reduce(
    (sum, r) => sum + flight.consumablesKg[r] * (1 + SHIPPING_OVERHEAD_KG_PER_KG[r]),
    0,
  )
  const spares = COMPONENT_KEYS.reduce(
    (sum, c) => sum + flight.spares[c] * COMPONENTS[c].spareMassKg,
    0,
  )
  return consumables + spares
}

export function totalLaunchMassKg(plan: MissionPlan): number {
  return plan.flights.reduce((sum, f) => sum + flightMassKg(f), 0)
}

export type FlightCapacity = {
  flightId: string
  transfer: Transfer
  massKg: number
  /** baseVehiclePayloadKg × the launch date's payload factor. */
  capacityKg: number
  overCapacity: boolean
}

export function flightCapacity(plan: MissionPlan, flight: CargoFlight): FlightCapacity {
  const transfer = transferFor(plan.destination, flight.launchDate)
  const massKg = flightMassKg(flight)
  const capacityKg = plan.baseVehiclePayloadKg * transfer.payloadFactor
  return { flightId: flight.id, transfer, massKg, capacityKg, overCapacity: massKg > capacityKg }
}

/** Flights heavier than their launch date allows. A plan with any of these shouldn't be run. */
export function overCapacityFlights(plan: MissionPlan): FlightCapacity[] {
  return plan.flights.map((f) => flightCapacity(plan, f)).filter((c) => c.overCapacity)
}

/** When each flight lands. arrivalDay ≤ 0 means it's part of the initial stock. */
export function cargoArrivals(plan: MissionPlan): CargoArrival[] {
  return plan.flights.map((f) => {
    const { arrivalDate } = transferFor(plan.destination, f.launchDate)
    return {
      flightId: f.id,
      launchDate: f.launchDate,
      arrivalDate,
      arrivalDay: daysBetween(plan.startDate, arrivalDate),
    }
  })
}

/** A flight's mass bar turns amber at this share of its capacity. */
export const MASS_CAUTION_FRACTION = 0.9

export type MassStatus = 'ok' | 'caution' | 'over'

export function massStatus({ massKg, capacityKg, overCapacity }: FlightCapacity): MassStatus {
  if (overCapacity) return 'over'
  return massKg > 0 && massKg >= capacityKg * MASS_CAUTION_FRACTION ? 'caution' : 'ok'
}

/** Day (from mission start) that cargo launched on `launchDate` lands. */
function arrivalDayFor(plan: MissionPlan, launchDate: IsoDate): number {
  return daysBetween(plan.startDate, transferFor(plan.destination, launchDate).arrivalDate)
}

/**
 * Default launch dates: the initial landing first, then one resupply per slot that lands before the
 * mission ends. Window destinations use each window's best date; fixed ones a regular cadence.
 */
export function defaultLaunchDates(
  plan: Pick<MissionPlan, 'destination' | 'startDate' | 'durationDays'>,
): IsoDate[] {
  const { destination, startDate, durationDays } = plan
  const model = DESTINATION_PROFILES[destination].transfer
  if (model.kind === 'fixed') {
    const dates: IsoDate[] = []
    for (let day = 0; day < durationDays; day += model.resupplyCadenceDays) {
      dates.push(addDays(startDate, day - model.transitDays))
    }
    return dates
  }

  const lands = (launchDate: IsoDate) =>
    daysBetween(startDate, transferFor(destination, launchDate).arrivalDate)
  const best = launchWindows(destination).map((w) => w.bestDate)
  // Initial landing: the last window whose cargo is down before the crew arrives (else the first).
  const initial = best.filter((d) => lands(d) <= 0).at(-1) ?? best[0]
  return [initial, ...best.filter((d) => d > initial && lands(d) < durationDays)]
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

function nextResupplyLabel(flights: readonly CargoFlight[]): string {
  const n = flights.reduce((max, f) => {
    const m = /^Resupply (\d+)$/.exec(f.label)
    return m ? Math.max(max, Number(m[1])) : max
  }, 0)
  return `Resupply ${n + 1}`
}

/**
 * Moves each flight to the default date whose landing day is closest to when it lands under
 * `previous` (e.g. the plan before a destination switch), so landers stay landers and resupplies
 * stay resupplies. A plan with no flights gets one empty flight per default date.
 */
export function withDefaultFlights(plan: MissionPlan, previous: MissionPlan = plan): MissionPlan {
  const dates = defaultLaunchDates(plan)
  if (plan.flights.length === 0) {
    const flights: CargoFlight[] = []
    for (const date of dates) {
      const label = flights.length === 0 ? 'Initial landing' : nextResupplyLabel(flights)
      flights.push(emptyFlight(nextFlightId(flights), label, date))
    }
    return { ...plan, flights }
  }
  const slotDays = dates.map((d) => arrivalDayFor(plan, d))
  const nearest = (day: number) =>
    dates[
      slotDays.reduce(
        (best, d, i) => (Math.abs(d - day) < Math.abs(slotDays[best] - day) ? i : best),
        0,
      )
    ]
  return {
    ...plan,
    flights: plan.flights.map((f) => ({
      ...f,
      launchDate: nearest(arrivalDayFor(previous, f.launchDate)),
    })),
  }
}

/**
 * Adds an empty resupply at the first default slot after the last flight that still lands in time,
 * or alongside the last flight when none is left (a second launch in that window).
 */
export function withFlightAdded(plan: MissionPlan): MissionPlan {
  const lastDate = plan.flights.reduce<IsoDate | undefined>(
    (max, f) => (max === undefined || f.launchDate > max ? f.launchDate : max),
    undefined,
  )
  const slots = defaultLaunchDates(plan)
  const launchDate =
    (lastDate && slots.find((d) => d > lastDate && arrivalDayFor(plan, d) < plan.durationDays)) ??
    lastDate ??
    slots[0]
  const flight = emptyFlight(
    nextFlightId(plan.flights),
    nextResupplyLabel(plan.flights),
    launchDate,
  )
  return { ...plan, flights: [...plan.flights, flight] }
}

/** Removes a flight, but never the last one: a mission always has at least one lander. */
export function withFlightRemoved(plan: MissionPlan, flightId: string): MissionPlan {
  if (plan.flights.length <= 1) return plan
  return { ...plan, flights: plan.flights.filter((f) => f.id !== flightId) }
}

export function withFlightUpdated(
  plan: MissionPlan,
  flightId: string,
  update: (flight: CargoFlight) => CargoFlight,
): MissionPlan {
  return { ...plan, flights: plan.flights.map((f) => (f.id === flightId ? update(f) : f)) }
}
