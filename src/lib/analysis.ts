// Turns a SimResult into answers: what kills the crew, and what to change.
// TODO(GEA-25): weakestLink
// TODO(GEA-30): suggestFix
// TODO(GEA-33): plan comparison
// TODO(GEA-26): ship-vs-make (stretch)

import { CO2_SCRUBBER_GRACE_DAYS, COMPONENTS } from './data'
import type { ComponentKey, ConsumableKey, FailureCause } from './types'

const RESOURCE_NAME: Record<ConsumableKey, string> = {
  o2: 'O₂',
  water: 'Water',
  food: 'Food',
}

/** Lower-cases a label mid-sentence ("Water recycler" → "water recycler") but keeps "O₂ generator". */
function inSentence(label: string): string {
  return /^[A-Z][a-z]/.test(label) ? label[0].toLowerCase() + label.slice(1) : label
}

/** One sentence saying what ended a run and why, e.g. for the weakest-link callout. */
export function describeFailure(cause: FailureCause): string {
  switch (cause.kind) {
    case 'stockout': {
      const what = `${RESOURCE_NAME[cause.resource]} ran out on day ${cause.day}`
      if (!cause.offlineComponent) return what
      const component = inSentence(COMPONENTS[cause.offlineComponent].label)
      const state = cause.awaitingSpare ? 'offline with no spares' : 'offline for repair'
      return `${what} because the ${component} was ${state}`
    }
    case 'systemDown': {
      const component = COMPONENTS[cause.component].label
      return `${component} offline with no spares for more than ${CO2_SCRUBBER_GRACE_DAYS} days; CO₂ built up on day ${cause.day}`
    }
    case 'crewUnfit':
      return `Crew member ${cause.crewId} became unfit on day ${cause.day}${cause.driver ? ` (${cause.driver})` : ''}`
  }
}

/** What a failure is "about", for grouping: the offline component if known, else the resource. */
export type FailureGroup = {
  /** e.g. 'water/waterRecycler', 'o2', 'systemDown/co2Scrubber', 'crewUnfit' */
  key: string
  resource?: ConsumableKey
  component?: ComponentKey
  count: number
  /** Failure days, ascending, for the distribution of when it happens. */
  days: number[]
}

function groupOf(cause: FailureCause): Omit<FailureGroup, 'count' | 'days'> {
  switch (cause.kind) {
    case 'stockout':
      return cause.offlineComponent
        ? {
            key: `${cause.resource}/${cause.offlineComponent}`,
            resource: cause.resource,
            component: cause.offlineComponent,
          }
        : { key: cause.resource, resource: cause.resource }
    case 'systemDown':
      return { key: `systemDown/${cause.component}`, component: cause.component }
    case 'crewUnfit':
      return { key: 'crewUnfit' }
  }
}

/** Failure-cause histogram: one group per cause, most common first. */
export function failureHistogram(failures: readonly FailureCause[]): FailureGroup[] {
  const groups = new Map<string, FailureGroup>()
  for (const cause of failures) {
    const g = groupOf(cause)
    const group = groups.get(g.key) ?? { ...g, count: 0, days: [] }
    group.count++
    group.days.push(cause.day)
    groups.set(g.key, group)
  }
  for (const g of groups.values()) g.days.sort((x, y) => x - y)
  return [...groups.values()].sort((x, y) => y.count - x.count || x.key.localeCompare(y.key))
}
