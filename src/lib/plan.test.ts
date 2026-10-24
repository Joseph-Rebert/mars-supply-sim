import { describe, expect, it } from 'vitest'
import { fakePlan } from './fake'
import { dailyNeeds, type CrewProfile } from './crew'
import {
  CREW_ROSTER,
  daysToMonths,
  monthsToDays,
  resupplyCadenceDays,
  withCrewMemberUpdated,
  withCrewSize,
} from './plan'

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

describe('withCrewMemberUpdated', () => {
  it('changes one member and leaves the rest and the input alone', () => {
    const before = fakePlan()
    const plan = withCrewMemberUpdated(before, 'c2', { massKg: 90, activity: 'light' })
    expect(plan.crew[1]).toMatchObject({ id: 'c2', name: 'Okafor', massKg: 90, activity: 'light' })
    expect(plan.crew[0]).toBe(before.crew[0])
    expect(before.crew[1].massKg).toBe(81)
  })

  it('clamps body stats to the card limits', () => {
    const plan = withCrewMemberUpdated(fakePlan(), 'c1', {
      ageYears: 12,
      massKg: 300,
      heightM: 1.2,
      exerciseMinPerDay: -30,
    })
    expect(plan.crew[0]).toMatchObject({
      ageYears: 25,
      massKg: 120,
      heightM: 1.5,
      exerciseMinPerDay: 0,
    })
  })

  it('feeds straight into personal daily needs', () => {
    const light = withCrewMemberUpdated(fakePlan(), 'c2', { activity: 'light' }).crew[1]
    const heavy = withCrewMemberUpdated(fakePlan(), 'c2', { activity: 'heavy' }).crew[1]
    expect(dailyNeeds(heavy as CrewProfile).energyKcal).toBeGreaterThan(
      dailyNeeds(light as CrewProfile).energyKcal,
    )
  })

  it('gives every default crew member a role', () => {
    expect(CREW_ROSTER.every((m) => m.role)).toBe(true)
    expect(fakePlan().crew.map((m) => m.role)).toEqual(CREW_ROSTER.slice(0, 4).map((m) => m.role))
  })
})
