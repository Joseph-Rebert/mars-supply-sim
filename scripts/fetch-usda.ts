// One-off fetch: nutrients per 100 g for foods representative of the ISS standard menu
// → src/cache/usda-foods.json. Run with `npx tsx scripts/fetch-usda.ts`. The app imports the JSON;
// it never calls FoodData Central.
//
// Source: USDA FoodData Central API, POST https://api.nal.usda.gov/fdc/v1/foods
// (docs: https://fdc.nal.usda.gov/api-guide). Dataset: SR Legacy (2018-04), one request for all IDs.
// Key: NASA_API_KEY from .env (a free api.nasa.gov key works for FDC); falls back to DEMO_KEY.
//
// Menu: foods with onNasaMenu appear in "Typical Menus For Astronauts On Orbit", Table 1 of Lane et al.,
// "Changes in Space Food over the Last 45 Years" (NASA JSC, NTRS 20060049069). The rest are representative
// ISS-style foods (thermostabilized entrées, desserts) not named in that table.

import { writeFileSync } from 'node:fs'

const API_URL = 'https://api.nal.usda.gov/fdc/v1/foods'
const OUT_PATH = new URL('../src/cache/usda-foods.json', import.meta.url)

type Category =
  | 'entree'
  | 'breakfast'
  | 'bread'
  | 'side'
  | 'vegetable'
  | 'fruit'
  | 'snack'
  | 'dessert'
  | 'beverage'

/** SR Legacy foods standing in for ISS menu items. `name` is the menu item; USDA's description is kept too. */
const FOODS: { fdcId: number; name: string; category: Category; onNasaMenu?: boolean }[] = [
  { fdcId: 167535, name: 'Flour tortilla', category: 'bread', onNasaMenu: true },
  { fdcId: 173325, name: 'Macaroni and cheese', category: 'entree', onNasaMenu: true },
  { fdcId: 168665, name: 'Beef brisket', category: 'entree' },
  { fdcId: 171099, name: 'Chicken', category: 'entree' },
  { fdcId: 171986, name: 'Tuna', category: 'entree' },
  { fdcId: 175180, name: 'Shrimp cocktail (shrimp)', category: 'entree', onNasaMenu: true },
  { fdcId: 172188, name: 'Scrambled eggs (dried egg)', category: 'breakfast' },
  { fdcId: 171661, name: 'Oatmeal', category: 'breakfast', onNasaMenu: true },
  { fdcId: 170567, name: 'Almonds', category: 'snack', onNasaMenu: true },
  { fdcId: 170571, name: 'Cashews', category: 'snack', onNasaMenu: true },
  { fdcId: 172470, name: 'Peanut butter', category: 'snack', onNasaMenu: true },
  { fdcId: 172746, name: 'Crackers', category: 'snack' },
  { fdcId: 173941, name: 'Dried apricots', category: 'fruit' },
  { fdcId: 169934, name: 'Dried peaches', category: 'fruit', onNasaMenu: true },
  { fdcId: 168165, name: 'Raisins', category: 'fruit', onNasaMenu: true },
  { fdcId: 171695, name: 'Applesauce', category: 'fruit', onNasaMenu: true },
  { fdcId: 170445, name: 'Mashed potatoes', category: 'side', onNasaMenu: true },
  { fdcId: 168878, name: 'Rice', category: 'side', onNasaMenu: true },
  { fdcId: 169143, name: 'Green beans', category: 'vegetable', onNasaMenu: true },
  { fdcId: 169286, name: 'Spinach', category: 'vegetable', onNasaMenu: true },
  { fdcId: 169969, name: 'Broccoli', category: 'vegetable', onNasaMenu: true },
  { fdcId: 173235, name: 'Orange drink', category: 'beverage', onNasaMenu: true },
  { fdcId: 171893, name: 'Coffee', category: 'beverage', onNasaMenu: true },
  { fdcId: 174967, name: 'Shortbread cookies', category: 'dessert' },
  { fdcId: 168778, name: 'Chocolate pudding', category: 'dessert' },
]

/** Output fields (per 100 g) with their FDC nutrient ID and legacy nutrient number. */
const NUTRIENTS = [
  { field: 'energyKcal', id: 1008, number: '208' },
  { field: 'proteinG', id: 1003, number: '203' },
  { field: 'fatG', id: 1004, number: '204' },
  { field: 'carbsG', id: 1005, number: '205' },
  { field: 'vitaminCMg', id: 1162, number: '401' },
  { field: 'vitaminDUg', id: 1114, number: '328' },
  { field: 'calciumMg', id: 1087, number: '301' },
  { field: 'potassiumMg', id: 1092, number: '306' },
] as const
type NutrientField = (typeof NUTRIENTS)[number]['field']
/** Every SR Legacy food lists these; missing means the response wasn't parsed right. */
const REQUIRED: NutrientField[] = ['energyKcal', 'proteinG', 'fatG', 'carbsG']

type FdcFood = {
  fdcId: number
  description: string
  dataType: string
  // 'full' format nests the nutrient; the bulk endpoint may answer in 'abridged' format (flat number).
  foodNutrients: { nutrient?: { id: number }; number?: string; amount?: number }[]
}

function apiKey(): string {
  try {
    process.loadEnvFile(new URL('../.env', import.meta.url))
  } catch {
    // No .env: fine, DEMO_KEY below.
  }
  return process.env.NASA_API_KEY || 'DEMO_KEY'
}

async function main() {
  const res = await fetch(`${API_URL}?api_key=${apiKey()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fdcIds: FOODS.map((f) => f.fdcId),
      format: 'full',
      // The filter takes legacy nutrient numbers ('208'), not nutrient IDs (1008).
      nutrients: NUTRIENTS.map((n) => Number(n.number)),
    }),
  })
  if (!res.ok) throw new Error(`FDC ${res.status}: ${await res.text()}`)
  const fetched = (await res.json()) as FdcFood[]
  const byId = new Map(fetched.map((f) => [f.fdcId, f]))

  const foods = FOODS.map(({ fdcId, name, category, onNasaMenu = false }) => {
    const food = byId.get(fdcId)
    if (!food) throw new Error(`FDC returned no food for ${fdcId} (${name})`)
    const per100g = {} as Record<NutrientField, number>
    for (const { field, id, number } of NUTRIENTS) {
      const n = food.foodNutrients.find((fn) => fn.nutrient?.id === id || fn.number === number)
      if (n?.amount === undefined && REQUIRED.includes(field)) {
        throw new Error(`${name} (${fdcId}) has no ${field}; check the FDC response format`)
      }
      // SR Legacy omits a micronutrient when it was not analysed; store 0 and say so in the header.
      per100g[field] = n?.amount ?? 0
    }
    return {
      fdcId,
      name,
      category,
      onNasaMenu,
      description: food.description,
      dataType: food.dataType,
      per100g,
    }
  })

  const header = {
    source: 'USDA FoodData Central API (https://api.nal.usda.gov/fdc/v1/foods)',
    dataset: 'SR Legacy (2018-04)',
    fetchedAt: new Date().toISOString(),
    basis: 'per 100 g, as listed by USDA',
    nutrients: NUTRIENTS,
    missingNutrients: 'stored as 0 (not analysed in SR Legacy)',
    lookup: 'https://fdc.nal.usda.gov/food-details/{fdcId}/nutrients',
    menuSource:
      'onNasaMenu: named in Table 1 of Lane et al., Changes in Space Food over the Last 45 Years (NTRS 20060049069)',
  }
  writeFileSync(OUT_PATH, JSON.stringify({ header, foods }, null, 1) + '\n')
  console.log(`Wrote ${foods.length} foods to ${OUT_PATH.pathname}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
