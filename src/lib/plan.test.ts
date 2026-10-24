import { describe, expect, it } from 'vitest'
import { DESTINATION_FACTS } from './data'
import { fakePlan } from './fake'
import { CREW_ROSTER, daysToMonths, monthsToDays, withCrewSize } from './plan'

describe('withCrewSize', () => {
  it('adds roster members after the existing crew, with unique ids', () => {
    const plan = withCrewSize(fakePlan(), 6)
    expect(plan.crew.map((c) => c.id)).toEqual(['c1', 'c2', 'c3', 'c4', 'c5', 'c6'])
  })

  it('keeps the first members when shrinking and does not mutate the input', () => {
    const before = fakePlan()
    const plan = withCrewSize(before, 2)
    expect(plan.crew.map((c) => c.name)).toEqual(['Reyes', 'Okafor'])
    expect(before.crew).toHaveLength(4)
  })

  it('clamps to 2–8', () => {
    expect(withCrewSize(fakePlan(), 0).crew).toHaveLength(2)
    expect(withCrewSize(fakePlan(), 20).crew).toHaveLength(8)
  })

  it('starts from the same people as fakePlan()', () => {
    expect(CREW_ROSTER.slice(0, 4)).toEqual(fakePlan().crew)
  })
})

describe('months ↔ days', () => {
  it('uses the mean month (365.25 / 12)', () => {
    expect(monthsToDays(12)).toBe(365)
    expect(monthsToDays(30)).toBe(913)
    expect(daysToMonths(900)).toBe(30)
  })
})

describe('DESTINATION_FACTS', () => {
  it('gives Mars a 3.0–22.3 min one-way delay (54.6–401.3 M km at c)', () => {
    expect(DESTINATION_FACTS.mars.commsDelaySec.min / 60).toBeCloseTo(3.04, 2)
    expect(DESTINATION_FACTS.mars.commsDelaySec.max / 60).toBeCloseTo(22.31, 2)
  })

  it('gives the Moon a ~1.28 s delay and no launch window', () => {
    expect(DESTINATION_FACTS.moon.commsDelaySec.min).toBeCloseTo(1.282, 3)
    expect(DESTINATION_FACTS.moon.resupplyEveryDays).toBe(0)
  })
})
