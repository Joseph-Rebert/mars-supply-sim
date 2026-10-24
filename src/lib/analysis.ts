// Turns a SimResult into answers: what kills the crew, and what to change.
// TODO(GEA-30): suggestFix
// TODO(GEA-33): plan comparison
// TODO(GEA-26): ship-vs-make (stretch)

import { CO2_SCRUBBER_GRACE_DAYS, COMPONENTS } from './data'
import { DAYS_PER_MONTH } from './plan'
import { quantile } from './sim'
import type { ComponentKey, ConsumableKey, FailureCause, SimResult } from './types'

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

// ---------- Weakest link (GEA-25) ----------

/** At or above this survival rate there's nothing worth fixing. */
export const ALL_CLEAR_SURVIVAL_RATE = 0.99

const RESOURCE_IN_SENTENCE: Record<ConsumableKey, string> = {
  o2: 'O₂',
  water: 'water',
  food: 'food',
}

export type WeakestLinkCause = {
  /** Same key as failureHistogram, e.g. 'water/waterRecycler'. */
  key: string
  resource?: ConsumableKey
  component?: ComponentKey
  /** Share of all runs that ended this way, 0–1. */
  share: number
  count: number
  medianDay: number
  /** Mission month of the median failure day; day 0 is month 1. */
  month: number
  /** Short label for the breakdown list, e.g. "Water · water recycler out of spares". */
  label: string
  /** The headline, e.g. "In 31% of runs, water runs out around month 19 because …". */
  sentence: string
}

export type WeakestLink =
  | { status: 'allClear'; survivalRate: number; sentence: string }
  | {
      status: 'atRisk'
      survivalRate: number
      /** The most common cause; same as causes[0]. */
      top: WeakestLinkCause
      /** Up to three most common causes. */
      causes: WeakestLinkCause[]
      sentence: string
    }

const pct = (x: number) => `${Math.round(x * 100)}%`

/** Mission month containing `day`, where day 0 starts month 1. */
export function missionMonth(day: number): number {
  return Math.floor(day / DAYS_PER_MONTH) + 1
}

function causeText(
  group: FailureGroup,
  awaitingSpare: boolean,
  month: number,
): { what: string; label: string } {
  const component = group.component && inSentence(COMPONENTS[group.component].label)
  const why = awaitingSpare ? 'has no spares left' : 'is down for repair'
  if (group.resource) {
    const resource = RESOURCE_IN_SENTENCE[group.resource]
    const runsOut = `${resource} runs out around month ${month}`
    return component
      ? {
          what: `${runsOut} because the ${component} ${why}`,
          label: `${RESOURCE_NAME[group.resource]} · ${component} ${awaitingSpare ? 'out of spares' : 'under repair'}`,
        }
      : {
          what: `${runsOut} because too little was shipped`,
          label: `${RESOURCE_NAME[group.resource]} · not enough shipped`,
        }
  }
  if (component) {
    return {
      what: `CO₂ builds up around month ${month} because the ${component} ${why}`,
      label: `CO₂ · ${component} out of spares`,
    }
  }
  return {
    what: `a crew member becomes medically unfit around month ${month}`,
    label: 'Crew medically unfit',
  }
}

/**
 * Why the crew dies, in one sentence: the most common root cause across failed runs (the offline
 * component when one was involved), its share of runs and median failure month, plus the top three.
 */
export function weakestLink(result: SimResult): WeakestLink {
  const { survivalRate, runs } = result
  if (survivalRate >= ALL_CLEAR_SURVIVAL_RATE || result.failures.length === 0) {
    return {
      status: 'allClear',
      survivalRate,
      sentence: `All clear: the crew survives in ${(survivalRate * 100).toFixed(1)}% of runs.`,
    }
  }

  // Within a group, say "no spares left" only when that's how most of those runs failed.
  const awaiting = new Map<string, number>()
  for (const cause of result.failures) {
    if (cause.kind === 'stockout' && cause.awaitingSpare) {
      const key = groupOf(cause).key
      awaiting.set(key, (awaiting.get(key) ?? 0) + 1)
    }
  }

  const causes = failureHistogram(result.failures)
    .slice(0, 3)
    .map((g): WeakestLinkCause => {
      const medianDay = Math.round(quantile(g.days, 0.5))
      const month = missionMonth(medianDay)
      // systemDown only happens with no spares in stock; stockouts say which state they were in.
      const awaitingSpare = g.resource ? (awaiting.get(g.key) ?? 0) * 2 > g.count : true
      const { what, label } = causeText(g, awaitingSpare, month)
      const share = g.count / runs
      return {
        key: g.key,
        resource: g.resource,
        component: g.component,
        share,
        count: g.count,
        medianDay,
        month,
        label,
        sentence: `In ${pct(share)} of runs, ${what}`,
      }
    })

  return { status: 'atRisk', survivalRate, top: causes[0], causes, sentence: causes[0].sentence }
}
