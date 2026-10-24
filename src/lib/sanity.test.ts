// End-to-end sanity checks for the numbers we show on stage (GEA-24).
// Run alone with `npm run test:sanity`; they also run as part of `npm test`.

import { describe, expect, it } from 'vitest'
import { COMPONENTS, CREW_NEEDS_KG_PER_CREW_DAY } from './data'
import { fakePlan } from './fake'
import { runMission, runOnce } from './sim'
import {
  COMPONENT_KEYS,
  RESOURCE_KEYS,
  type ComponentKey,
  type ComponentSpec,
  type MissionPlan,
} from './types'

/** CPU time of this test process in ms, so other test files running in parallel don't count. */
declare const process: { cpuUsage(): { user: number; system: number } }
const cpuMs = () => {
  const { user, system } = process.cpuUsage()
  return (user + system) / 1000
}

/** Same hardware as data.ts, but nothing ever breaks (MTBF = ∞ → daily failure probability 0). */
const UNBREAKABLE = Object.fromEntries(
  COMPONENT_KEYS.map((c) => [c, { ...COMPONENTS[c], mtbfDays: Infinity }]),
) as Record<ComponentKey, ComponentSpec>

const RUNS = { runs: 300, seed: 1 }

/** The default plan with every flight's spares multiplied by `factor`. */
function withSpares(plan: MissionPlan, factor: number): MissionPlan {
  return {
    ...plan,
    flights: plan.flights.map((f) => ({
      ...f,
      spares: Object.fromEntries(COMPONENT_KEYS.map((c) => [c, f.spares[c] * factor])) as Record<
        ComponentKey,
        number
      >,
    })),
  }
}

describe('sanity: no failures + enough supplies → 100% survival', () => {
  it('survives every run on Mars and the Moon', () => {
    for (const destination of ['mars', 'moon'] as const) {
      const plan = { ...fakePlan(), destination }
      plan.flights[0].consumablesKg = { o2: 1e6, water: 1e6, food: 1e6 }
      const result = runMission(plan, { ...RUNS, components: UNBREAKABLE })
      expect(result.survivalRate).toBe(1)
      expect(result.failures).toEqual([])
    }
  })
})

describe('sanity: no water recycling + only the starting water', () => {
  it('runs out of water on the hand-calculated day, in every run', () => {
    // 4 crew × 4.48 kg/day (BVAD Rev2 Table 4-20) = 17.92 kg/day, no recovery, O₂ from tanks
    // (so electrolysis uses no water). 1,000 kg lasts through day 54 (14.4 kg left), empty on day 55.
    const plan = fakePlan()
    plan.lifeSupport = { ...plan.lifeSupport, waterRecoveryRate: 0, o2Source: 'tanks' }
    plan.flights = [
      {
        ...plan.flights[0],
        consumablesKg: { o2: 1e6, water: 1000, food: 1e6 },
      },
    ]
    expect(plan.crew.length * CREW_NEEDS_KG_PER_CREW_DAY.water).toBeCloseTo(17.92, 9)

    const result = runMission(plan, RUNS)
    expect(result.survivalRate).toBe(0)
    for (const f of result.failures) expect(f).toMatchObject({ resource: 'water', day: 55 })
    expect(result.bands.water.p50[54]).toBeCloseTo(1000 - 55 * 17.92, 6)
  })
})

describe('sanity: MTBF of infinity → identical to the deterministic model', () => {
  it('collapses every band onto the single no-failure run', () => {
    const plan = fakePlan()
    const result = runMission(plan, { ...RUNS, components: UNBREAKABLE })
    const deterministic = runOnce(plan, () => 0.5, UNBREAKABLE)
    for (const k of RESOURCE_KEYS) {
      expect(result.bands[k].p10).toEqual(deterministic.stocks[k])
      expect(result.bands[k].p50).toEqual(deterministic.stocks[k])
      expect(result.bands[k].p90).toEqual(deterministic.stocks[k])
    }
    expect(deterministic.componentEvents).toEqual([])
  })
})

describe('sanity: doubling spares never lowers survival', () => {
  // The two plans draw different random streams once their spares diverge, so compare at 1,000
  // runs and allow 1 percentage point of Monte Carlo noise (standard error ≤ 1.6 pp).
  // At seed 1: Mars 57.2% → 98.8%, Moon 75.8% → 99.9%, 3 crew @ 98% 73.4% → 99.5%.
  const NOISE = 0.01
  const cases: [string, MissionPlan][] = [
    ['default Mars plan', fakePlan()],
    ['default plan on the Moon', { ...fakePlan(), destination: 'moon' }],
    [
      'default plan, 3 crew, 98% water recovery',
      {
        ...fakePlan(),
        crew: fakePlan().crew.slice(0, 3),
        lifeSupport: { ...fakePlan().lifeSupport, waterRecoveryRate: 0.98 },
      },
    ],
  ]
  for (const [name, plan] of cases) {
    it(name, () => {
      const base = runMission(plan, { runs: 1000, seed: 1 }).survivalRate
      const doubled = runMission(withSpares(plan, 2), { runs: 1000, seed: 1 }).survivalRate
      expect(doubled).toBeGreaterThanOrEqual(base - NOISE)
    })
  }

  it('and is a big win on the default plan (the demo story)', () => {
    const base = runMission(fakePlan(), { runs: 1000, seed: 1 }).survivalRate
    const doubled = runMission(withSpares(fakePlan(), 2), { runs: 1000, seed: 1 }).survivalRate
    expect(doubled - base).toBeGreaterThan(0.2)
  })
})

describe('sanity: same seed → identical result', () => {
  it('repeats exactly, and a different seed differs', () => {
    const plan = fakePlan()
    const a = runMission(plan, RUNS)
    expect(runMission(plan, RUNS)).toEqual(a)
    expect(runMission(plan, { ...RUNS, seed: 2 }).failures).not.toEqual(a.failures)
  })
})

describe('sanity: performance', () => {
  it('runs 1,000 runs of a 900-day mission in under 1 s', () => {
    const plan = fakePlan()
    expect(plan.durationDays).toBe(900)
    runMission(plan, { runs: 300, seed: 1 }) // warm up: let V8 finish optimizing before timing
    const start = cpuMs()
    runMission(plan, { runs: 1000, seed: 1 })
    expect(cpuMs() - start).toBeLessThan(1000)
  })
})
