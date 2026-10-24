import { describe, expect, it } from 'vitest'
import { mulberry32, type Rng } from './rng'
import { describeFailure } from './analysis'
import { COMPONENTS } from './data'
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

/** Rng that never triggers a failure (every roll is just under 1). */
const neverFails: Rng = () => 0.999999
/** Rng whose first `n` rolls are 0 (forced failures), then never fails. */
function failFirst(n: number): Rng {
  let calls = 0
  return () => (calls++ < n ? 0 : 0.999999)
}

const run = (p: MissionPlan) => runOnce(p, neverFails)

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
    expect(runOnce(p, mulberry32(7))).toEqual(runOnce(p, mulberry32(7)))
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

describe('runOnce, component failures', () => {
  it('matches 1 / MTBF over 10,000 runs, within 5%', () => {
    const p = plan(
      { greenhouse: { enabled: true, areaM2: 10 } },
      { o2: 1e7, water: 1e7, food: 1e7 },
      365,
    )
    p.flights[0].spares = {
      waterRecycler: 1e6,
      o2Generator: 1e6,
      co2Scrubber: 1e6,
      greenhouse: 1e6,
    }
    const rng = mulberry32(42)
    const failures = { waterRecycler: 0, o2Generator: 0, co2Scrubber: 0, greenhouse: 0 }
    const runs = 10_000
    for (let i = 0; i < runs; i++) {
      for (const e of runOnce(p, rng).componentEvents)
        if (e.type === 'failed') failures[e.component]++
    }
    for (const c of Object.keys(failures) as (keyof typeof failures)[]) {
      // Trials = days the component was online when rolled; each failure costs repairDays offline.
      const onlineDays = runs * 365 - failures[c] * COMPONENTS[c].repairDays
      const rate = failures[c] / onlineDays
      expect(Math.abs(rate * COMPONENTS[c].mtbfDays - 1)).toBeLessThan(0.05)
    }
  })

  it('uses a spare and is back online after its repair time', () => {
    // First roll (water recycler, day 0) fails; 2 recycler spares in stock.
    const r = runOnce(plan(), failFirst(1))
    expect(r.componentEvents).toEqual([
      { day: 0, component: 'waterRecycler', type: 'failed', spareUsed: true },
      { day: 1, component: 'waterRecycler', type: 'repaired' },
    ])
    expect(r.stocks.spares[0]).toBe(3)
    // Day 0 has no recovery: 1000 − 17.92 − 4.0311 = 978.05; day 1 is back to −5.82312/day.
    expect(r.stocks.water[0]).toBeCloseTo(978.049, 2)
    expect(r.stocks.water[1]).toBeCloseTo(978.049 - 5.82312, 2)
    expect(r.survived).toBe(true)
  })

  it('stays offline with no spares, drains the resource it supports, and says why', () => {
    const p = plan()
    p.flights[0].spares.waterRecycler = 0
    // Recycler down for good from day 0: water/day = −17.92 − 4.0311 = −21.9512.
    // 1000 kg lasts through day 44 (34.25 kg left) and runs out on day 45.
    const r = runOnce(p, failFirst(1))
    expect(r.componentEvents).toEqual([
      { day: 0, component: 'waterRecycler', type: 'failed', spareUsed: false },
    ])
    expect(r.stocks.water[44]).toBeCloseTo(1000 - 45 * 21.95117, 1)
    expect(r.failure).toEqual({
      kind: 'stockout',
      resource: 'water',
      day: 45,
      offlineComponent: 'waterRecycler',
      awaitingSpare: true,
    })
    expect(describeFailure(r.failure!)).toBe(
      'Water ran out on day 45 because the water recycler was offline with no spares',
    )
  })

  it('fails the mission when the CO₂ scrubber is down past its grace period', () => {
    const p = plan()
    p.flights[0].spares.co2Scrubber = 0
    // Rolls per day: waterRecycler, o2Generator, co2Scrubber. Fail the third roll (scrubber, day 0).
    let calls = 0
    const r = runOnce(p, () => (++calls === 3 ? 0 : 0.999999))
    // Down on days 0, 1, 2, 3 (grace = 3 days) → fails on day 3.
    expect(r.failure).toEqual({ kind: 'systemDown', component: 'co2Scrubber', day: 3 })
    expect(describeFailure(r.failure!)).toContain('CO₂ built up on day 3')
  })

  it('only fails hardware the plan carries (no O₂ generator on tanks, no greenhouse when off)', () => {
    const r = runOnce(plan({ o2Source: 'tanks' }, { o2: 1000 }, 10), () => 0)
    const failed = new Set(r.componentEvents.map((e) => e.component))
    expect(failed).toEqual(new Set(['waterRecycler', 'co2Scrubber']))
  })
})
