import { describe, expect, it } from 'vitest'
import { dailyNeeds, type CrewProfile } from './crew'
import { COMPONENTS, VITAMIN_C_DECAY_PER_DAY } from './data'
import { KCAL_PER_FOOD_KG, MENU_PER_KCAL, storedNutrients } from './diet'
import { fakePlan } from './fake'
import { mulberry32 } from './rng'
import { runMission, runOnce } from './sim'
import { COMPONENT_KEYS, type ComponentKey, type ComponentSpec, type MissionPlan } from './types'

/** CPU time of this test process in ms, so other test files running in parallel don't count. */
declare const process: { cpuUsage(): { user: number; system: number } }
const cpuMs = () => {
  const { user, system } = process.cpuUsage()
  return (user + system) / 1000
}

const UNBREAKABLE = Object.fromEntries(
  COMPONENT_KEYS.map((c) => [c, { ...COMPONENTS[c], mtbfDays: Infinity }]),
) as Record<ComponentKey, ComponentSpec>

const nutritionOf = (plan: MissionPlan) => runOnce(plan, mulberry32(1), UNBREAKABLE).nutrition!

/** Default crew, all food packed on day 0 (fresh) and plenty of it. */
function freshPlan(durationDays: number): MissionPlan {
  const plan = fakePlan()
  plan.durationDays = durationDays
  // Moon: a fixed 3-day transit, so cargo packed 2029-08-29 lands before the crew (start 2029-09-01).
  plan.destination = 'moon'
  plan.flights = [
    {
      ...plan.flights[0],
      launchDate: '2029-08-29',
      consumablesKg: { o2: 1e6, water: 1e6, food: 1e6 },
    },
  ]
  return plan
}

describe('storedNutrients', () => {
  it('decays only vitamin C with shelf age (Cooper et al. 2017)', () => {
    const fresh = storedNutrients(1, 0)
    const year = storedNutrients(1, 365)
    expect(year.vitaminCMg / fresh.vitaminCMg).toBeCloseTo(
      Math.exp(-VITAMIN_C_DECAY_PER_DAY * 365),
      12,
    )
    for (const k of ['energyKcal', 'proteinG', 'vitaminDUg', 'calciumMg', 'potassiumMg'] as const) {
      expect(year[k]).toBe(fresh[k])
    }
    expect(fresh.energyKcal).toBeCloseTo(KCAL_PER_FOOD_KG, 9)
  })
})

describe('nutrition in runOnce', () => {
  it('with fresh food and enough mass there are no deficits (calcium aside, see next test)', () => {
    const plan = freshPlan(60)
    for (const tally of Object.values(nutritionOf(plan))) {
      for (const k of [
        'energyKcal',
        'proteinG',
        'vitaminCMg',
        'vitaminDUg',
        'potassiumMg',
      ] as const) {
        expect(tally[k].daysShort, k).toBe(0)
      }
    }
  })

  it('reproduces the published calcium gap: ISS-style food is ~20–30% short of 1,000 mg', () => {
    // Cooper et al. (2017): calcium in ISS food is "approximately 20% lower than recommended intake levels".
    // Equal-mass menu: calcium per kcal × Reyes's 2,293 kcal ≈ 739 mg → 26% short.
    const reyes = fakePlan().crew[0] as CrewProfile
    const intake = MENU_PER_KCAL.calciumMg * dailyNeeds(reyes).energyKcal
    expect(1 - intake / 1000).toBeGreaterThan(0.2)
    expect(1 - intake / 1000).toBeLessThan(0.3)
    expect(nutritionOf(freshPlan(60))[reyes.id].calciumMg.daysShort).toBe(60)
  })

  it('runs vitamin C short on the hand-calculated day for stored-only food (within 3 years)', () => {
    // Reyes eats MENU_PER_KCAL.vitaminCMg × 2,293 kcal ≈ 125 mg fresh; need 100 mg.
    // Short once e^(−k·age) < 100 / fresh: age > ln(fresh / 100) / k ≈ 285 days. Food packed 3 days pre-start.
    const plan = freshPlan(900)
    const reyes = plan.crew[0] as CrewProfile
    const fresh = MENU_PER_KCAL.vitaminCMg * dailyNeeds(reyes).energyKcal
    const shortAtAge = Math.ceil(Math.log(fresh / 100) / VITAMIN_C_DECAY_PER_DAY)
    const first = nutritionOf(plan)[reyes.id].vitaminCMg.firstShortDay
    expect(first).toBe(shortAtAge - 3)
    expect(first!).toBeLessThan(3 * 365)
  })

  it('turning on the greenhouse visibly reduces vitamin deficits', () => {
    const base = fakePlan()
    const withGreenhouse = fakePlan()
    withGreenhouse.lifeSupport.greenhouse = { enabled: true, areaM2: 20 }
    const totalC = (plan: MissionPlan) =>
      Object.values(nutritionOf(plan)).reduce((s, t) => s + t.vitaminCMg.deficit, 0)
    expect(totalC(base)).toBeGreaterThan(0)
    expect(totalC(withGreenhouse)).toBeLessThan(totalC(base) * 0.5)
  })

  it('is skipped when a crew member has no full profile', () => {
    const plan = fakePlan()
    plan.crew = plan.crew.map(({ heightM: _h, ...rest }) => rest)
    expect(runOnce(plan, mulberry32(1)).nutrition).toBeUndefined()
  })

  it('keeps Monte Carlo under 2 s for 1,000 runs of the 900-day plan', () => {
    const plan = fakePlan()
    runMission(plan, { runs: 300, seed: 1 }) // warm up: let V8 finish optimizing before timing
    const start = cpuMs()
    runMission(plan, { runs: 1000, seed: 1 })
    expect(cpuMs() - start).toBeLessThan(2000)
  })
})
