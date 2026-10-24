import { describe, expect, it } from 'vitest'
import horizons from '../cache/horizons-earth-mars.json'
import { fakePlan } from './fake'
import { closestApproach, monthLabel, timelineOverlays, transferOnDay } from './timeline'

describe('timelineOverlays (Mars, default plan starting 2029-09-01)', () => {
  const plan = fakePlan()
  const o = timelineOverlays(plan)

  it('maps the 2030–31 window to mission days and drops the 2028 window (before day 0)', () => {
    // 2029-09-01 → 2030-11-18 = 443 d, → 2031-04-01 = 577 d, → best 2031-01-25 = 511 d.
    expect(o.windows).toEqual([
      { startDay: 443, endDay: 577, bestDay: 511, label: 'Window · Jan 2031' },
    ])
  })

  it('shows only the resupply that lands mid-mission, launching inside its window', () => {
    expect(o.transits).toEqual([{ flightId: 'f3', launchDay: 511, arrivalDay: 811 }])
    const [w] = o.windows
    expect(o.transits[0].launchDay).toBeGreaterThanOrEqual(w.startDay)
    expect(o.transits[0].launchDay).toBeLessThanOrEqual(w.endDay)
  })

  it('gives one Horizons distance per mission day, in millions of km', () => {
    expect(o.distanceMkm).toHaveLength(plan.durationDays)
    const day0 = horizons.days.find((d) => d.date === '2029-09-01')!
    expect(o.distanceMkm![0]).toBeCloseTo(day0.distanceKm / 1e6, 9)
  })

  it('opens the launch window just before closest approach, and cargo lands after it', () => {
    // Hohmann-like transfers launch while Mars is catching up and arrive ~8–10 months later.
    const d = o.distanceMkm as number[]
    const closest = closestApproach(d)!
    expect(closest.day).toBe(618)
    expect(closest.mkm).toBeCloseTo(82.8, 1)
    const [w] = o.windows
    expect(w.endDay).toBeLessThan(closest.day)
    expect(closest.day - w.endDay).toBeLessThan(120)
    expect(o.transits[0].arrivalDay).toBeGreaterThan(closest.day)
  })
})

describe('timelineOverlays (Moon)', () => {
  it('hides the distance line and has no launch windows', () => {
    const o = timelineOverlays({ ...fakePlan(), destination: 'moon' })
    expect(o.distanceMkm).toBeNull()
    expect(o.windows).toEqual([])
  })
})

describe('transferOnDay', () => {
  it('returns the transfer for that calendar date, or null outside the table', () => {
    const plan = fakePlan()
    expect(transferOnDay(plan, 511)?.launchDate).toBe('2031-01-25')
    expect(transferOnDay(plan, 100_000)).toBeNull()
  })
})

describe('monthLabel', () => {
  it('formats YYYY-MM-DD as Mon YYYY', () => {
    expect(monthLabel('2031-01-25')).toBe('Jan 2031')
    expect(monthLabel('2028-12-11')).toBe('Dec 2028')
  })
})
