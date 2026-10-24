import { describe, expect, it } from 'vitest'
import { fakePlan } from './fake'
import { CREW_ROSTER, daysToMonths, monthsToDays, resupplyCadenceDays, withCrewSize } from './plan'

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

describe('resupplyCadenceDays', () => {
  it('spaces Mars windows about one synodic period (779.94 d, NASA Mars Fact Sheet) apart', () => {
    const days = resupplyCadenceDays('mars')
    expect(days).not.toBeNull()
    expect(days!).toBeGreaterThan(740)
    expect(days!).toBeLessThan(820)
  })

  it('returns null for the Moon, where cargo can launch any day', () => {
    expect(resupplyCadenceDays('moon')).toBeNull()
  })
})
