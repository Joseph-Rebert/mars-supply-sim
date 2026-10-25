// Rover fuel: delivered by rocket, burned while the rover drives, never fatal. Deterministic (no failures
// touch it), so one series serves every run and the bands are that series three times.

import { FUEL_KG_PER_ROVER_DAY } from './data'
import { daysBetween } from './dates'
import { transferFor } from './transfers'
import type { MissionPlan } from './types'

/** Fuel burned a day once the rover is on the surface; 0 when no rocket carries the rover. */
export function fuelUsePerDay(plan: MissionPlan): number {
  return plan.flights.some((f) => f.equipment?.includes('rover')) ? FUEL_KG_PER_ROVER_DAY : 0
}

const landingDay = (plan: MissionPlan, launchDate: string) =>
  daysBetween(plan.startDate, transferFor(plan.destination, launchDate).arrivalDate)

/**
 * Fuel at the base each mission day (kg). Rockets add their fuel the day they land (day 0 for anything
 * down before the crew); the rover burns it from the day it lands; the stock never goes below zero.
 */
export function fuelStock(plan: MissionPlan): number[] {
  const days = plan.durationDays
  const added = new Array<number>(days).fill(0)
  for (const f of plan.flights) {
    if (!f.fuelKg) continue
    const day = Math.max(0, landingDay(plan, f.launchDate))
    if (day < days) added[day] += f.fuelKg
  }
  const rover = plan.flights.find((f) => f.equipment?.includes('rover'))
  const roverFrom = rover ? Math.max(0, landingDay(plan, rover.launchDate)) : Infinity
  const use = fuelUsePerDay(plan)
  const out = new Array<number>(days)
  let fuel = 0
  for (let day = 0; day < days; day++) {
    fuel += added[day]
    if (day >= roverFrom) fuel = Math.max(0, fuel - use)
    out[day] = fuel
  }
  return out
}
