import { describe, expect, it } from 'vitest'
import { mulberry32 } from './rng'
import { arrivalDay, dailyRates, runOnce } from './sim'
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
        // Best date of the 2028 window: lands 2029-07-19, before the 2030-01-01 start.
        launchDate: '2028-12-11',
        consumablesKg: { o2: 100, water: 1000, food: 1000, ...stock },
        spares: { waterRecycler: 2, o2Generator: 1, co2Scrubber: 1, greenhouse: 0 },
      },
      {
        id: 'f2',
        // Mars: lands 2030-09-02 (day 244), after a 100-day mission. Moon: lands day 62.
        label: 'Lands after the mission ends (Mars)',
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

  it('counts only cargo landed by the start as initial stock', () => {
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

describe('runOnce, destination profiles', () => {
  const onMoon = (p: MissionPlan): MissionPlan => ({ ...p, destination: 'moon' })

  it('same ISRU plan: O₂ holds on Mars, but lunar regolith O₂ falls short', () => {
    // Moon: 1000/365 = 2.739726 kg/day vs 3.58 demand → −0.840274 kg/day.
    // 50 kg lasts 59 days (0.42 kg left after day 58), runs out on day 59.
    const p = plan({ o2Source: 'isru' }, { o2: 50 })
    const mars = run(p)
    const moon = run(onMoon(p))
    expect(mars.survived).toBe(true)
    expect(mars.stocks.o2[99]).toBeCloseTo(50, 9)
    expect(moon.stocks.o2[0]).toBeCloseTo(50 - 0.840274, 6)
    expect(moon.failure).toEqual({ kind: 'stockout', resource: 'o2', day: 59 })
  })

  it('halves greenhouse output through the lunar night', () => {
    const p = plan({ greenhouse: { enabled: true, areaM2: 10 } })
    expect(dailyRates(onMoon(p)).greenhouseFoodKg).toBeCloseTo(
      dailyRates(p).greenhouseFoodKg / 2,
      9,
    )
  })

  it('leaves electrolysis and tanks unchanged between destinations', () => {
    for (const o2Source of ['electrolysis', 'tanks'] as const) {
      const p = plan({ o2Source })
      expect(dailyRates(onMoon(p))).toEqual(dailyRates(p))
    }
  })
})

describe('runOnce, resupply arrivals', () => {
  // 4 crew eat 7.84 kg food/day. 3,137 kg lasts through day 399 (1.0 kg left), runs out on day 400.
  const starving = (flights: MissionPlan['flights'] = []): MissionPlan => {
    const p = plan({}, { food: 3137, water: 5000 }, 500)
    return { ...p, destination: 'moon', flights: [p.flights[0], ...flights] }
  }
  const foodFlight = (launchDate: string, food = 1000): MissionPlan['flights'][number] => ({
    id: 'resupply',
    label: 'Food',
    launchDate,
    consumablesKg: { o2: 0, water: 0, food },
    spares: { waterRecycler: 1, o2Generator: 0, co2Scrubber: 0, greenhouse: 0 },
  })

  it('starves on day 400 without resupply', () => {
    expect(run(starving()).failure).toEqual({ kind: 'stockout', resource: 'food', day: 400 })
  })

  it('survives when food lands on day 390 (Moon: launch day 387 + 3-day transit)', () => {
    const r = run(starving([foodFlight('2031-01-23')]))
    expect(r.survived).toBe(true)
    // Food jumps by 1,000 kg on day 390; one spare arrives with it.
    expect(r.stocks.food[390] - r.stocks.food[389]).toBeCloseTo(1000 - 7.84, 6)
    expect(r.stocks.spares[389]).toBe(4)
    expect(r.stocks.spares[390]).toBe(5)
  })

  it('still starves if the same food lands after day 400', () => {
    const r = run(starving([foodFlight('2031-02-07')])) // lands day 405
    expect(r.failure).toEqual({ kind: 'stockout', resource: 'food', day: 400 })
  })

  it('lands Mars cargo on the transfer-table arrival date', () => {
    // 2028-12-11 → 2029-07-19 (220 d); a mission starting 2029-01-01 sees it on day 199.
    const p = { ...plan(), startDate: '2029-01-01', durationDays: 300 }
    expect(arrivalDay(p, p.flights[0])).toBe(199)
    expect(arrivalDay(p, { ...p.flights[0], launchDate: '2030-03-01' })).toBeNull()
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
