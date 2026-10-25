import { describe, expect, it } from 'vitest'
import { describeFailure, weakestLink } from './analysis'
import type { CrewProfile } from './crew'
import {
  BONE_LOSS_PCT_PER_DAY_0G,
  COMPONENTS,
  KCAL_PER_KG_BODY_MASS,
  NASA_BONE_LOSS_LIMIT_PCT,
} from './data'
import type { NutritionTracker } from './diet'
import { fakePlan } from './fake'
import { createHealthTracker } from './health'
import { mulberry32 } from './rng'
import { runMission, runOnce } from './sim'
import {
  COMPONENT_KEYS,
  NUTRIENT_KEYS,
  type ComponentKey,
  type ComponentSpec,
  type MissionPlan,
} from './types'

const UNBREAKABLE = Object.fromEntries(
  COMPONENT_KEYS.map((c) => [c, { ...COMPONENTS[c], mtbfDays: Infinity }]),
) as Record<ComponentKey, ComponentSpec>

const MEMBER: CrewProfile = {
  id: 'a',
  name: 'A',
  sex: 'female',
  ageYears: 40,
  massKg: 70,
  heightM: 1.7,
  activity: 'moderate',
  exerciseMinPerDay: 90,
}

/** A nutrition tracker stand-in: the given intake and need for one crew member, every day. */
function fixedNutrition(intake: number[], need: number[]): NutritionTracker {
  return {
    lastIntake: Float64Array.from(intake),
    needs: Float64Array.from(need),
    deliver: () => {},
    eat: () => {},
    result: () => ({}),
  }
}

const NEED = NUTRIENT_KEYS.map(() => 100)
const ENOUGH = fixedNutrition(NEED, NEED)

function stepDays(tracker: ReturnType<typeof createHealthTracker>, days: number, n = ENOUGH) {
  for (let d = 0; d < days; d++) tracker.step(n)
}

describe('createHealthTracker (hand-calculated rates)', () => {
  it('loses bone at LeBlanc’s rate × 25% with full exercise × (1 − 0.38 g) on Mars', () => {
    // 100 days × (1.06 / 30.4375) %/day × 0.25 × 0.62 = 0.5398%
    const h = createHealthTracker([MEMBER], 0.38)
    stepDays(h, 100)
    expect(h.body(0).boneLossPct).toBeCloseTo(100 * BONE_LOSS_PCT_PER_DAY_0G * 0.25 * 0.62, 9)
    expect(h.body(0).boneLossPct).toBeCloseTo(0.5398, 3)
  })

  it('loses more bone without exercise and in lower gravity', () => {
    const at = (exerciseMinPerDay: number, g: number) => {
      const h = createHealthTracker([{ ...MEMBER, exerciseMinPerDay }], g)
      stepDays(h, 100)
      return h.body(0).boneLossPct
    }
    expect(at(0, 0.38)).toBeCloseTo(at(90, 0.38) * 4, 9) // no countermeasure: 4× the 25% rate
    expect(at(90, 0.16)).toBeGreaterThan(at(90, 0.38))
  })

  it('takes 1 kg of body mass per 7,700 kcal of deficit (Hall 2008)', () => {
    const energy = NUTRIENT_KEYS.indexOf('energyKcal')
    const intake = [...NEED]
    intake[energy] = 100 - KCAL_PER_KG_BODY_MASS / 70 // 1/70 kg a day for 70 days → 1 kg of 70 kg
    const h = createHealthTracker([MEMBER], 0.38)
    stepDays(h, 70, fixedNutrition(intake, NEED))
    expect(h.body(0).massLossPct).toBeCloseTo(100 / 70, 9)
  })

  it('drains the vitamin C pool at 2.7%/day to scurvy (< 300 mg) in ~59 days on zero intake', () => {
    // 1,500 × 0.973^n < 300 → n > ln(0.2) / ln(0.973) = 58.8 → day 59.
    const c = NUTRIENT_KEYS.indexOf('vitaminCMg')
    const intake = [...NEED]
    intake[c] = 0
    const h = createHealthTracker([MEMBER], 0.38)
    stepDays(h, 58, fixedNutrition(intake, NEED))
    expect(h.unfit()).toBeNull()
    stepDays(h, 1, fixedNutrition(intake, NEED))
    expect(h.unfit()).toEqual({ index: 0, driver: 'scurvy' })
  })

  it('levels muscle loss off instead of extrapolating linearly', () => {
    const h = createHealthTracker([MEMBER], 0.38)
    stepDays(h, 900)
    // Plateau = (13/180 %/day) × 0.62 × 180 days ≈ 8.06%.
    expect(h.body(0).muscleLossPct).toBeLessThan(13 * 0.62 + 1e-9)
    expect(h.body(0).muscleLossPct).toBeGreaterThan(7.5)
  })
})

describe('health in the Monte Carlo', () => {
  it('exposes a P10/P50/P90 health band per crew member for the roster sparklines', () => {
    const plan = fakePlan()
    const result = runMission(plan, { runs: 200, seed: 1 })
    expect(Object.keys(result.crewHealth!)).toEqual(plan.crew.map((m) => m.id))
    for (const band of Object.values(result.crewHealth!)) {
      expect(band.p50).toHaveLength(plan.durationDays)
      for (let d = 0; d < plan.durationDays; d++) {
        expect(band.p10[d]).toBeLessThanOrEqual(band.p50[d])
        expect(band.p50[d]).toBeLessThanOrEqual(band.p90[d])
        expect(band.p90[d]).toBeLessThanOrEqual(100)
      }
    }
  })

  it('reports "crew medically unfit" as a failure cause (no exercise, long Moon stay)', () => {
    const plan: MissionPlan = {
      ...fakePlan(),
      destination: 'moon',
      crew: fakePlan().crew.map((m) => ({ ...m, exerciseMinPerDay: 0 })),
    }
    const result = runMission(plan, { runs: 50, seed: 1, components: UNBREAKABLE })
    const unfit = result.failures.filter((f) => f.kind === 'crewUnfit')
    expect(unfit.length).toBeGreaterThan(0)
    expect(unfit[0]).toMatchObject({ kind: 'crewUnfit', driver: 'boneLoss' })
    expect(describeFailure(unfit[0])).toContain('bones weakened to twice NASA')
    expect(weakestLink(result).sentence).toContain('bones get too weak')
  })

  it('keeps an exercise-heavy, well-fed crew healthy for 30 months on Mars', () => {
    const plan: MissionPlan = {
      ...fakePlan(),
      durationDays: 913,
      crew: fakePlan().crew.map((m) => ({ ...m, exerciseMinPerDay: 120 })),
      lifeSupport: { ...fakePlan().lifeSupport, greenhouse: { enabled: true, areaM2: 30 } },
    }
    plan.flights[0].consumablesKg = { o2: 1e5, water: 1e5, food: 1e5 }
    const r = runOnce(plan, mulberry32(1), UNBREAKABLE)
    expect(r.survived).toBe(true)
    for (const id of plan.crew.map((m) => m.id)) {
      expect(r.body![id].boneLossPct).toBeLessThan(NASA_BONE_LOSS_LIMIT_PCT)
      expect(r.healthScore![id].at(-1)!).toBeGreaterThan(70)
    }
  })
})
