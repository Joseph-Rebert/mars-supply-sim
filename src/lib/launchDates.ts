// Choosing when each cargo flight launches: nearest best date, the ship-cost strip, and whether
// the plan can run at the chosen dates. Pure, so the manifest UI only renders what this returns.

import { addDays, daysBetween } from './dates'
import { flightCapacity } from './manifest'
import { launchDateRange, launchWindows, transferFor } from './transfers'
import type { Destination, IsoDate, MissionPlan } from './types'

/** Keeps a date inside the destination's transfer table (unchanged when any date works). */
export function clampLaunchDate(destination: Destination, date: IsoDate): IsoDate {
  const range = launchDateRange(destination)
  if (!range) return date
  if (date < range.first) return range.first
  if (date > range.last) return range.last
  return date
}

/** Best date of the window closest to `date`; the date itself when there are no windows (Moon). */
export function nearestBestDate(destination: Destination, date: IsoDate): IsoDate {
  const windows = launchWindows(destination)
  if (windows.length === 0) return date
  let best = windows[0].bestDate
  for (const w of windows) {
    if (Math.abs(daysBetween(date, w.bestDate)) < Math.abs(daysBetween(date, best)))
      best = w.bestDate
  }
  return best
}

export type StripPoint = { date: IsoDate; payloadFactor: number }

/** Strip spans ~30 months: 9 before the selected date and 21 after (GEA-41). */
const STRIP_DAYS_BEFORE = 274
const STRIP_DAYS_AFTER = 639

/** Payload factor for every launch date around `date`, clipped to the destination's table. */
export function shipCostStrip(destination: Destination, date: IsoDate): StripPoint[] {
  const first = clampLaunchDate(destination, addDays(date, -STRIP_DAYS_BEFORE))
  const last = clampLaunchDate(destination, addDays(date, STRIP_DAYS_AFTER))
  const points: StripPoint[] = []
  for (let d = first; d <= last; d = addDays(d, 1)) {
    points.push({ date: d, payloadFactor: transferFor(destination, d).payloadFactor })
  }
  return points
}

export function withFlightLaunchDate(
  plan: MissionPlan,
  flightId: string,
  launchDate: IsoDate,
): MissionPlan {
  return {
    ...plan,
    flights: plan.flights.map((f) => (f.id === flightId ? { ...f, launchDate } : f)),
  }
}

/** Every flight moved to the best date of its nearest window. */
export function withFlightsAtBestDates(plan: MissionPlan): MissionPlan {
  return {
    ...plan,
    flights: plan.flights.map((f) => ({
      ...f,
      launchDate: nearestBestDate(plan.destination, f.launchDate),
    })),
  }
}

/** Why the plan can't run at its chosen launch dates, or undefined if it can. */
export function runBlockedReason(plan: MissionPlan): string | undefined {
  const range = launchDateRange(plan.destination)
  const outside =
    range && plan.flights.find((f) => f.launchDate < range.first || f.launchDate > range.last)
  if (outside) {
    return `${outside.label} launches ${outside.launchDate}, outside the ${range.first} to ${range.last} transfer table.`
  }
  const over = plan.flights
    .map((f) => ({ flight: f, cap: flightCapacity(plan, f) }))
    .filter(({ cap }) => cap.overCapacity)
  if (over.length === 0) return undefined
  const names = over.map(({ flight }) => flight.label).join(', ')
  return `Over its launch-date capacity: ${names}. Move the date or lighten the load.`
}
