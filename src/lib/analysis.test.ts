import { beforeAll, describe, expect, it } from 'vitest'
import {
  ALL_CLEAR_SURVIVAL_RATE,
  BEST_FIX_MAX_STEPS,
  bestFix,
  emergencyLaunchDate,
  nutritionWarning,
  missionMonth,
  suggestFix,
  weakestLink,
  type SuggestedFix,
} from './analysis'
import { addDays, daysBetween } from './dates'
import { fakePlan } from './fake'
import { transferFor } from './transfers'
import {
  flightCapacity,
  overCapacityFlights,
  supplementMassKg,
  totalLaunchMassKg,
} from './manifest'
import { withCrewMemberUpdated } from './plan'
import { presetById } from './presets'
import { runMission } from './sim'
import type { FailureCause, MissionPlan, SimResult } from './types'

declare const process: { cpuUsage(): { user: number; system: number } }
const cpuMs = () => {
  const { user, system } = process.cpuUsage()
  return (user + system) / 1000
}

function result(runs: number, survivalRate: number, failures: FailureCause[]): SimResult {
  return {
    runs,
    seed: 1,
    survivalRate,
    durationDays: 900,
    bands: {} as SimResult['bands'],
    failures,
    arrivals: [],
    totalLaunchMassKg: 0,
  }
}

// Fewer runs where the test checks behaviour, not the UI's exact numbers, to keep the suite light.
const LIGHT = { runs: 300, seed: 1 }

const range = (from: number, n: number) => Array.from({ length: n }, (_, i) => from + i)

const recyclerOut = (day: number, awaitingSpare = true): FailureCause => ({
  kind: 'stockout',
  resource: 'water',
  day,
  offlineComponent: 'waterRecycler',
  awaitingSpare,
})

// 100 runs, 57 survive: 31 water/recycler (days 540–570), 8 food (day 700), 3 CO₂ (day 300), 1 crew.
const failures: FailureCause[] = [
  ...range(540, 31).map((d) => recyclerOut(d)),
  ...range(0, 8).map((): FailureCause => ({ kind: 'stockout', resource: 'food', day: 700 })),
  ...range(0, 3).map((): FailureCause => ({
    kind: 'systemDown',
    component: 'co2Scrubber',
    day: 300,
  })),
  { kind: 'crewUnfit', day: 650, crewId: 'c2' },
]

describe('missionMonth', () => {
  it('counts day 0 as month 1, using 30.4375-day months', () => {
    expect(missionMonth(0)).toBe(1)
    expect(missionMonth(30)).toBe(1)
    expect(missionMonth(31)).toBe(2)
    // 555 / 30.4375 = 18.2 → month 19.
    expect(missionMonth(555)).toBe(19)
  })
})

describe('weakestLink', () => {
  const link = weakestLink(result(100, 0.57, failures))
  if (link.status !== 'atRisk') throw new Error('expected atRisk')

  it('names the component behind the most common failure, with share and median month', () => {
    // Median of days 540–570 is 555 → month 19.
    expect(link.top).toMatchObject({
      key: 'water/waterRecycler',
      component: 'waterRecycler',
      share: 0.31,
      medianDay: 555,
      month: 19,
    })
    expect(link.sentence).toBe(
      'In 31% of missions, water runs out around month 19 because the water recycler ran out of spare parts',
    )
  })

  it('returns the top three causes in order', () => {
    expect(link.causes.map((c) => c.key)).toEqual([
      'water/waterRecycler',
      'food',
      'systemDown/co2Scrubber',
    ])
    // 700 / 30.4375 = 23.0 → month 23 (day 700 is still inside month 23).
    expect(link.causes[1].sentence).toBe(
      'In 8% of missions, food runs out around month 23 because not enough was sent',
    )
    expect(link.causes[2].sentence).toBe(
      'In 3% of missions, the air goes bad around month 10 because the air filter ran out of spare parts',
    )
    expect(link.causes.map((c) => c.label)).toEqual([
      'Water runs out: water recycler has no spare parts',
      'Food runs out: not enough sent',
      'Air goes bad: air filter has no spare parts',
    ])
  })

  it('fits every sentence on one projector line', () => {
    for (const c of link.causes) expect(c.sentence.length).toBeLessThanOrEqual(100)
  })

  it('says "down for repair" when most of a group still had spares', () => {
    const mixed = [
      ...range(100, 2).map((d) => recyclerOut(d)),
      ...range(102, 3).map((d) => recyclerOut(d, false)),
    ]
    const l = weakestLink(result(10, 0.5, mixed))
    expect(l.sentence).toBe(
      'In 50% of missions, water runs out around month 4 because the water recycler is still being repaired',
    )
  })

  it('reports crew health causes', () => {
    const l = weakestLink(result(10, 0.9, [{ kind: 'crewUnfit', day: 640, crewId: 'c1' }]))
    expect(l.sentence).toBe(
      'In 10% of missions, a crew member gets too sick to work around month 22',
    )
  })

  it('returns all clear at 99% survival or better', () => {
    const l = weakestLink(
      result(
        1000,
        0.995,
        range(0, 5).map((d) => recyclerOut(d)),
      ),
    )
    expect(l).toEqual({
      status: 'allClear',
      survivalRate: 0.995,
      sentence: 'The crew makes it in 99.5% of simulated missions.',
    })
    expect(weakestLink(result(1000, 1, [])).status).toBe('allClear')
  })

  it('finds the demo story in the real default plan: recycler spares run out', () => {
    const l = weakestLink(runMission(fakePlan(), LIGHT))
    if (l.status !== 'atRisk') throw new Error('expected atRisk')
    expect(l.top.key).toBe('water/waterRecycler')
    expect(l.sentence).toMatch(
      /^In \d+% of missions, water runs out around month \d+ because the water recycler ran out of spare parts$/,
    )
  })
})

describe('suggestFix', () => {
  // Real Monte Carlo searches: computed once, with room for a slow CI machine.
  const SLOW = 30_000
  let draft: MissionPlan
  let draftResult: SimResult
  let fix: SuggestedFix
  let fixMs: number

  beforeAll(() => {
    draft = fakePlan()
    draftResult = runMission(draft)
    // CPU time of this process, so heavy test files running in parallel don't count.
    const start = cpuMs()
    fix = suggestFix(draft, draftResult)
    fixMs = cpuMs() - start
  }, SLOW)

  it('lifts the draft plan above 90% by fixing the water recycler spares, in time', () => {
    if (fix.status !== 'fix') throw new Error(fix.sentence)
    expect(fix.survivalBefore).toBe(draftResult.survivalRate)
    expect(fix.survivalAfter).toBeGreaterThanOrEqual(0.9)
    expect(fix.description).toMatch(/spare parts? for the water recycler/)
    expect(fix.sentence).toBe(
      `${fix.description}: survival goes from ${Math.round(fix.survivalBefore * 100)}% to ${Math.round(fix.survivalAfter * 100)}%`,
    )
    // Lands before the month-22 failure: the late Jan 2031 spares move to the Dec 2028 window.
    expect(fix.kind).toBe('moveSpares')
  })

  it(
    'returns a plan the UI can run as-is, matching the promised odds',
    () => {
      if (fix.status !== 'fix') throw new Error(fix.sentence)
      expect(overCapacityFlights(fix.plan)).toEqual([])
      expect(runMission(fix.plan).survivalRate).toBe(fix.survivalAfter)
      expect(fix.massDeltaKg).toBeCloseTo(totalLaunchMassKg(fix.plan) - totalLaunchMassKg(draft), 6)
      expect(draft).toEqual(fakePlan()) // input untouched
    },
    SLOW,
  )

  it('finishes in under 3 s', () => {
    expect(fixMs).toBeLessThan(3000)
  })

  it(
    'swaps out other cargo instead of breaking a full flight’s mass limit',
    () => {
      const full = fakePlan()
      // Fill every flight to its date-adjusted limit with water / food.
      for (const f of full.flights) {
        const c = flightCapacity(full, f)
        const room = c.capacityKg - c.massKg
        if (f.id === 'f1') f.consumablesKg.water += Math.floor(room / 1.1)
        else f.consumablesKg.food += Math.floor(room / (1 + 0.43 / 1.96))
      }
      expect(overCapacityFlights(full)).toEqual([])
      const r = suggestFix(full, runMission(full, LIGHT))
      if (r.status !== 'fix') throw new Error(r.sentence)
      expect(overCapacityFlights(r.plan)).toEqual([])
      expect(r.swappedOutKg).toBeGreaterThan(0)
      expect(r.description).toMatch(/leaving [\d,]+ kg of \w+ behind to make room/)
    },
    SLOW,
  )

  it(
    'ships more of a resource when too little was sent',
    () => {
      const lean = fakePlan()
      lean.flights[1].consumablesKg.food = 5200
      const r = suggestFix(lean, runMission(lean, LIGHT))
      if (r.status !== 'fix') throw new Error(r.sentence)
      expect(r.kind).toBe('addConsumables')
      expect(r.description).toMatch(/^Send [\d,]+ kg more food on Cargo lander/)
      expect(r.survivalAfter).toBeGreaterThan(r.survivalBefore)
      expect(overCapacityFlights(r.plan)).toEqual([])
    },
    SLOW,
  )

  it('picks the highest-capacity emergency launch that still lands before the failure', () => {
    // Draft plan starts 2029-09-01. Nothing launched can land between day 0 and day 300 with any
    // payload: those dates are all off-window, past the arrival v∞ cap. The planets set the schedule.
    expect(emergencyLaunchDate(draft, 300)).toBeUndefined()

    // Landing before day 700 is possible ahead of the 2030–31 window, at reduced capacity.
    const date = emergencyLaunchDate(draft, 700)!
    const t = transferFor('mars', date)
    const lands = daysBetween(draft.startDate, t.arrivalDate)
    expect(lands).toBeGreaterThanOrEqual(0)
    expect(lands).toBeLessThan(700)
    expect(t.payloadFactor).toBeGreaterThan(0)
    expect(t.payloadFactor).toBeLessThan(1)
    // No other launch landing in that span carries more.
    for (let back = 1; back <= 400; back++) {
      const other = transferFor('mars', addDays(draft.startDate, 700 - back))
      const otherLands = daysBetween(draft.startDate, other.arrivalDate)
      if (otherLands >= 0 && otherLands < 700) {
        expect(other.payloadFactor).toBeLessThanOrEqual(t.payloadFactor)
      }
    }
    // Moon: every date has full capacity, so it's the latest launch that lands in time: day 296 + 3.
    const moon = { ...draft, destination: 'moon' as const }
    expect(emergencyLaunchDate(moon, 300)).toBe(addDays(draft.startDate, 296))
  })

  it('says all clear without searching when the plan already survives', () => {
    const clear: SimResult = { ...draftResult, survivalRate: 1, failures: [] }
    expect(suggestFix(draft, clear)).toEqual({
      status: 'allClear',
      sentence: 'The crew makes it in 100.0% of simulated missions.',
    })
  })
})

describe('health and nutrition (GEA-32)', () => {
  const SLOW = 30_000
  const unfit = (driver: string, day: number): FailureCause => ({
    kind: 'crewUnfit',
    day,
    crewId: 'c1',
    driver,
  })

  it('names the health driver in the weakest link', () => {
    // Day 640 → month 22 (640 / 30.4375 = 21.03).
    const link = weakestLink(
      result(100, 0.7, [
        ...range(0, 20).map(() => unfit('boneLoss', 640)),
        ...range(0, 6).map(() => unfit('scurvy', 640)),
        ...range(0, 4).map(() => unfit('bodyMass', 640)),
      ]),
    )
    if (link.status !== 'atRisk') throw new Error('expected atRisk')
    expect(link.causes.map((c) => c.sentence)).toEqual([
      "In 20% of missions, a crew member's bones get too weak to work safely around month 22",
      'In 6% of missions, a crew member gets scurvy from too little vitamin C around month 22',
      'In 4% of missions, a crew member loses more than 15% of their body weight around month 22',
    ])
    expect(link.top).toMatchObject({ key: 'crewUnfit/boneLoss', driver: 'boneLoss' })
    expect(link.causes.map((c) => c.label)).toEqual([
      'Crew bones get too weak',
      'Crew gets scurvy',
      'Crew loses too much weight',
    ])
  })

  it(
    'fixes bone loss by restoring the exercise countermeasure, at no launch mass',
    () => {
      let plan = presetById('revised').plan()
      for (const m of plan.crew) plan = withCrewMemberUpdated(plan, m.id, { exerciseMinPerDay: 30 })
      const before = runMission(plan, LIGHT)
      expect(weakestLink(before).sentence).toMatch(/bones get too weak to work safely/)
      const fix = suggestFix(plan, before)
      if (fix.status !== 'fix') throw new Error(fix.sentence)
      expect(fix.kind).toBe('exercise')
      expect(fix.plan.crew.every((m) => m.exerciseMinPerDay === 90)).toBe(true)
      expect(fix.massDeltaKg).toBe(0)
      expect(fix.survivalAfter).toBeGreaterThan(fix.survivalBefore + 0.5)
    },
    SLOW,
  )

  it('warns that a stored-food-only Mars plan runs short of vitamin C, with a tablet fix', () => {
    const draft = presetById('draft').plan()
    expect(draft.destination).toBe('mars')
    expect(draft.lifeSupport.greenhouse.enabled).toBe(false) // stored food only

    const w = nutritionWarning(draft)!
    expect(w.sentence).toMatch(
      /^.+ won't get enough vitamin C \(100 mg a day\) from about month \d+\. Stored food loses/,
    )
    expect(w.crewIds.length).toBeGreaterThan(0)

    // 4 crew × 900 days × 100 mg × 2 (binder, bottle) = 0.72 kg, on the first flight, within its limit.
    const fix = w.fix!
    expect(fix.plan.lifeSupport.vitaminCSupplement).toBe(true)
    expect(fix.massDeltaKg).toBeCloseTo(0.72, 9)
    expect(supplementMassKg(fix.plan)).toBeCloseTo(0.72, 9)
    expect(fix.description).toBe(
      'Give the crew a daily vitamin C tablet (adds 0.7 kg to Cargo lander 1)',
    )
    expect(overCapacityFlights(fix.plan)).toEqual([])
    expect(nutritionWarning(fix.plan)).toBeUndefined()
  })

  it('offers no tablet fix when it would break the first flight’s mass limit', () => {
    const full = presetById('draft').plan()
    const c = flightCapacity(full, full.flights[0])
    // Fill to within 0.1 kg of the limit: less room than the 0.72 kg of tablets.
    full.flights[0].consumablesKg.water += (c.capacityKg - c.massKg - 0.1) / 1.1
    expect(overCapacityFlights(full)).toEqual([])
    const w = nutritionWarning(full)
    expect(w?.sentence).toMatch(/won't get enough vitamin C/)
    expect(w?.fix).toBeUndefined()
  })
})

describe('bestFix', () => {
  it('goes straight for the highest survival: the draft plan reaches all clear in a few steps', () => {
    const draft = presetById('draft').plan()
    const before = runMission(draft)
    const fix = bestFix(draft, before)
    if (fix.status !== 'fix') throw new Error(fix.sentence)
    expect(fix.survivalAfter).toBeGreaterThanOrEqual(ALL_CLEAR_SURVIVAL_RATE)
    expect(fix.steps!.length).toBeGreaterThan(1)
    expect(fix.steps!.length).toBeLessThanOrEqual(BEST_FIX_MAX_STEPS)
    // One click reproduces the promised odds.
    expect(runMission(fix.plan).survivalRate).toBe(fix.survivalAfter)
    expect(overCapacityFlights(fix.plan)).toEqual([])
  }, 120_000)
})
