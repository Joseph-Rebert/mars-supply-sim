// Per-person daily needs from each crew member's body (Crew Diet & Health, GEA-17).

import {
  ACTIVITY_FACTOR,
  CALCIUM_MG_PER_DAY,
  EER_FEMALE,
  EER_MALE,
  FOOD_KCAL_PER_CREW_DAY,
  FOOD_KG_PER_CREW_DAY,
  KCAL_PER_G_PROTEIN,
  POTASSIUM_MG_PER_DAY,
  PROTEIN_ENERGY_FRACTION_MIN,
  VITAMIN_C_MG_PER_DAY,
  VITAMIN_D_UG_PER_DAY,
} from './data'
import type { CrewMember, DailyNeeds } from './types'

/** A crew member with everything the energy equation needs. */
export type CrewProfile = CrewMember & { heightM: number }

export function hasFullProfile(member: CrewMember): member is CrewProfile {
  return member.heightM !== undefined
}

/**
 * Estimated energy requirement, kcal/day: NASA's EER equations (BVAD Rev2 Eq. 3-2/3-3) with the
 * fixed 1.25 activity factor replaced by the member's activity level.
 */
export function energyKcalPerDay(member: CrewProfile): number {
  const c = member.sex === 'male' ? EER_MALE : EER_FEMALE
  const pa = ACTIVITY_FACTOR[member.activity]
  return (
    c.base - c.perYear * member.ageYears + pa * (c.perKg * member.massKg + c.perM * member.heightM)
  )
}

export function dailyNeeds(member: CrewProfile): DailyNeeds {
  const energyKcal = energyKcalPerDay(member)
  return {
    energyKcal,
    proteinG: (energyKcal * PROTEIN_ENERGY_FRACTION_MIN) / KCAL_PER_G_PROTEIN,
    vitaminCMg: VITAMIN_C_MG_PER_DAY,
    vitaminDUg: VITAMIN_D_UG_PER_DAY,
    calciumMg: CALCIUM_MG_PER_DAY,
    potassiumMg: POTASSIUM_MG_PER_DAY,
    // Same energy density as the BVAD flat rate (1.96 kg ↔ 3,054 kcal), scaled to this person.
    foodKg: (energyKcal / FOOD_KCAL_PER_CREW_DAY) * FOOD_KG_PER_CREW_DAY,
  }
}

/** Crew food mass per day from personal needs, or null if anyone lacks a full profile. */
export function crewFoodKgPerDay(crew: readonly CrewMember[]): number | null {
  if (!crew.every(hasFullProfile)) return null
  return crew.reduce((sum, m) => sum + dailyNeeds(m as CrewProfile).foodKg, 0)
}
