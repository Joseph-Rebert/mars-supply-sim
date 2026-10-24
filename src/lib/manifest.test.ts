import { describe, expect, it } from 'vitest'
import { MARS_BASE_PAYLOAD_KG, MOON_BASE_PAYLOAD_KG } from './data'
import { fakePlan } from './fake'
import {
  budgetStatus,
  defaultLaunchDates,
  flightBudget,
  flightMassKg,
  manifestBlocker,
  planLaunchMassKg,
  withDefaultFlights,
  withFlightAdded,
  withFlightRemoved,
  withFlightUpdated,
} from './manifest'
import { withDestination, withDurationDays } from './plan'
import type { MissionPlan } from './types'

// fakePlan(): Mars, starts 2029-09-01, 900 days (ends 2032-02-18).
const mars = (): MissionPlan => withDestination(fakePlan(), 'mars')

describe('flightMassKg', () => {
  it('adds shipping overhead and spare unit masses from data.ts', () => {
    // Initial landing by hand:
    //   O₂     900 kg × (1 + 1.45)        = 2 205
    //   water 2400 kg × (1 + 0.10)        = 2 640
    //   food  3000 kg × (1 + 0.43 / 1.96) = 3 658.163
    //   spares 2 × 46.2 + 2 × 70.2 + 2 × 27.8 = 288.4
    const [initial, resupply] = fakePlan().flights
    expect(flightMassKg(initial)).toBeCloseTo(8791.563, 3)
    // 400 × 2.45 + 800 × 1.1 + 2600 × 1.219388 + (46.2 + 70.2 + 27.8) = 5 174.608
    expect(flightMassKg(resupply)).toBeCloseTo(5174.608, 3)
    expect(planLaunchMassKg(fakePlan())).toBeCloseTo(8791.563 + 5174.608, 3)
  })
})

describe('budgetStatus', () => {
  it('turns amber at 90% and red only when over', () => {
    expect(budgetStatus(8999, 10_000)).toBe('ok')
    expect(budgetStatus(9000, 10_000)).toBe('caution')
    expect(budgetStatus(10_000, 10_000)).toBe('caution')
    expect(budgetStatus(10_001, 10_000)).toBe('over')
    expect(budgetStatus(0, 0)).toBe('ok')
  })
})

describe('flightBudget', () => {
  it('limits a flight to base payload × the launch date payload factor', () => {
    const plan = mars()
    const b = flightBudget(plan, plan.flights[0])
    expect(b.transfer?.payloadFactor).toBe(1)
    expect(b.limitKg).toBe(MARS_BASE_PAYLOAD_KG)

    // 2028-12-01 is 10 days off the window's best date: payload factor 0.9946 in the table.
    const offBest = { ...plan.flights[0], launchDate: '2028-12-01' }
    expect(flightBudget(plan, offBest).limitKg).toBeCloseTo(MARS_BASE_PAYLOAD_KG * 0.9946, 6)

    // Between windows (2030-06-01) the vehicle can't reach Mars: limit 0.
    const between = { ...plan.flights[0], launchDate: '2030-06-01' }
    expect(flightBudget(plan, between)).toMatchObject({ limitKg: 0, status: 'over' })
  })

  it('has no transfer for dates outside the table', () => {
    const plan = mars()
    const early = { ...plan.flights[0], launchDate: '2020-01-01' }
    expect(flightBudget(plan, early)).toMatchObject({ transfer: undefined, limitKg: 0 })
  })
})

describe('manifestBlocker', () => {
  it('is null when every flight fits', () => {
    expect(manifestBlocker(mars())).toBeNull()
  })

  it('names the flight and how far over it is', () => {
    // 12 600 kg limit − 8 791.563 kg = 3 808.437 kg headroom; 4 000 kg more water adds 4 400 kg.
    const plan = withFlightUpdated(mars(), 'f1', (f) => ({
      ...f,
      consumablesKg: { ...f.consumablesKg, water: f.consumablesKg.water + 4000 },
    }))
    expect(manifestBlocker(plan)).toBe('Initial landing is 592 kg over its launch limit')
  })

  it('blocks a launch date with no transfer data', () => {
    const plan = withFlightUpdated(mars(), 'f2', (f) => ({ ...f, launchDate: '2050-01-01' }))
    expect(manifestBlocker(plan)).toBe('Resupply 1: no transfer data for 2050-01-01')
  })
})

describe('defaultLaunchDates', () => {
  it('Mars: lands before the crew, then resupplies at each best date that arrives in time', () => {
    // Best dates and arrival days relative to 2029-09-01, from transfers-mars.json:
    //   2028-12-11 → 2029-07-19 (day −44)   initial landing
    //   2031-01-25 → 2031-11-21 (day 811)   < 900, resupply
    //   2033-04-28 → 2034-01-28 (day 1610)  too late
    const plan = fakePlan()
    expect(defaultLaunchDates(plan)).toEqual(['2028-12-11', '2031-01-25'])
    expect(defaultLaunchDates({ ...plan, durationDays: 730 })).toEqual(['2028-12-11'])
    expect(defaultLaunchDates({ ...plan, durationDays: 1700 })).toEqual([
      '2028-12-11',
      '2031-01-25',
      '2033-04-28',
    ])
  })

  it('Moon: arrives on day 0, then every 180 days (launch 3 days ahead)', () => {
    const plan = { ...fakePlan(), destination: 'moon' as const, durationDays: 400 }
    expect(defaultLaunchDates(plan)).toEqual(['2029-08-29', '2030-02-25', '2030-08-24'])
  })
})

describe('withDefaultFlights', () => {
  it('keeps cargo in order and moves dates onto the defaults', () => {
    const before = fakePlan()
    const plan = withDefaultFlights(before)
    expect(plan.flights.map((f) => f.launchDate)).toEqual(['2028-12-11', '2031-01-25'])
    expect(plan.flights.map((f) => f.consumablesKg)).toEqual(
      before.flights.map((f) => f.consumablesKg),
    )
    expect(before.flights[0].launchDate).toBe('2028-12-01') // input not mutated
  })

  it('adds empty flights for new slots and never drops cargo', () => {
    const longer = withDurationDays(mars(), 1700)
    expect(longer.flights).toHaveLength(3)
    expect(longer.flights[2]).toMatchObject({ id: 'f3', label: 'Resupply 2' })
    expect(flightMassKg(longer.flights[2])).toBe(0)

    const shorter = withDurationDays(mars(), 730)
    expect(shorter.flights.map((f) => f.launchDate)).toEqual(['2028-12-11', '2028-12-11'])
  })
})

describe('withDestination', () => {
  it('switches the vehicle payload and re-snaps flights to the Moon cadence', () => {
    const plan = withDestination(fakePlan(), 'moon')
    expect(plan.baseVehiclePayloadKg).toBe(MOON_BASE_PAYLOAD_KG)
    // 900 days: arrivals on days 0, 180, 360, 540, 720.
    expect(plan.flights).toHaveLength(5)
    expect(plan.flights[0].launchDate).toBe('2029-08-29')
    expect(manifestBlocker(plan)).toBeNull()
  })
})

describe('adding and removing flights', () => {
  it('adds an empty flight alongside the last one', () => {
    const plan = withFlightAdded(mars())
    expect(plan.flights.at(-1)).toMatchObject({
      id: 'f3',
      label: 'Resupply 2',
      launchDate: '2031-01-25',
    })
  })

  it('removes resupply flights but never the initial landing', () => {
    const plan = mars()
    expect(withFlightRemoved(plan, 'f2').flights.map((f) => f.id)).toEqual(['f1'])
    expect(withFlightRemoved(plan, 'f1')).toBe(plan)
  })
})
