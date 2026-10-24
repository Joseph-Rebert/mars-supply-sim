import { describe, expect, it } from 'vitest'
import { crewStatus } from './crewStatus'
import { fakePlan } from './fake'
import { mulberry32 } from './rng'
import { quantile, runMission, runOnce } from './sim'
import type { FailureCause, SimResult } from './types'

function result(runs: number, failures: FailureCause[]): SimResult {
  return {
    runs,
    seed: 1,
    survivalRate: 1 - failures.length / runs,
    durationDays: 900,
    bands: {} as SimResult['bands'],
    failures,
    arrivals: [],
    totalLaunchMassKg: 0,
  }
}

const unfit = (crewId: string, driver?: string): FailureCause => ({
  kind: 'crewUnfit',
  day: 500,
  crewId,
  driver,
})

describe('crewStatus', () => {
  it('is nominal when the person never becomes unfit', () => {
    const r = result(100, [{ kind: 'stockout', resource: 'water', day: 300 }, unfit('c2')])
    expect(crewStatus(r, 'c1')).toEqual({ unfitShare: 0, tone: 'nominal', driver: undefined })
  })

  it('turns amber from 5% of runs and red from 20%, naming the main driver', () => {
    const amber = result(100, [
      ...Array.from({ length: 4 }, () => unfit('c1', 'boneLoss')),
      unfit('c1', 'scurvy'),
    ])
    expect(crewStatus(amber, 'c1')).toEqual({
      unfitShare: 0.05,
      tone: 'caution',
      driver: 'bone loss',
    })

    const red = result(
      100,
      Array.from({ length: 20 }, () => unfit('c1', 'scurvy')),
    )
    expect(crewStatus(red, 'c1')).toMatchObject({ tone: 'critical', driver: 'scurvy (vitamin C)' })
    expect(
      crewStatus(
        result(
          100,
          Array.from({ length: 4 }, () => unfit('c1')),
        ),
        'c1',
      ).tone,
    ).toBe('nominal')
  })
})

describe('runMission crewBody', () => {
  it('reports each crew member’s median end-of-run bone, muscle and mass loss', () => {
    const plan = fakePlan()
    const runs = 51
    const sim = runMission(plan, { runs, seed: 3 })
    // Same seeded stream as runMission, run by run.
    const rng = mulberry32(3)
    const bone: number[] = []
    for (let i = 0; i < runs; i++) bone.push(runOnce(plan, rng).body!.c1.boneLossPct)
    bone.sort((a, b) => a - b)

    expect(Object.keys(sim.crewBody!)).toEqual(plan.crew.map((m) => m.id))
    expect(sim.crewBody!.c1.boneLossPct).toBeCloseTo(quantile(bone, 0.5), 9)
    expect(sim.crewBody!.c1.boneLossPct).toBeGreaterThan(0)
    expect(sim.crewBody!.c1.muscleLossPct).toBeGreaterThan(0)
  })
})
