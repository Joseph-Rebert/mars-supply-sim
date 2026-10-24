// Cargo flights: launch mass, date-adjusted capacity, and when each one lands.
// Shared by the sim (arrival days), the Monte Carlo result (arrivals, total mass) and the manifest UI.

import { COMPONENTS, SHIPPING_OVERHEAD_KG_PER_KG } from './data'
import { daysBetween } from './dates'
import { transferFor } from './transfers'
import {
  COMPONENT_KEYS,
  CONSUMABLE_KEYS,
  type CargoArrival,
  type CargoFlight,
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
