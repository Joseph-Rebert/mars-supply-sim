import { describe, expect, it } from 'vitest'
import { crewFoodKgPerDay, dailyNeeds, energyKcalPerDay, type CrewProfile } from './crew'
import {
  CREW_ENERGY_MJ_RANGE,
  CREW_MASS_KG_RANGE,
  FOOD_KCAL_PER_CREW_DAY,
  FOOD_KG_PER_CREW_DAY,
  KJ_PER_KCAL,
} from './data'
import { fakePlan } from './fake'
import { CREW_ROSTER } from './plan'
import { dailyRates } from './sim'

const mj = (kcal: number) => (kcal * KJ_PER_KCAL) / 1000

/** BVAD Rev2 p.107: the mean astronaut used for NASA's food energy requirement. */
const MEAN_ASTRONAUT: CrewProfile = {
  id: 'mean',
  name: 'Mean astronaut',
  sex: 'male',
  ageYears: 45,
  massKg: 82.4,
  heightM: 1.786,
  activity: 'moderate',
  exerciseMinPerDay: 90,
}

describe('energyKcalPerDay (NASA EER, BVAD Rev2 Eq. 3-2/3-3)', () => {
  it('reproduces NASA’s 12.707 MJ/CM-d requirement for the mean astronaut, within 0.1%', () => {
    // 622 − 9.53 × 45 + 1.25 × (15.9 × 82.4 + 539.6 × 1.786) = 3,035.5 kcal = 12.700 MJ
    expect(energyKcalPerDay(MEAN_ASTRONAUT)).toBeCloseTo(3035.5, 0)
    expect(Math.abs(mj(energyKcalPerDay(MEAN_ASTRONAUT)) / 12.707 - 1)).toBeLessThan(0.001)
  })

  it('uses the female equation (Eq. 3-3)', () => {
    // 354 − 6.91 × 45 + 1.25 × (9.36 × 82.4 + 726 × 1.786) = 43.05 + 2,584.87 = 2,627.9 kcal
    const female = { ...MEAN_ASTRONAUT, sex: 'female' as const }
    expect(energyKcalPerDay(female)).toBeCloseTo(2627.9, 0)
  })

  it('rises with activity level', () => {
    const at = (activity: CrewProfile['activity']) =>
      energyKcalPerDay({ ...MEAN_ASTRONAUT, activity })
    expect(at('light')).toBeLessThan(at('moderate'))
    expect(at('moderate')).toBeLessThan(at('heavy'))
  })
})

describe('dailyNeeds', () => {
  const needs = dailyNeeds(MEAN_ASTRONAUT)

  it('sets protein at 12% of energy (4 kcal/g)', () => {
    expect(needs.proteinG).toBeCloseTo((3035.5 * 0.12) / 4, 0) // ≈ 91 g
  })

  it('uses NASA micronutrient goals (BVAD Table 4-57)', () => {
    expect(needs).toMatchObject({
      vitaminCMg: 100,
      vitaminDUg: 10,
      calciumMg: 1000,
      potassiumMg: 3500,
    })
  })

  it('scales food mass by energy at the BVAD density (1.96 kg ↔ 3,054 kcal)', () => {
    expect(needs.foodKg).toBeCloseTo((3035.5 / FOOD_KCAL_PER_CREW_DAY) * FOOD_KG_PER_CREW_DAY, 3)
    expect(needs.foodKg).toBeCloseTo(1.948, 3)
  })
})

describe('default crew', () => {
  // Mass: BVAD Table 3-21 design limits. Energy: no published BVAD range exists, so we bound it by the
  // 2,000 kcal reference diet (Table 4-57) and the 18 MJ exceptionally-active ceiling (p.44).
  it('falls in the published BVAD ranges for body mass and daily energy', () => {
    for (const m of CREW_ROSTER) {
      expect(m.heightM).toBeDefined()
      expect(m.massKg).toBeGreaterThanOrEqual(CREW_MASS_KG_RANGE.min)
      expect(m.massKg).toBeLessThanOrEqual(CREW_MASS_KG_RANGE.max)
      const e = mj(energyKcalPerDay(m as CrewProfile))
      expect(e).toBeGreaterThanOrEqual(CREW_ENERGY_MJ_RANGE.min)
      expect(e).toBeLessThanOrEqual(CREW_ENERGY_MJ_RANGE.max)
    }
  })
})

describe('crewFoodKgPerDay and the daily model', () => {
  it('sums personal food needs when every member has a profile', () => {
    const crew = fakePlan().crew
    const expected = crew.reduce((s, m) => s + dailyNeeds(m as CrewProfile).foodKg, 0)
    expect(crewFoodKgPerDay(crew)).toBeCloseTo(expected, 12)
    expect(dailyRates(fakePlan()).consumeKg.food).toBeCloseTo(expected, 12)
  })

  it('falls back to the BVAD flat rate if anyone lacks a profile', () => {
    const plan = fakePlan()
    plan.crew = plan.crew.map(({ heightM: _h, ...rest }) => rest)
    expect(crewFoodKgPerDay(plan.crew)).toBeNull()
    expect(dailyRates(plan).consumeKg.food).toBeCloseTo(4 * FOOD_KG_PER_CREW_DAY, 12)
  })
})
