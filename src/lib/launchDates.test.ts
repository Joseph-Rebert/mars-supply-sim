import { describe, expect, it } from 'vitest'
import {
  clampLaunchDate,
  nearestBestDate,
  runBlockedReason,
  shipCostStrip,
  withFlightLaunchDate,
  withFlightsAtBestDates,
} from './launchDates'
import type { CargoFlight, MissionPlan } from './types'

const flight = (id: string, launchDate: string, foodKg = 1000): CargoFlight => ({
  id,
  label: `Flight ${id}`,
  launchDate,
  consumablesKg: { o2: 0, water: 0, food: foodKg },
  spares: { waterRecycler: 0, o2Generator: 0, co2Scrubber: 0, greenhouse: 0 },
})

const plan = (destination: MissionPlan['destination'], flights: CargoFlight[]): MissionPlan => ({
  name: 'Launch date test',
  destination,
  startDate: '2029-09-01',
  durationDays: 900,
  crew: [],
  lifeSupport: {
    waterRecoveryRate: 0.9,
    o2Source: 'electrolysis',
    greenhouse: { enabled: false, areaM2: 0 },
  },
  flights,
  baseVehiclePayloadKg: 12_600,
})

describe('nearestBestDate', () => {
  it('snaps a Mars date to the best date of the closest window', () => {
    expect(nearestBestDate('mars', '2028-11-14')).toBe('2028-12-11')
    // 2029-12-31 is 385 d after 2028-12-11 and 390 d before 2031-01-25.
    expect(nearestBestDate('mars', '2029-12-31')).toBe('2028-12-11')
    expect(nearestBestDate('mars', '2030-01-10')).toBe('2031-01-25')
  })

  it('leaves Moon dates alone', () => {
    expect(nearestBestDate('moon', '2030-05-17')).toBe('2030-05-17')
  })
})

describe('clampLaunchDate', () => {
  it('keeps Mars dates inside the transfer table', () => {
    expect(clampLaunchDate('mars', '2020-01-01')).toBe('2026-01-01')
    expect(clampLaunchDate('mars', '2050-01-01')).toBe('2042-03-06')
    expect(clampLaunchDate('mars', '2030-06-01')).toBe('2030-06-01')
    expect(clampLaunchDate('moon', '2050-01-01')).toBe('2050-01-01')
  })
})

describe('shipCostStrip', () => {
  it('covers ~30 months daily around the date, peaking at 1 on the best date', () => {
    const strip = shipCostStrip('mars', '2028-12-11')
    // 274 days before + the day itself + 639 after.
    expect(strip).toHaveLength(914)
    expect(strip[0].date).toBe('2028-03-12')
    expect(strip.find((p) => p.date === '2028-12-11')?.payloadFactor).toBe(1)
    expect(Math.min(...strip.map((p) => p.payloadFactor))).toBe(0)
  })

  it('clips to the start of the Mars table', () => {
    expect(shipCostStrip('mars', '2026-03-01')[0].date).toBe('2026-01-01')
  })

  it('is flat at 100% for the Moon', () => {
    const strip = shipCostStrip('moon', '2030-01-01')
    expect(strip).toHaveLength(914)
    expect(strip.every((p) => p.payloadFactor === 1)).toBe(true)
  })
})

describe('plan edits', () => {
  it('changes one flight date without touching the others or the input', () => {
    const p = plan('mars', [flight('a', '2028-12-01'), flight('b', '2031-01-15')])
    const next = withFlightLaunchDate(p, 'b', '2031-01-25')
    expect(next.flights.map((f) => f.launchDate)).toEqual(['2028-12-01', '2031-01-25'])
    expect(p.flights[1].launchDate).toBe('2031-01-15')
  })

  it('moves every flight to its nearest best date', () => {
    const p = plan('mars', [flight('a', '2028-12-01'), flight('b', '2031-01-15')])
    expect(withFlightsAtBestDates(p).flights.map((f) => f.launchDate)).toEqual([
      '2028-12-11',
      '2031-01-25',
    ])
  })
})

describe('runBlockedReason', () => {
  it('allows a plan within capacity at every date', () => {
    expect(runBlockedReason(plan('mars', [flight('a', '2028-12-11')]))).toBeUndefined()
  })

  it('blocks a flight over its date-adjusted capacity, naming it', () => {
    // 2028-09-01: factor 0.3823 → 4,817 kg; 5,000 kg of food (+ packaging) is over.
    const p = plan('mars', [flight('a', '2028-12-11'), flight('b', '2028-09-01', 5000)])
    expect(runBlockedReason(p)).toMatch(/Flight b/)
    expect(runBlockedReason(p)).not.toMatch(/Flight a/)
  })

  it('blocks a Mars date outside the transfer table instead of throwing', () => {
    expect(runBlockedReason(plan('mars', [flight('a', '2050-01-01')]))).toMatch(/outside/)
    expect(runBlockedReason(plan('moon', [flight('a', '2050-01-01')]))).toBeUndefined()
  })
})
