import { describe, expect, it } from 'vitest'
import { mulberry32 } from './rng'
import { dailyRates, runOnce } from './sim'
import type { CrewMember, LifeSupportConfig, MissionPlan } from './types'

const CREW: CrewMember[] = [1, 2, 3, 4].map((n) => ({
  id: `c${n}`,
  name: `Crew ${n}`,
  sex: 'female',
  ageYears: 40,
  massKg: 70,
  activity: 'moderate',
  exerciseMinPerDay: 90,
}))

function plan(
  lifeSupport: Partial<LifeSupportConfig> = {},
  stock: { o2?: number; water?: number; food?: number } = {},
  durationDays = 100,
): MissionPlan {
  return {
    name: 'Test',
    destination: 'mars',
    startDate: '2030-01-01',
    durationDays,
    crew: CREW,
    lifeSupport: {
      waterRecoveryRate: 0.9,
      o2Source: 'electrolysis',
      greenhouse: { enabled: false, areaM2: 0 },
      ...lifeSupport,
    },
    flights: [
      {
        id: 'f1',
        label: 'Initial',
        launchDate: '2029-06-01',
        consumablesKg: { o2: 100, water: 1000, food: 1000, ...stock },
        spares: { waterRecycler: 2, o2Generator: 1, co2Scrubber: 1, greenhouse: 0 },
      },
      {
        id: 'f2',
        label: 'Launches after start (GEA-19 will schedule it)',
        launchDate: '2030-03-01',
        consumablesKg: { o2: 999, water: 999, food: 999 },
        spares: { waterRecycler: 9, o2Generator: 9, co2Scrubber: 9, greenhouse: 9 },
      },
    ],
    baseVehiclePayloadKg: 15_000,
  }
}

const run = (p: MissionPlan, seed = 1) => runOnce(p, mulberry32(seed))

describe('runOnce, all systems online', () => {
  // Hand calculation, 4 crew, 100 days, 90% recovery, electrolysis, 10 m² greenhouse:
  //   water/day = −17.92 + 16.128 − 3.58 × 1.12601 = −5.82312 → day 99: 1000 − 582.31 = 417.69
  //   food/day  = −7.84 + 10 × 0.0392 = −7.448            → day 99: 1000 − 744.80 = 255.20
  //   O₂/day    = −3.58 + 3.58 = 0                         → stays 100
  const p = plan({ greenhouse: { enabled: true, areaM2: 10 } })
  const r = run(p)

  it('matches the hand calculation within 1%', () => {
    expect(r.survived).toBe(true)
    expect(r.stocks.water[99]).toBeGreaterThan(417.69 * 0.99)
    expect(r.stocks.water[99]).toBeLessThan(417.69 * 1.01)
    expect(r.stocks.food[99]).toBeCloseTo(255.2, 6)
    expect(r.stocks.o2[99]).toBeCloseTo(100, 9)
    expect(r.stocks.water[0]).toBeCloseTo(1000 - 5.82312, 4)
  })

  it('records one value per day for every resource', () => {
    for (const series of Object.values(r.stocks)) expect(series).toHaveLength(100)
  })

  it('counts only cargo launched before the start as initial stock', () => {
    expect(r.stocks.spares[0]).toBe(4)
    expect(r.stocks.spares[99]).toBe(4)
  })
})

describe('runOnce, O₂ sources', () => {
  it('tanks: O₂ drains 3.58 kg/day and water pays no electrolysis cost', () => {
    const r = run(plan({ o2Source: 'tanks' }))
    expect(r.stocks.o2[9]).toBeCloseTo(100 - 10 * 3.58, 9)
    expect(r.stocks.water[9]).toBeCloseTo(1000 - 10 * 1.792, 9)
  })

  it('isru: O₂ holds steady and water pays no electrolysis cost', () => {
    const r = run(plan({ o2Source: 'isru' }))
    expect(r.stocks.o2[49]).toBeCloseTo(100, 9)
    expect(r.stocks.water[49]).toBeCloseTo(1000 - 50 * 1.792, 9)
  })

  it('electrolysis: costs 1.126 kg water per kg O₂', () => {
    const rates = dailyRates(plan())
    expect(rates.o2WaterCostKg / rates.o2ProducedKg).toBeCloseTo(1.126, 3)
  })
})

describe('runOnce, stock-outs', () => {
  it('fails on the day a stock goes negative and records the resource', () => {
    // 36.8 kg O₂ at 3.58 kg/day: 1.0 kg left after day 9, −2.58 on day 10.
    const r = run(plan({ o2Source: 'tanks' }, { o2: 36.8 }))
    expect(r.survived).toBe(false)
    expect(r.failure).toEqual({ kind: 'stockout', resource: 'o2', day: 10 })
    expect(r.stocks.o2[9]).toBeCloseTo(1, 9)
    expect(r.stocks.o2[10]).toBe(0)
    expect(r.stocks.o2[99]).toBe(0)
  })

  it('reports water when the recycler cannot keep up', () => {
    // 5.82312 kg/day net → 100 kg lasts through day 16 (1.01 kg left), fails on day 17.
    const r = run(plan({}, { water: 100 }))
    expect(r.failure).toEqual({ kind: 'stockout', resource: 'water', day: 17 })
  })
})

describe('runOnce, purity and speed', () => {
  it('is deterministic and does not mutate the plan', () => {
    const p = plan()
    const before = JSON.stringify(p)
    expect(run(p, 7)).toEqual(run(p, 7))
    expect(JSON.stringify(p)).toBe(before)
  })

  it('runs a 900-day mission in under 1 ms (averaged over 1,000 runs)', () => {
    const p = plan({}, { water: 100_000, food: 100_000 }, 900)
    const rng = mulberry32(1)
    const start = performance.now()
    for (let i = 0; i < 1000; i++) runOnce(p, rng)
    expect((performance.now() - start) / 1000).toBeLessThan(1)
  })
})
