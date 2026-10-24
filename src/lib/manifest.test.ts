import { describe, expect, it } from 'vitest'
import {
  cargoArrivals,
  flightCapacity,
  flightMassKg,
  overCapacityFlights,
  totalLaunchMassKg,
} from './manifest'
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
