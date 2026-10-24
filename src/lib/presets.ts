// Demo scenarios for the pitch: one click loads a plan that always gives the same numbers, because
// every run uses DEFAULT_RUN_OPTIONS (1,000 runs, seed 1). presets.test.ts pins the survival %, so a
// model change that would make the slides wrong fails loudly.

import { DESTINATION_PROFILES } from './data'
import { addDays } from './dates'
import { fakePlan } from './fake'
import { withDestination } from './plan'
import { COMPONENT_KEYS, CONSUMABLE_KEYS, type CargoFlight, type MissionPlan } from './types'

export type PresetId = 'draft' | 'revised' | 'moon'

export type Preset = {
  id: PresetId
  label: string
  /** One line for the dropdown's title / the presenter. */
  summary: string
  plan: () => MissionPlan
}

/** The "reasonable-looking" Mars plan: ~57%, water recycler spares run out around month 22. */
function draftPlan(): MissionPlan {
  return fakePlan()
}

/**
 * Draft plan with GEA-30's suggested fix applied: the 2 recycler spares on Resupply 1 (landing after
 * the failure) ship in the Dec 2028 window on Cargo lander 1 instead, plus 3 more. presets.test.ts
 * checks this equals suggestFix(draft).
 */
function revisedPlan(): MissionPlan {
  const draft = draftPlan()
  return {
    ...draft,
    name: 'Ares Base: Revised',
    flights: draft.flights.map((f) => {
      if (f.id === 'f1')
        return { ...f, spares: { ...f.spares, waterRecycler: f.spares.waterRecycler + 5 } }
      if (f.id === 'f3') return { ...f, spares: { ...f.spares, waterRecycler: 0 } }
      return f
    }),
  }
}

/** Splits `n` items over `parts` as evenly as possible, earliest parts first. */
function share(n: number, parts: number, i: number): number {
  return Math.floor(n / parts) + (i < n % parts ? 1 : 0)
}

/**
 * The draft's cargo on the Moon, using the Moon's short cadence: the landers stay, and the one
 * resupply (which on Mars waits ~26 months for a window) is split over flights every
 * MOON_RESUPPLY_CADENCE_DAYS. Same cargo, same launch mass.
 */
function moonPlan(): MissionPlan {
  const moon = withDestination(draftPlan(), 'moon')
  const model = DESTINATION_PROFILES.moon.transfer
  if (model.kind !== 'fixed') throw new Error('Moon preset expects a fixed-transfer destination')
  const [lander1, lander2, ...resupplies] = moon.flights
  const total = (pick: (f: CargoFlight) => number) => resupplies.reduce((s, f) => s + pick(f), 0)

  // One flight landing every cadence step after day 0, while the mission is still running.
  const count = Math.floor((moon.durationDays - 1) / model.resupplyCadenceDays)
  const flights = Array.from({ length: count }, (_, i): CargoFlight => {
    const consumablesKg = {} as CargoFlight['consumablesKg']
    for (const r of CONSUMABLE_KEYS) consumablesKg[r] = total((f) => f.consumablesKg[r]) / count
    const spares = {} as CargoFlight['spares']
    for (const c of COMPONENT_KEYS)
      spares[c] = share(
        total((f) => f.spares[c]),
        count,
        i,
      )
    return {
      id: `f${3 + i}`,
      label: `Resupply ${i + 1}`,
      launchDate: addDays(moon.startDate, model.resupplyCadenceDays * (i + 1) - model.transitDays),
      consumablesKg,
      spares,
    }
  })
  return { ...moon, name: 'Same plan on the Moon', flights: [lander1, lander2, ...flights] }
}

export const PRESETS: readonly Preset[] = [
  {
    id: 'draft',
    label: 'Ares Base: Draft Plan',
    summary: 'Looks reasonable on paper; water recycler spares run out.',
    plan: draftPlan,
  },
  {
    id: 'revised',
    label: 'Ares Base: Revised',
    summary: 'The suggested fix applied: recycler spares ship in the earlier window.',
    plan: revisedPlan,
  },
  {
    id: 'moon',
    label: 'Same plan on the Moon',
    summary: 'Same cargo, but a resupply every 6 months instead of every 26.',
    plan: moonPlan,
  },
]

export function presetById(id: PresetId): Preset {
  const preset = PRESETS.find((p) => p.id === id)
  if (!preset) throw new Error(`Unknown preset ${id}`)
  return preset
}
