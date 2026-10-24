import { describe, expect, it } from 'vitest'
import { addDays, daysBetween } from './dates'
import { fakePlan, fakeResult } from './fake'
import { RESOURCE_KEYS } from './types'

describe('dates', () => {
  it('adds days across month and year boundaries', () => {
    expect(addDays('2028-12-30', 3)).toBe('2029-01-02')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29') // leap year
  })

  it('daysBetween is the inverse of addDays', () => {
    expect(daysBetween('2029-09-01', addDays('2029-09-01', 570))).toBe(570)
    expect(daysBetween('2029-09-01', '2029-08-31')).toBe(-1)
  })
})

describe('fakeResult', () => {
  const plan = fakePlan()
  const result = fakeResult(plan)

  it('has one band entry per mission day with p10 ≤ p50 ≤ p90', () => {
    for (const r of RESOURCE_KEYS) {
      const { p10, p50, p90 } = result.bands[r]
      expect(p50).toHaveLength(plan.durationDays)
      for (let d = 0; d < plan.durationDays; d++) {
        expect(p10[d]).toBeLessThanOrEqual(p50[d])
        expect(p50[d]).toBeLessThanOrEqual(p90[d])
        expect(p10[d]).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('tells the demo story: ~62% survival, water + recycler is the main cause', () => {
    expect(result.survivalRate).toBeCloseTo(0.62, 2)
    expect(result.failures).toHaveLength(Math.round(result.runs * (1 - result.survivalRate)))
    const water = result.failures.filter((f) => f.kind === 'stockout' && f.resource === 'water')
    expect(water.length / result.failures.length).toBeGreaterThan(0.5)
  })

  it('derives arrivals from flights and is deterministic per seed', () => {
    expect(result.arrivals.map((a) => a.flightId)).toEqual(plan.flights.map((f) => f.id))
    expect(result.arrivals[0].arrivalDay).toBeLessThanOrEqual(0) // initial stock
    expect(fakeResult(plan, 1)).toEqual(result)
  })
})
