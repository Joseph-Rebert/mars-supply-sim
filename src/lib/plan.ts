// Pure MissionPlan edits used by the setup form, so the UI never builds plans by hand.

import { DESTINATION_PROFILES } from './data'
import { daysBetween } from './dates'
import { withDefaultFlights } from './manifest'
import { launchWindows } from './transfers'
import type { CrewMember, Destination, MissionPlan } from './types'

export const CREW_MIN = 2
export const CREW_MAX = 8

/** Mean Gregorian month: 365.25 / 12 days. */
export const DAYS_PER_MONTH = 30.4375

/**
 * Default crew, in the order members are added. The first four match fakePlan().
 * Fictional people; body stats are typical adult values for Crew Diet & Health to refine.
 */
export const CREW_ROSTER: readonly CrewMember[] = [
  {
    id: 'c1',
    name: 'Reyes',
    sex: 'female',
    ageYears: 41,
    massKg: 62,
    activity: 'moderate',
    exerciseMinPerDay: 120,
  },
  {
    id: 'c2',
    name: 'Okafor',
    sex: 'male',
    ageYears: 38,
    massKg: 81,
    activity: 'heavy',
    exerciseMinPerDay: 120,
  },
  {
    id: 'c3',
    name: 'Lindqvist',
    sex: 'female',
    ageYears: 35,
    massKg: 58,
    activity: 'moderate',
    exerciseMinPerDay: 90,
  },
  {
    id: 'c4',
    name: 'Tanaka',
    sex: 'male',
    ageYears: 46,
    massKg: 74,
    activity: 'light',
    exerciseMinPerDay: 90,
  },
  {
    id: 'c5',
    name: 'Haddad',
    sex: 'female',
    ageYears: 39,
    massKg: 66,
    activity: 'moderate',
    exerciseMinPerDay: 90,
  },
  {
    id: 'c6',
    name: 'Novak',
    sex: 'male',
    ageYears: 43,
    massKg: 85,
    activity: 'heavy',
    exerciseMinPerDay: 120,
  },
  {
    id: 'c7',
    name: 'Mensah',
    sex: 'male',
    ageYears: 36,
    massKg: 77,
    activity: 'moderate',
    exerciseMinPerDay: 90,
  },
  {
    id: 'c8',
    name: 'Ibarra',
    sex: 'female',
    ageYears: 44,
    massKg: 60,
    activity: 'light',
    exerciseMinPerDay: 90,
  },
]

export function monthsToDays(months: number): number {
  return Math.round(months * DAYS_PER_MONTH)
}

export function daysToMonths(days: number): number {
  return Math.round(days / DAYS_PER_MONTH)
}

/** Shrinks or grows the crew, keeping existing members and adding from CREW_ROSTER. */
export function withCrewSize(plan: MissionPlan, size: number): MissionPlan {
  const n = Math.min(CREW_MAX, Math.max(CREW_MIN, Math.round(size)))
  const kept = plan.crew.slice(0, n)
  const ids = new Set(kept.map((c) => c.id))
  const added = CREW_ROSTER.filter((c) => !ids.has(c.id)).slice(0, n - kept.length)
  return { ...plan, crew: [...kept, ...added] }
}

/** Switches destination: its vehicle payload, and each flight moved to the default date nearest its landing. */
export function withDestination(plan: MissionPlan, destination: Destination): MissionPlan {
  const { baseVehiclePayloadKg } = DESTINATION_PROFILES[destination]
  return withDefaultFlights({ ...plan, destination, baseVehiclePayloadKg }, plan)
}

/**
 * Mean days between launch windows (best date to best date), from the real transfer table.
 * Null when cargo can launch any day (no windows).
 */
export function resupplyCadenceDays(destination: Destination): number | null {
  const windows = launchWindows(destination)
  if (windows.length < 2) return null
  return (
    daysBetween(windows[0].bestDate, windows[windows.length - 1].bestDate) / (windows.length - 1)
  )
}
