import { describe, expect, it } from 'vitest'
import { missionMonth, weakestLink } from './analysis'
import { fakePlan } from './fake'
import { runMission } from './sim'
import type { FailureCause, SimResult } from './types'

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
      'In 31% of runs, water runs out around month 19 because the water recycler has no spares left',
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
      'In 8% of runs, food runs out around month 23 because too little was shipped',
    )
    expect(link.causes[2].sentence).toBe(
      'In 3% of runs, CO₂ builds up around month 10 because the CO₂ scrubber has no spares left',
    )
    expect(link.causes.map((c) => c.label)).toEqual([
      'Water · water recycler out of spares',
      'Food · not enough shipped',
      'CO₂ · CO₂ scrubber out of spares',
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
      'In 50% of runs, water runs out around month 4 because the water recycler is down for repair',
    )
  })

  it('reports crew health causes', () => {
    const l = weakestLink(result(10, 0.9, [{ kind: 'crewUnfit', day: 640, crewId: 'c1' }]))
    expect(l.sentence).toBe('In 10% of runs, a crew member becomes medically unfit around month 22')
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
      sentence: 'All clear: the crew survives in 99.5% of runs.',
    })
    expect(weakestLink(result(1000, 1, [])).status).toBe('allClear')
  })

  it('finds the demo story in the real default plan: recycler spares run out', () => {
    const l = weakestLink(runMission(fakePlan()))
    if (l.status !== 'atRisk') throw new Error('expected atRisk')
    expect(l.top.key).toBe('water/waterRecycler')
    expect(l.sentence).toMatch(
      /^In \d+% of runs, water runs out around month \d+ because the water recycler has no spares left$/,
    )
  })
})
