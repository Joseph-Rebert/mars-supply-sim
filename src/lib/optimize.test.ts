import { describe, expect, it } from 'vitest'
import { LAUNCH_COST_USD } from './data'
import { fakePlan } from './fake'
import { cargoArrivals, overCapacityFlights } from './manifest'
import {
  DEFAULT_OPTIMIZE_OPTIONS,
  optimizeMission,
  optimizeMissionSync,
  poissonQuantile,
  survivalOf,
  type MissionSpec,
} from './optimize'
import { runMission } from './sim'
import { COMPONENT_KEYS, CONSUMABLE_KEYS, type MissionPlan } from './types'

const SLOW = 60_000

function spec(destination: MissionSpec['destination'], targetSurvival = 0.95): MissionSpec {
  const base = fakePlan()
  return {
    name: 'Optimized',
    destination,
    startDate: base.startDate,
    durationDays: base.durationDays,
    crew: base.crew,
    lifeSupport: base.lifeSupport,
    targetSurvival,
  }
}

describe('poissonQuantile', () => {
  it('returns the smallest n with P(N ≤ n) ≥ q', () => {
    // λ = 1: P(0) = 0.368, P(≤1) = 0.736, P(≤2) = 0.920, P(≤3) = 0.981.
    expect(poissonQuantile(1, 0.9)).toBe(2)
    expect(poissonQuantile(1, 0.95)).toBe(3)
    expect(poissonQuantile(0, 0.99)).toBe(0)
  })
})

describe('optimizeMission (Mars, 95% target)', () => {
  const s = spec('mars')
  let result: ReturnType<typeof optimizeMissionSync>

  it(
    'reaches the target at the full run count, within every mass limit',
    () => {
      result = optimizeMissionSync(s)
      expect(result.reachedTarget).toBe(true)
      expect(result.survivalRate).toBeGreaterThanOrEqual(s.targetSurvival)
      // Same number the results view will show for this plan.
      expect(runMission(result.plan).survivalRate).toBe(result.survivalRate)
      expect(overCapacityFlights(result.plan)).toEqual([])
      // Starting cargo lands before the crew does.
      expect(cargoArrivals(result.plan)[0].arrivalDay).toBeLessThanOrEqual(0)
    },
    SLOW,
  )

  it('costs one Falcon Heavy per flight and beats the hand-made Draft plan', () => {
    expect(result.costUsd).toBe(result.launches * LAUNCH_COST_USD)
    const draft = fakePlan()
    expect(result.launches).toBeLessThanOrEqual(draft.flights.length)
    expect(result.survivalRate).toBeGreaterThan(runMission(draft).survivalRate)
  })

  it(
    'has no obvious waste: removing any one line item drops it below the search bar',
    () => {
      const { searchRuns, seed, noiseGuard } = DEFAULT_OPTIMIZE_OPTIONS
      const bar = s.targetSurvival + noiseGuard
      const removals: MissionPlan[] = []
      result.plan.flights.forEach((f, i) => {
        const withFlight = (patch: Partial<typeof f>): MissionPlan => ({
          ...result.plan,
          flights: result.plan.flights.map((g, j) => (j === i ? { ...g, ...patch } : g)),
        })
        for (const c of COMPONENT_KEYS) {
          if (f.spares[c] > 0)
            removals.push(withFlight({ spares: { ...f.spares, [c]: f.spares[c] - 1 } }))
        }
        for (const r of CONSUMABLE_KEYS) {
          const cut = Math.floor(f.consumablesKg[r] * 0.1)
          if (cut >= 1) {
            removals.push(
              withFlight({ consumablesKg: { ...f.consumablesKg, [r]: f.consumablesKg[r] - cut } }),
            )
          }
        }
      })
      expect(removals.length).toBeGreaterThan(0)
      for (const plan of removals) expect(survivalOf(plan, searchRuns, seed)).toBeLessThan(bar)
    },
    SLOW,
  )
})

describe('optimizeMission (Moon) and progress', () => {
  it(
    'plans the Moon too, and reports progress phases ending in verify',
    () => {
      const it = optimizeMission(spec('moon'))
      const phases = new Set<string>()
      let step = it.next()
      while (!step.done) {
        phases.add(step.value.phase)
        expect(step.value.done).toBeLessThanOrEqual(step.value.total)
        step = it.next()
      }
      expect([...phases]).toEqual(['search', 'trim', 'verify'])
      expect(step.value.reachedTarget).toBe(true)
      expect(step.value.survivalRate).toBeGreaterThanOrEqual(0.95)
      expect(overCapacityFlights(step.value.plan)).toEqual([])
    },
    SLOW,
  )
})
