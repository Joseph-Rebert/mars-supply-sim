// Diet & nutrients (GEA-21): what the crew actually eats each day, and where they fall short.
// Food mass stays one stock in the sim; this tracks *which* food is eaten (oldest batch first),
// its shelf age, and the nutrients that come with it.

import foodsCache from '../cache/usda-foods.json'
import { dailyNeeds, hasFullProfile } from './crew'
import {
  FOOD_KCAL_PER_CREW_DAY,
  FOOD_KG_PER_CREW_DAY,
  MINERAL_DECAY_PER_DAY,
  VITAMIN_C_DECAY_PER_DAY,
  VITAMIN_D_DECAY_PER_DAY,
  VITAMIN_D_SUPPLEMENT_UG_PER_DAY,
} from './data'
import {
  NUTRIENT_KEYS,
  type CrewMember,
  type DailyNeeds,
  type NutrientKey,
  type NutrientTally,
} from './types'

type Food = (typeof foodsCache.foods)[number]

/** Energy per kg of shipped food at the BVAD density (3,054 kcal ↔ 1.96 kg), so mass stays consistent. */
export const KCAL_PER_FOOD_KG = FOOD_KCAL_PER_CREW_DAY / FOOD_KG_PER_CREW_DAY

/** Nutrient per kcal of an equal-mass mix of foods (energy itself is 1 by definition). */
function perKcal(foods: readonly Food[]): Record<NutrientKey, number> {
  const mean = (k: NutrientKey) => foods.reduce((s, f) => s + f.per100g[k], 0) / foods.length
  const kcal = mean('energyKcal')
  return Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, mean(k) / kcal])) as Record<
    NutrientKey,
    number
  >
}

// ASSUMPTION: the stored menu is an equal mass of each of the 25 USDA foods (usda-foods.json); NASA's menu
// weights per item aren't published. This gives ~125 mg vitamin C and ~740 mg calcium per 2,300 kcal fresh.
export const MENU_PER_KCAL = perKcal(foodsCache.foods)

// ASSUMPTION: greenhouse produce has the nutrient profile of the menu's vegetables (spinach, broccoli,
// green beans), eaten fresh, so no storage loss.
export const GREENHOUSE_PER_KCAL = perKcal(
  foodsCache.foods.filter((f) => f.category === 'vegetable'),
)

/** First-order loss rate per day of shelf age, per nutrient (data.ts, Cooper et al. 2017). */
const DECAY_PER_DAY: Record<NutrientKey, number> = {
  energyKcal: 0,
  proteinG: 0,
  vitaminCMg: VITAMIN_C_DECAY_PER_DAY,
  vitaminDUg: VITAMIN_D_DECAY_PER_DAY,
  calciumMg: MINERAL_DECAY_PER_DAY,
  potassiumMg: MINERAL_DECAY_PER_DAY,
}

/** Nutrients in `kg` of stored food that is `ageDays` old. */
export function storedNutrients(kg: number, ageDays: number): Record<NutrientKey, number> {
  const kcal = kg * KCAL_PER_FOOD_KG
  const out = {} as Record<NutrientKey, number>
  for (const k of NUTRIENT_KEYS) {
    out[k] = kcal * MENU_PER_KCAL[k] * Math.exp(-DECAY_PER_DAY[k] * Math.max(0, ageDays))
  }
  return out
}

/** Need below which a day counts as short; ignores float rounding when intake is sized to need. */
const SHORT_TOLERANCE = 1e-6

export type NutritionTracker = {
  /** Food arrives (or greenhouse surplus is stored), produced on mission day `producedDay`. */
  deliver(kg: number, producedDay: number): void
  /** The crew eats `storedKg` from stock (oldest first) and `freshKg` straight from the greenhouse. */
  eat(day: number, storedKg: number, freshKg: number): void
  /** Last day's intake per crew member and nutrient, flat: index = i × NUTRIENT_KEYS.length + n. */
  readonly lastIntake: Float64Array
  /** Daily need, same layout as lastIntake. */
  readonly needs: Float64Array
  result(): Record<string, Record<NutrientKey, NutrientTally>>
}

// Hot-path constants as flat arrays indexed like NUTRIENT_KEYS: the sim calls eat() for every day of every run.
const N = NUTRIENT_KEYS.length
const STORED_PER_KG = Float64Array.from(NUTRIENT_KEYS, (k) => MENU_PER_KCAL[k] * KCAL_PER_FOOD_KG)
const FRESH_PER_KG = Float64Array.from(
  NUTRIENT_KEYS,
  (k) => GREENHOUSE_PER_KCAL[k] * KCAL_PER_FOOD_KG,
)
const DECAY = Float64Array.from(NUTRIENT_KEYS, (k) => DECAY_PER_DAY[k])
/** Only these nutrients lose content with shelf age (today: vitamin C); the rest scale with mass. */
const DECAYING = Int32Array.from(NUTRIENT_KEYS.flatMap((_, n) => (DECAY[n] > 0 ? [n] : [])))
const SUPPLEMENT = Float64Array.from(NUTRIENT_KEYS, (k) =>
  k === 'vitaminDUg' ? VITAMIN_D_SUPPLEMENT_UG_PER_DAY : 0,
)

/** Null when any crew member lacks a full profile (no personal needs to compare against). */
export function createNutritionTracker(crew: readonly CrewMember[]): NutritionTracker | null {
  if (crew.length === 0 || !crew.every(hasFullProfile)) return null
  const needs: DailyNeeds[] = crew.map((m) => dailyNeeds(m as Parameters<typeof dailyNeeds>[0]))
  const totalFoodKg = needs.reduce((s, n) => s + n.foodKg, 0)
  const shares = needs.map((n) => n.foodKg / totalFoodKg)
  const need = Float64Array.from(
    { length: crew.length * N },
    (_, j) => needs[(j / N) | 0][NUTRIENT_KEYS[j % N]],
  )

  // Tallies, flat: index = crew × N + nutrient.
  const deficit = new Float64Array(crew.length * N)
  const daysShort = new Int32Array(crew.length * N)
  const lastIntake = new Float64Array(crew.length * N)
  const firstShort = new Int32Array(crew.length * N).fill(-1)

  // FIFO batches of stored food; `head` skips emptied batches without shifting the array.
  const batchKg: number[] = []
  const batchDay: number[] = []
  let head = 0
  const intake = new Float64Array(N)
  const decayedKg = new Float64Array(N)

  return {
    deliver(kg, producedDay) {
      if (kg <= 0) return
      batchKg.push(kg)
      batchDay.push(producedDay)
    },

    eat(day, storedKg, freshKg) {
      // Stored kg eaten; for decaying nutrients, weighted by how much survived shelf age.
      let eatenKg = 0
      for (let d = 0; d < DECAYING.length; d++) decayedKg[DECAYING[d]] = 0
      let left = storedKg
      while (left > 0 && head < batchKg.length) {
        const kg = Math.min(left, batchKg[head])
        const age = Math.max(0, day - batchDay[head])
        eatenKg += kg
        for (let d = 0; d < DECAYING.length; d++) {
          const n = DECAYING[d]
          decayedKg[n] += kg * Math.exp(-DECAY[n] * age)
        }
        batchKg[head] -= kg
        left -= kg
        if (batchKg[head] <= 0) head++
      }
      for (let n = 0; n < N; n++) {
        const stored = DECAY[n] > 0 ? decayedKg[n] : eatenKg
        intake[n] = freshKg * FRESH_PER_KG[n] + stored * STORED_PER_KG[n]
      }

      for (let i = 0; i < shares.length; i++) {
        for (let n = 0; n < N; n++) {
          const j = i * N + n
          lastIntake[j] = shares[i] * intake[n] + SUPPLEMENT[n]
          const short = need[j] - lastIntake[j]
          if (short > need[j] * SHORT_TOLERANCE) {
            deficit[j] += short
            daysShort[j]++
            if (firstShort[j] < 0) firstShort[j] = day
          }
        }
      }
    },

    lastIntake,
    needs: need,

    result() {
      return Object.fromEntries(
        crew.map((m, i) => [
          m.id,
          Object.fromEntries(
            NUTRIENT_KEYS.map((k, n) => {
              const j = i * N + n
              return [
                k,
                {
                  deficit: deficit[j],
                  daysShort: daysShort[j],
                  firstShortDay: firstShort[j] < 0 ? null : firstShort[j],
                },
              ]
            }),
          ) as Record<NutrientKey, NutrientTally>,
        ]),
      )
    },
  }
}
