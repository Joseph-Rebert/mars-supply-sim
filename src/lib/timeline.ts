// Mission-day overlays for the results timeline: why resupply arrives when it does.
// Everything is indexed by mission day (0 = plan.startDate) so it lines up with the resource bands.

import horizons from '../cache/horizons-earth-mars.json'
import { DESTINATION_PROFILES } from './data'
import { addDays, daysBetween } from './dates'
import { launchWindows, transferFor } from './transfers'
import type { MissionPlan, Transfer } from './types'

const EARTH_MARS_KM_BY_DATE = new Map(horizons.days.map((d) => [d.date, d.distanceKm]))

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** 'YYYY-MM-DD' → 'Jan 2031'. */
export function monthLabel(date: string): string {
  const [y, m] = date.split('-')
  return `${MONTHS[Number(m) - 1]} ${y}`
}

export type WindowBand = { startDay: number; endDay: number; bestDay: number; label: string }
export type Transit = { flightId: string; launchDay: number; arrivalDay: number }

export type TimelineOverlays = {
  /** Earth–Mars distance per mission day in millions of km; null when the destination has no
   *  date-dependent geometry (Moon) or a day falls outside the cached ephemeris. */
  distanceMkm: (number | null)[] | null
  /** Launch windows overlapping the mission, clipped to [0, durationDays − 1]. */
  windows: WindowBand[]
  /** Flights that land mid-mission (initial-stock flights are left out). */
  transits: Transit[]
}

export function timelineOverlays(plan: MissionPlan): TimelineOverlays {
  const last = plan.durationDays - 1
  const dayOf = (date: string) => daysBetween(plan.startDate, date)
  const hasGeometry = DESTINATION_PROFILES[plan.destination].transfer.kind === 'table'

  const distanceMkm = hasGeometry
    ? Array.from({ length: plan.durationDays }, (_, d) => {
        const km = EARTH_MARS_KM_BY_DATE.get(addDays(plan.startDate, d))
        return km === undefined ? null : km / 1e6
      })
    : null

  const windows = launchWindows(plan.destination)
    .map((w) => ({
      startDay: Math.max(0, dayOf(w.open)),
      endDay: Math.min(last, dayOf(w.close)),
      bestDay: dayOf(w.bestDate),
      label: `Window · ${monthLabel(w.bestDate)}`,
    }))
    .filter((w) => w.startDay <= w.endDay)

  const transits = plan.flights
    .map((f) => {
      const { arrivalDate } = transferFor(plan.destination, f.launchDate)
      return { flightId: f.id, launchDay: dayOf(f.launchDate), arrivalDay: dayOf(arrivalDate) }
    })
    .filter((t) => t.arrivalDay > 0 && t.arrivalDay <= last)

  return { distanceMkm, windows, transits }
}

/** Day and distance (M km) of the minimum of a distance series, ignoring gaps. */
export function closestApproach(
  distanceMkm: readonly (number | null)[],
): { day: number; mkm: number } | null {
  let best: { day: number; mkm: number } | null = null
  distanceMkm.forEach((mkm, day) => {
    if (mkm !== null && (best === null || mkm < best.mkm)) best = { day, mkm }
  })
  return best
}

/** What launching cargo on this mission day would cost, or null outside the transfer table. */
export function transferOnDay(plan: MissionPlan, day: number): Transfer | null {
  try {
    return transferFor(plan.destination, addDays(plan.startDate, day))
  } catch (e) {
    if (e instanceof RangeError) return null
    throw e
  }
}
