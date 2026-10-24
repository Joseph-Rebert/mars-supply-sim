import { describe, expect, it } from 'vitest'
import { MARS_BASE_PAYLOAD_KG, MOON_BASE_PAYLOAD_KG } from './data'
import { fakePlan } from './fake'
import {
  cargoArrivals,
  defaultLaunchDates,
  flightCapacity,
  flightMassKg,
  massStatus,
  overCapacityFlights,
  totalLaunchMassKg,
  withDefaultFlights,
  withFlightAdded,
  withFlightRemoved,
  withFlightUpdated,
} from './manifest'
import { withDestination } from './plan'
import type { CargoFlight, MissionPlan } from './types'

const flight = (id: string, launchDate: string): CargoFlight => ({
  id,
  label: id,
  launchDate,
  consumablesKg: { o2: 100, water: 1000, food: 196 },
  spares: { waterRecycler: 1, o2Generator: 1, co2Scrubber: 1, greenhouse: 1 },
})

const plan = (destination: MissionPlan['destination'], flights: CargoFlight[]): MissionPlan => ({
  name: 'Manifest test',
  destination,
  startDate: '2029-01-01',
  durationDays: 600,
  crew: [],
  lifeSupport: {
    waterRecoveryRate: 0.9,
    o2Source: 'electrolysis',
    greenhouse: { enabled: false, areaM2: 0 },
  },
  flights,
  baseVehiclePayloadKg: 12_600,
})

describe('flightMassKg', () => {
  it('adds container overhead and spare masses', () => {
    // O₂ 100 × 2.45 = 245; water 1000 × 1.10 = 1100; food 196 × (1 + 0.43/1.96) = 239;
    // one spare each: 46.2 + 70.2 + 27.8 + 20 = 164.2. Total 1748.2 kg.
    expect(flightMassKg(flight('a', '2028-12-11'))).toBeCloseTo(1748.2, 6)
  })

  it('sums flights for the plan total', () => {
    const p = plan('mars', [flight('a', '2028-12-11'), flight('b', '2031-01-25')])
    expect(totalLaunchMassKg(p)).toBeCloseTo(2 * 1748.2, 6)
  })
})

describe('flightCapacity', () => {
  it('gives full capacity at a window best date', () => {
    const p = plan('mars', [flight('a', '2028-12-11')])
    const c = flightCapacity(p, p.flights[0])
    expect(c.transfer.payloadFactor).toBe(1)
    expect(c.capacityKg).toBe(12_600)
    expect(c.overCapacity).toBe(false)
  })

  it('flags flights launched when the payload factor is low', () => {
    // 2028-09-01 is before the window: payload factor 0.3823 → 4,817 kg capacity.
    const heavy: CargoFlight = {
      ...flight('early', '2028-09-01'),
      consumablesKg: { o2: 0, water: 0, food: 5000 },
    }
    const p = plan('mars', [flight('ok', '2028-12-11'), heavy])
    const over = overCapacityFlights(p)
    expect(over.map((c) => c.flightId)).toEqual(['early'])
    expect(over[0].capacityKg).toBeCloseTo(12_600 * 0.3823, 6)
  })

  it('never limits Moon flights by date', () => {
    const p = plan('moon', [flight('a', '2028-09-01')])
    expect(flightCapacity(p, p.flights[0]).capacityKg).toBe(12_600)
  })
})

describe('cargoArrivals', () => {
  it('uses the Mars transfer table', () => {
    const [a] = cargoArrivals(plan('mars', [flight('a', '2028-12-11')]))
    expect(a).toEqual({
      flightId: 'a',
      launchDate: '2028-12-11',
      arrivalDate: '2029-07-19',
      arrivalDay: 199,
    })
  })

  it('lands Moon cargo 3 days after launch, with negative days for initial stock', () => {
    const arrivals = cargoArrivals(
      plan('moon', [flight('pre', '2028-12-01'), flight('mid', '2029-03-01')]),
    )
    expect(arrivals.map((a) => [a.arrivalDate, a.arrivalDay])).toEqual([
      ['2028-12-04', -28],
      ['2029-03-04', 62],
    ])
  })
})

describe('massStatus', () => {
  const cap = (massKg: number, capacityKg: number) => ({
    ...flightCapacity(plan('mars', [flight('f1', '2028-12-11')]), flight('f1', '2028-12-11')),
    massKg,
    capacityKg,
    overCapacity: massKg > capacityKg,
  })

  it('turns amber at 90% of capacity and red only when over', () => {
    expect(massStatus(cap(8999, 10_000))).toBe('ok')
    expect(massStatus(cap(9000, 10_000))).toBe('caution')
    expect(massStatus(cap(10_000, 10_000))).toBe('caution')
    expect(massStatus(cap(10_001, 10_000))).toBe('over')
    expect(massStatus(cap(0, 0))).toBe('ok')
  })
})

// fakePlan(): Mars, starts 2029-09-01, 900 days; flights launch 2028-12-11, 2028-12-18, 2031-01-25.
describe('defaultLaunchDates', () => {
  it('Mars: lands before the crew, then resupplies at each best date that lands in time', () => {
    // Window best dates → arrival day relative to 2029-09-01 (transfers-mars.json):
    //   2028-12-11 → 2029-07-19 (day −44)   initial landing
    //   2031-01-25 → 2031-11-21 (day 811)   < 900, resupply
    //   2033-04-28 → 2034-01-28 (day 1610)  too late
    const p = fakePlan()
    expect(defaultLaunchDates(p)).toEqual(['2028-12-11', '2031-01-25'])
    expect(defaultLaunchDates({ ...p, durationDays: 730 })).toEqual(['2028-12-11'])
    expect(defaultLaunchDates({ ...p, durationDays: 1700 })).toEqual([
      '2028-12-11',
      '2031-01-25',
      '2033-04-28',
    ])
  })

  it('Moon: lands on day 0, then every 180 days (launch 3 days ahead)', () => {
    const p = { ...fakePlan(), destination: 'moon' as const, durationDays: 400 }
    expect(defaultLaunchDates(p)).toEqual(['2029-08-29', '2030-02-25', '2030-08-24'])
  })
})

describe('withDefaultFlights', () => {
  it('moves each flight to the default date nearest its landing day', () => {
    // Lander 2 (2028-12-18) lands near day −44 too, so it joins lander 1 on the 2028 best date.
    const before = fakePlan()
    const p = withDefaultFlights(before)
    expect(p.flights.map((f) => f.launchDate)).toEqual(['2028-12-11', '2028-12-11', '2031-01-25'])
    expect(p.flights.map((f) => f.consumablesKg)).toEqual(
      before.flights.map((f) => f.consumablesKg),
    )
    expect(before.flights[1].launchDate).toBe('2028-12-18') // input not mutated
  })

  it('gives a plan with no flights one empty flight per default date', () => {
    const p = withDefaultFlights({ ...fakePlan(), durationDays: 1700, flights: [] })
    expect(p.flights.map((f) => [f.id, f.label, f.launchDate])).toEqual([
      ['f1', 'Initial landing', '2028-12-11'],
      ['f2', 'Resupply 1', '2031-01-25'],
      ['f3', 'Resupply 2', '2033-04-28'],
    ])
    expect(p.flights.every((f) => flightMassKg(f) === 0)).toBe(true)
  })
})

describe('withDestination', () => {
  it('Mars → Moon: landers land on day 0, the day-811 resupply on the day-720 slot', () => {
    const p = withDestination(fakePlan(), 'moon')
    expect(p.baseVehiclePayloadKg).toBe(MOON_BASE_PAYLOAD_KG)
    expect(p.flights.map((f) => f.launchDate)).toEqual(['2029-08-29', '2029-08-29', '2031-08-19'])
    expect(overCapacityFlights(p)).toEqual([])
  })

  it('Moon → Mars round trip keeps landers in the 2028 window and the resupply in 2031', () => {
    const p = withDestination(withDestination(fakePlan(), 'moon'), 'mars')
    expect(p.baseVehiclePayloadKg).toBe(MARS_BASE_PAYLOAD_KG)
    expect(p.flights.map((f) => f.launchDate)).toEqual(['2028-12-11', '2028-12-11', '2031-01-25'])
    expect(p.flights.map((f) => f.consumablesKg)).toEqual(
      fakePlan().flights.map((f) => f.consumablesKg),
    )
  })
})

describe('adding, removing and editing flights', () => {
  it('adds an empty resupply in the next window that lands in time', () => {
    const p = withFlightAdded({ ...fakePlan(), durationDays: 1700 })
    expect(p.flights.at(-1)).toMatchObject({
      id: 'f4',
      label: 'Resupply 2',
      launchDate: '2033-04-28',
    })
    expect(flightMassKg(p.flights.at(-1)!)).toBe(0)
  })

  it('adds alongside the last flight when no later window lands in time', () => {
    expect(withFlightAdded(fakePlan()).flights.at(-1)?.launchDate).toBe('2031-01-25')
  })

  it('removes any flight but keeps at least one', () => {
    const p = withFlightRemoved(fakePlan(), 'f2')
    expect(p.flights.map((f) => f.id)).toEqual(['f1', 'f3'])
    const one = { ...fakePlan(), flights: [fakePlan().flights[0]] }
    expect(withFlightRemoved(one, 'f1')).toBe(one)
  })

  it('updates one flight without touching the others', () => {
    const before = fakePlan()
    const p = withFlightUpdated(before, 'f3', (f) => ({
      ...f,
      spares: { ...f.spares, waterRecycler: 9 },
    }))
    expect(p.flights[2].spares.waterRecycler).toBe(9)
    expect(p.flights[0]).toBe(before.flights[0])
    expect(before.flights[2].spares.waterRecycler).toBe(2)
  })
})
