import { describe, expect, it } from 'vitest'
import cache from './usda-foods.json'

const { foods } = cache

describe('usda-foods.json', () => {
  it('has 15–25 traceable foods with unique FDC IDs from SR Legacy', () => {
    expect(foods.length).toBeGreaterThanOrEqual(15)
    expect(foods.length).toBeLessThanOrEqual(25)
    expect(new Set(foods.map((f) => f.fdcId)).size).toBe(foods.length)
    for (const f of foods) expect(f.dataType).toBe('SR Legacy')
  })

  it('stores non-negative nutrients for every food', () => {
    for (const f of foods) {
      for (const v of Object.values(f.per100g)) expect(v).toBeGreaterThanOrEqual(0)
      expect(f.per100g.energyKcal).toBeGreaterThan(0)
    }
  })

  it('agrees with the general Atwater factors (4/4/9 kcal/g protein/carbs/fat)', () => {
    // Catches unit mix-ups or a nutrient landing in the wrong field. Vegetables get 30%: USDA uses
    // food-specific Atwater factors for them and their carbs include fibre (spinach is +28%).
    for (const f of foods) {
      const { energyKcal, proteinG, carbsG, fatG } = f.per100g
      const atwater = 4 * proteinG + 4 * carbsG + 9 * fatG
      const tolerance = f.category === 'vegetable' ? 0.3 : 0.15
      expect(Math.abs(atwater / energyKcal - 1), f.name).toBeLessThan(tolerance)
    }
  })

  it('covers the ISS menu categories, including vitamin C sources', () => {
    const categories = new Set(foods.map((f) => f.category))
    for (const c of ['entree', 'breakfast', 'fruit', 'vegetable', 'snack', 'beverage', 'dessert']) {
      expect(categories.has(c)).toBe(true)
    }
    expect(foods.filter((f) => f.per100g.vitaminCMg >= 10).length).toBeGreaterThanOrEqual(3)
  })
})
