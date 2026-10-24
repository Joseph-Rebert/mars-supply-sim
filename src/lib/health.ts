// Body health (GEA-23): bone, muscle, body mass and vitamin C status per crew member, a 0–100 health
// score for the crew cards, and the severe states that make someone medically unfit (a failure cause).

import type { CrewProfile } from './crew'
import {
  BODY_MASS_LOSS_UNFIT_PCT,
  BONE_LOSS_NUTRIENT_SHORT_MULTIPLIER,
  BONE_LOSS_PCT_PER_DAY_0G,
  BONE_LOSS_UNFIT_PCT,
  BONE_LOSS_WITH_EXERCISE_FRACTION,
  CALCIUM_SEVERE_SHORT_FRACTION,
  EXERCISE_FULL_COUNTERMEASURE_MIN,
  KCAL_PER_KG_BODY_MASS,
  MUSCLE_LOSS_LEVEL_OFF_DAYS,
  MUSCLE_LOSS_PCT_PER_DAY_EXERCISING,
  MUSCLE_LOSS_PCT_PER_DAY_NO_EXERCISE,
  MUSCLE_LOSS_PROTEIN_SHORT_MULTIPLIER,
  UNLOADING_EXPONENT,
  VITAMIN_C_POOL_MAX_MG,
  VITAMIN_C_POOL_TURNOVER_PER_DAY,
  VITAMIN_C_SCURVY_POOL_MG,
} from './data'
import type { NutritionTracker } from './diet'
import { NUTRIENT_KEYS, type BodyState } from './types'

export type UnfitDriver = 'boneLoss' | 'scurvy' | 'bodyMass'

// Imported constants copied to module locals: the step() loop runs for every crew member, every day of
// every Monte Carlo run, and some loaders (Vitest) turn each imported name into a property lookup.
const BONE_SHORT_X = BONE_LOSS_NUTRIENT_SHORT_MULTIPLIER
const CA_SEVERE = CALCIUM_SEVERE_SHORT_FRACTION
const PROTEIN_SHORT_X = MUSCLE_LOSS_PROTEIN_SHORT_MULTIPLIER
const MUSCLE_TAU = MUSCLE_LOSS_LEVEL_OFF_DAYS
const KCAL_PER_KG = KCAL_PER_KG_BODY_MASS
const VC_MAX = VITAMIN_C_POOL_MAX_MG
const VC_KEEP = 1 - VITAMIN_C_POOL_TURNOVER_PER_DAY
const VC_SCURVY = VITAMIN_C_SCURVY_POOL_MG
const BONE_UNFIT = BONE_LOSS_UNFIT_PCT
const MASS_UNFIT = BODY_MASS_LOSS_UNFIT_PCT

const N = NUTRIENT_KEYS.length
const ENERGY = NUTRIENT_KEYS.indexOf('energyKcal')
const PROTEIN = NUTRIENT_KEYS.indexOf('proteinG')
const VITAMIN_C = NUTRIENT_KEYS.indexOf('vitaminCMg')
const VITAMIN_D = NUTRIENT_KEYS.indexOf('vitaminDUg')
const CALCIUM = NUTRIENT_KEYS.indexOf('calciumMg')

// ASSUMPTION: health-score weights (display only; failure uses the clinical thresholds in data.ts).
// Each term is 0 when healthy and its full weight at the scale shown.
const SCORE = {
  bone: { weight: 35, atPct: BONE_LOSS_UNFIT_PCT },
  muscle: { weight: 25, atPct: 30 },
  mass: { weight: 20, atPct: BODY_MASS_LOSS_UNFIT_PCT },
  // Vitamin C: no penalty above a 900 mg pool (UK DH 1991 "safety interval" level), full at scurvy.
  vitaminC: { weight: 20, fromMg: 900, toMg: VITAMIN_C_SCURVY_POOL_MG },
}

const isShort = (got: number, need: number) => got < need * (1 - 1e-6)
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)
const VC_SPAN_MG = SCORE.vitaminC.fromMg - SCORE.vitaminC.toMg

export type HealthTracker = {
  /** Advance one day using what each crew member ate (from the nutrition tracker). */
  step(nutrition: NutritionTracker): void
  /** The first crew member (index) in a severe state, and why, or null. */
  unfit(): { index: number; driver: UnfitDriver } | null
  score(i: number): number
  body(i: number): BodyState
}

export function createHealthTracker(crew: readonly CrewProfile[], gravityG: number): HealthTracker {
  const n = crew.length
  const unloading = Math.max(0, 1 - gravityG) ** UNLOADING_EXPONENT
  const exercise = crew.map((m) =>
    Math.min(1, m.exerciseMinPerDay / EXERCISE_FULL_COUNTERMEASURE_MIN),
  )
  const boneRate = exercise.map(
    (x) => BONE_LOSS_PCT_PER_DAY_0G * (1 - (1 - BONE_LOSS_WITH_EXERCISE_FRACTION) * x) * unloading,
  )
  const muscleRate = exercise.map(
    (x) =>
      (MUSCLE_LOSS_PCT_PER_DAY_NO_EXERCISE +
        (MUSCLE_LOSS_PCT_PER_DAY_EXERCISING - MUSCLE_LOSS_PCT_PER_DAY_NO_EXERCISE) * x) *
      unloading,
  )
  const startMass = crew.map((m) => m.massKg)

  const bone = new Float64Array(n)
  const muscle = new Float64Array(n)
  const massKg = Float64Array.from(startMass)
  const pool = new Float64Array(n).fill(VITAMIN_C_POOL_MAX_MG)

  const massLossPct = (i: number) => (100 * (startMass[i] - massKg[i])) / startMass[i]

  return {
    step(nutrition) {
      const got = nutrition.lastIntake
      const need = nutrition.needs
      for (let i = 0, j = 0; i < n; i++, j += N) {
        const boneShort =
          got[j + CALCIUM] < need[j + CALCIUM] * CA_SEVERE ||
          isShort(got[j + VITAMIN_D], need[j + VITAMIN_D])
        bone[i] += boneRate[i] * (boneShort ? BONE_SHORT_X : 1)
        // Muscle levels off: it relaxes toward rate × τ (a plateau) instead of falling forever.
        const plateau =
          muscleRate[i] *
          MUSCLE_TAU *
          (isShort(got[j + PROTEIN], need[j + PROTEIN]) ? PROTEIN_SHORT_X : 1)
        muscle[i] += (plateau - muscle[i]) / MUSCLE_TAU
        const deficitKcal = need[j + ENERGY] - got[j + ENERGY]
        if (deficitKcal > 0) massKg[i] -= deficitKcal / KCAL_PER_KG
        // First-order turnover of the body pool, refilled by intake, capped at saturation.
        pool[i] = Math.min(VC_MAX, pool[i] * VC_KEEP + got[j + VITAMIN_C])
      }
    },

    unfit() {
      for (let i = 0; i < n; i++) {
        if (pool[i] < VC_SCURVY) return { index: i, driver: 'scurvy' }
        if (bone[i] >= BONE_UNFIT) return { index: i, driver: 'boneLoss' }
        if (massLossPct(i) >= MASS_UNFIT) return { index: i, driver: 'bodyMass' }
      }
      return null
    },

    score(i) {
      return (
        100 -
        SCORE.bone.weight * clamp01(bone[i] / SCORE.bone.atPct) -
        SCORE.muscle.weight * clamp01(muscle[i] / SCORE.muscle.atPct) -
        SCORE.mass.weight * clamp01(massLossPct(i) / SCORE.mass.atPct) -
        SCORE.vitaminC.weight * clamp01((SCORE.vitaminC.fromMg - pool[i]) / VC_SPAN_MG)
      )
    },

    body(i) {
      return {
        boneLossPct: bone[i],
        muscleLossPct: muscle[i],
        massLossPct: massLossPct(i),
        vitaminCPoolMg: pool[i],
      }
    },
  }
}
