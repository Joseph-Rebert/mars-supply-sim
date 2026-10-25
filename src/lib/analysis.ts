// Turns a SimResult into answers: what kills the crew, and what to change.
// TODO(GEA-33): plan comparison
// TODO(GEA-26): ship-vs-make (stretch)

import {
  BODY_MASS_LOSS_UNFIT_PCT,
  CO2_SCRUBBER_GRACE_DAYS,
  COMPONENTS,
  EXERCISE_FULL_COUNTERMEASURE_MIN,
  SHIPPING_OVERHEAD_KG_PER_KG,
  VITAMIN_C_MG_PER_DAY,
} from './data'
import { addDays, daysBetween } from './dates'
import {
  emptyFlight,
  flightCapacity,
  flightMassKg,
  overCapacityFlights,
  supplementMassKg,
  totalLaunchMassKg,
} from './manifest'
import { DAYS_PER_MONTH } from './plan'
import { mulberry32 } from './rng'
import { arrivalDay, dailyRates, quantile, runMission, runOnce } from './sim'
import { launchDateRange, transferFor } from './transfers'
import {
  COMPONENT_KEYS,
  CONSUMABLE_KEYS,
  type CargoFlight,
  type ComponentKey,
  type ComponentSpec,
  type ConsumableKey,
  type FailureCause,
  type IsoDate,
  type MissionPlan,
  type SimResult,
} from './types'

const RESOURCE_NAME: Record<ConsumableKey, string> = {
  o2: 'Oxygen',
  water: 'Water',
  food: 'Food',
}

/** Lower-cases a label mid-sentence ("Water recycler" → "water recycler") but keeps names like "CO₂". */
function inSentence(label: string): string {
  return /^[A-Z][a-z]/.test(label) ? label[0].toLowerCase() + label.slice(1) : label
}

/** Plain-language reasons for 'crewUnfit' drivers (GEA-23). */
const UNFIT_DRIVER_TEXT: Record<string, string> = {
  boneLoss: 'their bones weakened to twice NASA’s safe limit',
  scurvy: 'they got scurvy from too little vitamin C',
  bodyMass: 'they lost more than 15% of their body weight',
}

/** One sentence saying what ended a run and why, e.g. for the weakest-link callout. */
export function describeFailure(cause: FailureCause): string {
  switch (cause.kind) {
    case 'stockout': {
      const what = `${RESOURCE_NAME[cause.resource]} ran out on day ${cause.day}`
      if (!cause.offlineComponent) return what
      const component = inSentence(COMPONENTS[cause.offlineComponent].label)
      const state = cause.awaitingSpare
        ? 'broken with no spare parts left'
        : 'broken and still being repaired'
      return `${what} because the ${component} was ${state}`
    }
    case 'systemDown': {
      const component = COMPONENTS[cause.component].label
      return `${component} broken with no spare parts for more than ${CO2_SCRUBBER_GRACE_DAYS} days, so CO₂ built up on day ${cause.day}`
    }
    case 'crewUnfit': {
      const why = cause.driver ? UNFIT_DRIVER_TEXT[cause.driver] : undefined
      return `Crew member ${cause.crewId} got too sick to work on day ${cause.day}${why ? `: ${why}` : ''}`
    }
  }
}

/** What a failure is "about", for grouping: the offline component if known, else the resource. */
export type FailureGroup = {
  /** e.g. 'water/waterRecycler', 'o2', 'systemDown/co2Scrubber', 'crewUnfit' */
  key: string
  resource?: ConsumableKey
  component?: ComponentKey
  /** For crew-unfit groups: why, e.g. 'boneLoss' or 'scurvy' (GEA-23). */
  driver?: string
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
      return cause.driver
        ? { key: `crewUnfit/${cause.driver}`, driver: cause.driver }
        : { key: 'crewUnfit' }
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
  o2: 'oxygen',
  water: 'water',
  food: 'food',
}

export type WeakestLinkCause = {
  /** Same key as failureHistogram, e.g. 'water/waterRecycler'. */
  key: string
  resource?: ConsumableKey
  component?: ComponentKey
  /** For crew-unfit causes: the health driver, e.g. 'boneLoss'. */
  driver?: string
  /** Share of all runs that ended this way, 0–1. */
  share: number
  count: number
  medianDay: number
  /** Mission month of the median failure day; day 0 is month 1. */
  month: number
  /** Short label for the breakdown list, e.g. "Water runs out: water recycler has no spare parts". */
  label: string
  /** The headline, e.g. "In 31% of missions, water runs out around month 19 because …". */
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
  const why = awaitingSpare ? 'ran out of spare parts' : 'is still being repaired'
  const short = awaitingSpare ? 'has no spare parts' : 'is still being repaired'
  if (group.resource) {
    const name = RESOURCE_NAME[group.resource]
    const runsOut = `${RESOURCE_IN_SENTENCE[group.resource]} runs out around month ${month}`
    return component
      ? {
          what: `${runsOut} because the ${component} ${why}`,
          label: `${name} runs out: ${component} ${short}`,
        }
      : {
          what: `${runsOut} because not enough was sent`,
          label: `${name} runs out: not enough sent`,
        }
  }
  if (component) {
    return {
      what: `the air goes bad around month ${month} because the ${component} ${why}`,
      label: `Air goes bad: ${component} ${short}`,
    }
  }
  const health = group.driver && UNFIT_SENTENCE[group.driver]
  if (health) return { what: health.what(month), label: health.label }
  return {
    what: `a crew member gets too sick to work around month ${month}`,
    label: 'Crew too sick to work',
  }
}

/** Weakest-link wording per crew-unfit driver (GEA-32). */
const UNFIT_SENTENCE: Record<string, { what: (month: number) => string; label: string }> = {
  boneLoss: {
    what: (m) => `a crew member's bones get too weak to work safely around month ${m}`,
    label: 'Crew bones get too weak',
  },
  scurvy: {
    what: (m) => `a crew member gets scurvy from too little vitamin C around month ${m}`,
    label: 'Crew gets scurvy',
  },
  bodyMass: {
    what: (m) =>
      `a crew member loses more than ${BODY_MASS_LOSS_UNFIT_PCT}% of their body weight around month ${m}`,
    label: 'Crew loses too much weight',
  },
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
      sentence: `The crew makes it in ${(survivalRate * 100).toFixed(1)}% of simulated missions.`,
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
        driver: g.driver,
        share,
        count: g.count,
        medianDay,
        month,
        label,
        sentence: `In ${pct(share)} of missions, ${what}`,
      }
    })

  return { status: 'atRisk', survivalRate, top: causes[0], causes, sentence: causes[0].sentence }
}

// ---------- Suggested fix (GEA-30) ----------

export type FixOptions = {
  /** Runs per candidate during the search; the winner is re-checked at the result's own run count. */
  searchRuns: number
  /** Survival the search aims for; the cheapest candidate that reaches it wins. */
  targetSurvival: number
  /** Most spares added for one component. */
  maxAddedSpares: number
}

export const DEFAULT_FIX_OPTIONS: FixOptions = {
  searchRuns: 300,
  targetSurvival: 0.9,
  maxAddedSpares: 8,
}

export type FixKind =
  'addSpares' | 'moveSpares' | 'emergencyFlight' | 'addConsumables' | 'exercise' | 'supplement'

export type SuggestedFix =
  | { status: 'allClear'; sentence: string }
  | { status: 'noFix'; sentence: string }
  | {
      status: 'fix'
      kind: FixKind
      /** What to change, e.g. "Add 4 water recycler spares to Cargo lander 1 (+185 kg)". */
      description: string
      /** Description plus the odds, e.g. "… → 57% → 92%". */
      sentence: string
      /** The input plan with the fix applied; safe to put straight into UI state. */
      plan: MissionPlan
      survivalBefore: number
      survivalAfter: number
      /** Change in total launch mass (kg); swaps make it smaller than the added mass. */
      massDeltaKg: number
      /** Mass of other cargo removed to make room (kg), 0 if none. */
      swappedOutKg: number
      /** For a best fix (bestFix): each change, in the order it was found. */
      steps?: string[]
    }

type Candidate = {
  kind: FixKind
  plan: MissionPlan
  description: string
  addedKg: number
  swappedOutKg: number
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const monthYear = (date: IsoDate) => `${MONTHS[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`

/** Same comma grouping the UI uses: 1,463 kg. */
const kg = (n: number) =>
  `${Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',')} kg`

function sparesText(component: ComponentKey, n: number): string {
  return `${n} spare part${n === 1 ? '' : 's'} for the ${inSentence(COMPONENTS[component].label)}`
}

/**
 * Survival only: the same seeded run sequence as runMission (one rng stream, runs in order), so the
 * numbers match it exactly, without the cost of building percentile bands.
 */
function survivalRate(plan: MissionPlan, runs: number, seed: number): number {
  const rng = mulberry32(seed)
  let survived = 0
  for (let i = 0; i < runs; i++) if (runOnce(plan, rng).survived) survived++
  return survived / runs
}

/** Flights landing before `day`, earliest landing first. */
function flightsLandingBefore(plan: MissionPlan, day: number): CargoFlight[] {
  return plan.flights
    .map((f) => ({ f, d: arrivalDay(plan, f) }))
    .filter((x): x is { f: CargoFlight; d: number } => x.d !== null && x.d < day)
    .sort((a, b) => a.d - b.d)
    .map((x) => x.f)
}

type Loaded = { plan: MissionPlan; swappedOutKg: number; swapped?: ConsumableKey }

/**
 * Applies `add` (which adds `addKg` of launch mass) to one flight. If the flight lacks room, swaps
 * out the heaviest consumable that isn't `keep`. Undefined when even a swap can't make it fit.
 */
function loadOnto(
  plan: MissionPlan,
  flightId: string,
  addKg: number,
  keep: ConsumableKey | undefined,
  add: (f: CargoFlight) => CargoFlight,
): Loaded | undefined {
  const flight = plan.flights.find((f) => f.id === flightId)
  if (!flight) return undefined
  const cap = flightCapacity(plan, flight)
  const room = cap.capacityKg - cap.massKg
  let next = add(flight)
  let swappedOutKg = 0
  let swapped: ConsumableKey | undefined
  if (addKg > room) {
    swapped = CONSUMABLE_KEYS.filter((r) => r !== keep).sort(
      (a, b) => next.consumablesKg[b] - next.consumablesKg[a],
    )[0]
    const removeNetKg = Math.ceil((addKg - room) / (1 + SHIPPING_OVERHEAD_KG_PER_KG[swapped]))
    if (removeNetKg > next.consumablesKg[swapped]) return undefined
    next = {
      ...next,
      consumablesKg: {
        ...next.consumablesKg,
        [swapped]: next.consumablesKg[swapped] - removeNetKg,
      },
    }
    swappedOutKg = flightMassKg(flight) + addKg - flightMassKg(next)
  }
  const out = { ...plan, flights: plan.flights.map((f) => (f.id === flightId ? next : f)) }
  return overCapacityFlights(out).length === 0 ? { plan: out, swappedOutKg, swapped } : undefined
}

function swapText({ swappedOutKg, swapped }: Loaded): string {
  return swapped && swappedOutKg > 0
    ? `, leaving ${kg(swappedOutKg)} of ${RESOURCE_IN_SENTENCE[swapped]} behind to make room`
    : ''
}

function withSpares(f: CargoFlight, component: ComponentKey, n: number): CargoFlight {
  return { ...f, spares: { ...f.spares, [component]: f.spares[component] + n } }
}

/**
 * Highest-capacity launch date whose cargo lands between mission start and `beforeDay`: the
 * off-window emergency flight used when no planned flight lands in time with room to spare.
 */
export function emergencyLaunchDate(plan: MissionPlan, beforeDay: number): IsoDate | undefined {
  const range = launchDateRange(plan.destination)
  let best: { date: IsoDate; factor: number } | undefined
  // Transits are 3–300 days, so launches up to 400 days before the landing deadline cover it.
  for (let back = 1; back <= 400; back++) {
    const date = addDays(plan.startDate, beforeDay - back)
    if (range && (date < range.first || date > range.last)) continue
    const t = transferFor(plan.destination, date)
    const lands = daysBetween(plan.startDate, t.arrivalDate)
    if (lands < 0 || lands >= beforeDay || t.payloadFactor <= 0) continue
    if (!best || t.payloadFactor > best.factor) best = { date, factor: t.payloadFactor }
  }
  return best?.date
}

function spareCandidates(
  plan: MissionPlan,
  component: ComponentKey,
  keep: ConsumableKey | undefined,
  failureDay: number,
  maxAdded: number,
): Candidate[] {
  const spareKg = COMPONENTS[component].spareMassKg
  const out: Candidate[] = []
  const inTime = flightsLandingBefore(plan, failureDay)
  // Spares of this component on flights that land too late to help.
  const late = plan.flights.filter(
    (f) => f.spares[component] > 0 && !inTime.some((g) => g.id === f.id),
  )
  const lateCount = late.reduce((n, f) => n + f.spares[component], 0)

  for (const target of inTime) {
    for (let n = 1; n <= maxAdded; n++) {
      const r = loadOnto(plan, target.id, n * spareKg, keep, (f) => withSpares(f, component, n))
      if (!r) continue
      out.push({
        kind: 'addSpares',
        plan: r.plan,
        description: `Pack ${sparesText(component, n)} on ${target.label} (adds ${kg(n * spareKg)}${swapText(r)})`,
        addedKg: n * spareKg,
        swappedOutKg: r.swappedOutKg,
      })
    }
    if (lateCount > 0) {
      // Timing fix: ship the late spares in an earlier window, optionally with a few more.
      const stripped: MissionPlan = {
        ...plan,
        flights: plan.flights.map((f) =>
          late.includes(f) ? { ...f, spares: { ...f.spares, [component]: 0 } } : f,
        ),
      }
      const from = late[0]
      for (let extra = 0; extra <= maxAdded; extra++) {
        const moved = lateCount + extra
        const r = loadOnto(stripped, target.id, moved * spareKg, keep, (f) =>
          withSpares(f, component, moved),
        )
        if (!r) continue
        const more = extra > 0 ? `, and pack ${extra} more (adds ${kg(extra * spareKg)})` : ''
        out.push({
          kind: 'moveSpares',
          plan: r.plan,
          description: `Send the ${sparesText(component, lateCount)} on ${target.label} in ${monthYear(target.launchDate)} instead of waiting for ${from.label} in ${monthYear(from.launchDate)}${more}${swapText(r)}`,
          addedKg: extra * spareKg,
          swappedOutKg: r.swappedOutKg,
        })
      }
    }
    // The earliest flight with room is enough; later in-time flights only matter if it's full.
    if (out.length > 0) return out
  }

  // Nothing lands in time with room: an off-window emergency flight, penalty and all.
  const date = emergencyLaunchDate(plan, failureDay)
  if (!date) return out
  const t = transferFor(plan.destination, date)
  const penalty = `a ${t.transitDays}-day flight with only ${Math.round(t.payloadFactor * 100)}% of the usual room`
  for (let n = 1; n <= maxAdded; n++) {
    const flight = withSpares(
      emptyFlight(`emergency-${date}`, 'Emergency resupply', date),
      component,
      n,
    )
    const next = { ...plan, flights: [...plan.flights, flight] }
    if (overCapacityFlights(next).length > 0) break
    out.push({
      kind: 'emergencyFlight',
      plan: next,
      description: `Book an extra rocket leaving in ${monthYear(date)} (${penalty}) carrying ${sparesText(component, n)} (adds ${kg(n * spareKg)})`,
      addedKg: n * spareKg,
      swappedOutKg: 0,
    })
  }
  return out
}

/** Plan with the daily vitamin C tablet, or undefined if it's already on or breaks a mass limit. */
function withVitaminC(plan: MissionPlan): MissionPlan | undefined {
  if (plan.lifeSupport.vitaminCSupplement) return undefined
  const next = { ...plan, lifeSupport: { ...plan.lifeSupport, vitaminCSupplement: true } }
  return overCapacityFlights(next).length === 0 ? next : undefined
}

function vitaminCDescription(plan: MissionPlan, next: MissionPlan): string {
  return `Give the crew a daily vitamin C tablet (adds ${supplementMassKg(next).toFixed(1)} kg to ${plan.flights[0].label})`
}

/** Fixes for a crew member becoming medically unfit, by driver (GEA-32). */
function healthCandidates(plan: MissionPlan, driver: string, failureDay: number): Candidate[] {
  if (driver === 'boneLoss') {
    // Exercise is the bone countermeasure; it costs crew time, not launch mass (the gym is in the habitat).
    const short = plan.crew.filter((m) => m.exerciseMinPerDay < EXERCISE_FULL_COUNTERMEASURE_MIN)
    if (short.length === 0) return []
    const least = Math.min(...short.map((m) => m.exerciseMinPerDay))
    return [
      {
        kind: 'exercise',
        plan: {
          ...plan,
          crew: plan.crew.map((m) =>
            m.exerciseMinPerDay < EXERCISE_FULL_COUNTERMEASURE_MIN
              ? { ...m, exerciseMinPerDay: EXERCISE_FULL_COUNTERMEASURE_MIN }
              : m,
          ),
        },
        description: `Have the crew exercise ${EXERCISE_FULL_COUNTERMEASURE_MIN} minutes a day, up from as little as ${least} (no extra weight to launch)`,
        addedKg: 0,
        swappedOutKg: 0,
      },
    ]
  }
  if (driver === 'bodyMass') return consumableCandidates(plan, 'food', failureDay)
  if (driver === 'scurvy') {
    const next = withVitaminC(plan)
    if (!next) return []
    return [
      {
        kind: 'supplement',
        plan: next,
        description: vitaminCDescription(plan, next),
        addedKg: supplementMassKg(next),
        swappedOutKg: 0,
      },
    ]
  }
  return []
}

function consumableCandidates(
  plan: MissionPlan,
  resource: ConsumableKey,
  failureDay: number,
): Candidate[] {
  // Upper bound on the shortfall: the full daily need over the days left after the failure.
  const shortfallKg =
    dailyRates(plan).consumeKg[resource] * Math.max(1, plan.durationDays - failureDay)
  const target = flightsLandingBefore(plan, failureDay)[0]
  if (!target) return []
  const out: Candidate[] = []
  for (const share of [0.25, 0.5, 0.75, 1]) {
    const netKg = Math.ceil((shortfallKg * share) / 10) * 10
    const grossKg = netKg * (1 + SHIPPING_OVERHEAD_KG_PER_KG[resource])
    const r = loadOnto(plan, target.id, grossKg, resource, (f) => ({
      ...f,
      consumablesKg: { ...f.consumablesKg, [resource]: f.consumablesKg[resource] + netKg },
    }))
    if (!r) continue
    out.push({
      kind: 'addConsumables',
      plan: r.plan,
      description: `Send ${kg(netKg)} more ${RESOURCE_IN_SENTENCE[resource]} on ${target.label} (adds ${kg(grossKg)} with packaging${swapText(r)})`,
      addedKg: grossKg,
      swappedOutKg: r.swappedOutKg,
    })
  }
  return out
}

/**
 * "Do this and they live": candidate fixes for the weakest link, each re-simulated on the same seed,
 * lightest first. The lightest that reaches the target survival wins; if none does, the one with the
 * best survival. Only fixes with a sourced launch mass are tried (spares, cargo, flights), and every
 * candidate is checked against each flight's date-adjusted mass limit.
 */
export function suggestFix(
  plan: MissionPlan,
  result: SimResult,
  options: FixOptions = DEFAULT_FIX_OPTIONS,
): SuggestedFix {
  const link = weakestLink(result)
  if (link.status === 'allClear') return { status: 'allClear', sentence: link.sentence }

  const { top } = link
  const candidates = top.component
    ? spareCandidates(plan, top.component, top.resource, top.medianDay, options.maxAddedSpares)
    : top.resource
      ? consumableCandidates(plan, top.resource, top.medianDay)
      : top.driver
        ? healthCandidates(plan, top.driver, top.medianDay)
        : []
  if (candidates.length === 0) {
    return { status: 'noFix', sentence: `No fix fits on the rockets for: ${top.label}.` }
  }

  const netKg = (c: Candidate) => c.addedKg - c.swappedOutKg
  candidates.sort((a, b) => netKg(a) - netKg(b) || a.addedKg - b.addedKg)
  const baseline = survivalRate(plan, options.searchRuns, result.seed)
  let best: { c: Candidate; rate: number; reached: boolean } | undefined
  for (const c of candidates) {
    // Sorted by mass: once a candidate reaches the target, anything heavier can't beat it.
    if (best?.reached && netKg(c) > netKg(best.c)) break
    const rate = survivalRate(c.plan, options.searchRuns, result.seed)
    if (rate <= baseline) continue
    const reached = rate >= options.targetSurvival
    if (!best || (reached && !best.reached) || (reached === best.reached && rate > best.rate)) {
      best = { c, rate, reached }
    }
  }
  if (!best) {
    return {
      status: 'noFix',
      sentence: `None of the fixes we tried helped with: ${top.label}.`,
    }
  }

  // Re-check at the result's own run count and seed so the odds match what Apply fix will show.
  const after = survivalRate(best.c.plan, result.runs, result.seed)
  const before = result.survivalRate
  return {
    status: 'fix',
    kind: best.c.kind,
    description: best.c.description,
    sentence: `${best.c.description}: survival goes from ${pct(before)} to ${pct(after)}`,
    plan: best.c.plan,
    survivalBefore: before,
    survivalAfter: after,
    massDeltaKg: totalLaunchMassKg(best.c.plan) - totalLaunchMassKg(plan),
    swappedOutKg: best.c.swappedOutKg,
  }
}

// ---------- Best fix: straight to the highest survival ----------

/** Most fixes chained into one best fix; each one fixes the next weakest link. */
export const BEST_FIX_MAX_STEPS = 4

/**
 * The fix that gets survival as high as it will go, in one click: fix the weakest link aiming for
 * all-clear (heaviest fix that helps most, not the lightest that clears 90%), rerun, fix the next weakest
 * link, and so on until all clear or nothing more helps. Takes several seconds; the UI runs it off the
 * main thread. Returns the same shape as suggestFix, with `steps` listing each change.
 */
export function bestFix(
  plan: MissionPlan,
  result: SimResult,
  options: FixOptions = DEFAULT_FIX_OPTIONS,
): SuggestedFix {
  const aim = { ...options, targetSurvival: ALL_CLEAR_SURVIVAL_RATE }
  let current = plan
  let currentResult = result
  const steps: string[] = []
  let kind: FixKind | undefined
  let swappedOutKg = 0
  for (let i = 0; i < BEST_FIX_MAX_STEPS; i++) {
    const fix = suggestFix(current, currentResult, aim)
    if (fix.status !== 'fix' || fix.survivalAfter <= currentResult.survivalRate) break
    steps.push(fix.description)
    kind ??= fix.kind
    swappedOutKg += fix.swappedOutKg
    current = fix.plan
    currentResult = runMission(current, { runs: result.runs, seed: result.seed })
    if (currentResult.survivalRate >= ALL_CLEAR_SURVIVAL_RATE) break
  }
  if (!kind) return suggestFix(plan, result, options)
  const before = result.survivalRate
  const after = currentResult.survivalRate
  return {
    status: 'fix',
    kind,
    description: steps.join('. '),
    sentence: `${steps.join('. ')}: survival goes from ${pct(before)} to ${pct(after)}`,
    plan: current,
    survivalBefore: before,
    survivalAfter: after,
    massDeltaKg: totalLaunchMassKg(current) - totalLaunchMassKg(plan),
    swappedOutKg,
    steps,
  }
}

// ---------- Nutrition warning (GEA-32) ----------

export type NutritionWarning = {
  /** e.g. "Vitamin C intake falls below the 100 mg/day need around month 1 for Reyes and Lindqvist". */
  sentence: string
  firstShortDay: number
  crewIds: string[]
  /** Ready-to-apply fix (the daily vitamin C tablet), verified to clear the shortfall within mass limits. */
  fix?: { description: string; plan: MissionPlan; massDeltaKg: number }
}

/** Every component made unbreakable: nutrition with no hardware failures in the way. */
const UNBREAKABLE = Object.fromEntries(
  COMPONENT_KEYS.map((c) => [c, { ...COMPONENTS[c], mtbfDays: Infinity }]),
) as Record<ComponentKey, ComponentSpec>

function vitaminCShortfall(plan: MissionPlan) {
  const tallies = runOnce(plan, mulberry32(1), UNBREAKABLE).nutrition
  if (!tallies) return undefined
  const short = plan.crew
    .map((m) => ({ m, day: tallies[m.id]?.vitaminCMg.firstShortDay ?? null }))
    .filter((x): x is { m: (typeof plan.crew)[number]; day: number } => x.day !== null)
  return short.length > 0 ? short : undefined
}

/**
 * Stored food loses vitamin C with shelf age, so intake can fall below need long before anyone gets
 * scurvy: not fatal, but worth fixing. Checked on a run with no hardware failures, so the warning is
 * about the diet, not about running out of food.
 */
export function nutritionWarning(plan: MissionPlan): NutritionWarning | undefined {
  const short = vitaminCShortfall(plan)
  if (!short) return undefined
  const firstShortDay = Math.min(...short.map((s) => s.day))
  const who = short.length === plan.crew.length ? 'The crew' : `${short.length} of the crew`
  const warning: NutritionWarning = {
    sentence: `${who} won't get enough vitamin C (${VITAMIN_C_MG_PER_DAY} mg a day) from about month ${missionMonth(firstShortDay)}. Stored food loses about a quarter of its vitamin C each year`,
    firstShortDay,
    crewIds: short.map((s) => s.m.id),
  }
  const next = withVitaminC(plan)
  if (next && !vitaminCShortfall(next)) {
    warning.fix = {
      description: vitaminCDescription(plan, next),
      plan: next,
      massDeltaKg: totalLaunchMassKg(next) - totalLaunchMassKg(plan),
    }
  }
  return warning
}
