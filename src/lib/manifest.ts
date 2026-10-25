// Cargo flights: launch mass, date-adjusted capacity, and when each one lands.
// Shared by the sim (arrival days), the Monte Carlo result (arrivals, total mass) and the manifest UI.

import {
  COMPONENTS,
  DESTINATION_PROFILES,
  EQUIPMENT,
  FUEL_KG_PER_ROVER_DAY,
  FUEL_TANK_KG_PER_KG,
  SHIPPING_OVERHEAD_KG_PER_KG,
  VITAMIN_C_SUPPLEMENT_KG_PER_MG,
  VITAMIN_C_SUPPLEMENT_MG_PER_DAY,
} from './data'
import { addDays, daysBetween } from './dates'
import { launchWindows, transferFor } from './transfers'
import {
  COMPONENT_KEYS,
  CONSUMABLE_KEYS,
  EQUIPMENT_KEYS,
  type CargoArrival,
  type CargoFlight,
  type ConsumableKey,
  type EquipmentKey,
  type IsoDate,
  type MissionPlan,
  type Transfer,
} from './types'

/** Launch mass of the base-building equipment on one flight. */
export function equipmentMassKg(flight: CargoFlight): number {
  return (flight.equipment ?? []).reduce((sum, k) => sum + EQUIPMENT[k].massKg, 0)
}

/** Launch mass of one flight: consumables plus their containers, spare parts, and equipment. */
export function flightMassKg(flight: CargoFlight): number {
  const consumables = CONSUMABLE_KEYS.reduce(
    (sum, r) => sum + flight.consumablesKg[r] * (1 + SHIPPING_OVERHEAD_KG_PER_KG[r]),
    0,
  )
  const spares = COMPONENT_KEYS.reduce(
    (sum, c) => sum + flight.spares[c] * COMPONENTS[c].spareMassKg,
    0,
  )
  return (
    consumables +
    spares +
    equipmentMassKg(flight) +
    (flight.fuelKg ?? 0) * (1 + FUEL_TANK_KG_PER_KG)
  )
}

/**
 * Vitamin C tablets for the whole crew and mission (0 when the plan doesn't take them). They ride on the
 * plan's first flight, the initial landing, and are available from day 0.
 */
export function supplementMassKg(plan: MissionPlan): number {
  if (!plan.lifeSupport.vitaminCSupplement) return 0
  return (
    plan.crew.length *
    plan.durationDays *
    VITAMIN_C_SUPPLEMENT_MG_PER_DAY *
    VITAMIN_C_SUPPLEMENT_KG_PER_MG
  )
}

/** Launch mass of a flight within its plan: its cargo, plus the supplements if it's the first flight. */
function planFlightMassKg(plan: MissionPlan, flight: CargoFlight): number {
  return flightMassKg(flight) + (flight === plan.flights[0] ? supplementMassKg(plan) : 0)
}

export function totalLaunchMassKg(plan: MissionPlan): number {
  return plan.flights.reduce((sum, f) => sum + flightMassKg(f), 0) + supplementMassKg(plan)
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
  const massKg = planFlightMassKg(plan, flight)
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

export type CargoGroup = ConsumableKey | 'spares' | 'fuel' | 'equipment'

/** One line of a rocket's manifest, in words a person would use. */
export type CargoLine = {
  group: CargoGroup
  /** e.g. "Water", "Spare parts", "Habitat module". */
  label: string
  /** What the crew gets, e.g. "4,700 kg" or "11 parts". */
  amount: string
  /** For spare parts: which machines they're for. */
  detail?: string
  /** Room it takes on the rocket, packaging included. */
  launchKg: number
}

const SUPPLY_LABEL: Record<ConsumableKey, string> = { water: 'Water', food: 'Food', o2: 'Oxygen' }
const kgText = (kg: number) => `${Math.round(kg).toLocaleString('en-US')} kg`

/** What's on a rocket, largest first by room taken: supplies, spare parts, then each equipment item. */
export function flightContents(flight: CargoFlight): CargoLine[] {
  const lines: CargoLine[] = []
  for (const r of CONSUMABLE_KEYS) {
    const kg = flight.consumablesKg[r]
    if (kg <= 0) continue
    lines.push({
      group: r,
      label: SUPPLY_LABEL[r],
      amount: kgText(kg),
      launchKg: kg * (1 + SHIPPING_OVERHEAD_KG_PER_KG[r]),
    })
  }
  const parts = COMPONENT_KEYS.filter((c) => flight.spares[c] > 0)
  const count = parts.reduce((n, c) => n + flight.spares[c], 0)
  if (count > 0) {
    lines.push({
      group: 'spares',
      label: 'Spare parts',
      amount: `${count} part${count === 1 ? '' : 's'}`,
      detail: parts
        .map((c) => `${flight.spares[c]} for the ${COMPONENTS[c].label.toLowerCase()}`)
        .join(', '),
      launchKg: parts.reduce((kg, c) => kg + flight.spares[c] * COMPONENTS[c].spareMassKg, 0),
    })
  }
  if (flight.fuelKg) {
    lines.push({
      group: 'fuel',
      label: 'Rover fuel',
      amount: kgText(flight.fuelKg),
      launchKg: flight.fuelKg * (1 + FUEL_TANK_KG_PER_KG),
    })
  }
  lines.sort((a, b) => b.launchKg - a.launchKg)
  for (const k of flight.equipment ?? []) {
    lines.push({
      group: 'equipment',
      label: EQUIPMENT[k].label,
      amount: kgText(EQUIPMENT[k].massKg),
      launchKg: EQUIPMENT[k].massKg,
    })
  }
  return lines
}

/** Puts an equipment item on one flight (taking it off any other), or off every flight with null. */
export function withEquipmentOn(
  plan: MissionPlan,
  key: EquipmentKey,
  flightId: string | null,
): MissionPlan {
  return {
    ...plan,
    flights: plan.flights.map((f) => {
      const rest = (f.equipment ?? []).filter((k) => k !== key)
      return { ...f, equipment: f.id === flightId ? [...rest, key] : rest }
    }),
  }
}

// Fuel packed for the rover beyond the mission's need, so a late landing or a longer stay doesn't
// strand it: a planning margin, not a sourced figure.
const FUEL_MARGIN = 0.05
const FUEL_STEP_KG = 50

/**
 * Tops a plan up with what keeps the base running but doesn't keep the crew alive: any equipment not
 * yet on a rocket, and enough rover fuel for the whole stay. They go on one extra "Base cargo" rocket
 * launching with the first flight, so they land before the crew. Unchanged if nothing is missing.
 * (The cargo optimizer only packs life support; this fills in the rest.)
 */
export function withBaseCargo(plan: MissionPlan): MissionPlan {
  const missing = EQUIPMENT_KEYS.filter((k) => !plan.flights.some((f) => f.equipment?.includes(k)))
  const roverOn =
    missing.includes('rover') || plan.flights.some((f) => f.equipment?.includes('rover'))
  const need = roverOn ? FUEL_KG_PER_ROVER_DAY * plan.durationDays * (1 + FUEL_MARGIN) : 0
  const have = plan.flights.reduce((s, f) => s + (f.fuelKg ?? 0), 0)
  const fuelKg = Math.max(0, Math.ceil((need - have) / FUEL_STEP_KG) * FUEL_STEP_KG)
  if (missing.length === 0 && fuelKg === 0) return plan
  const first = plan.flights.reduce<IsoDate | undefined>(
    (min, f) => (min === undefined || f.launchDate < min ? f.launchDate : min),
    undefined,
  )
  const flight: CargoFlight = {
    ...emptyFlight(nextFlightId(plan.flights), 'Base cargo', first ?? plan.startDate),
    equipment: missing,
    fuelKg,
  }
  return { ...plan, flights: [...plan.flights, flight] }
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
