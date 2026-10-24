import { describe, expect, it } from 'vitest'
import dataSource from './data.ts?raw'
import { COMPONENT_KEYS } from './types'
import {
  COMPONENTS,
  CREW_NEEDS_KG_PER_CREW_DAY,
  ELECTROLYSIS_WATER_KG_PER_KG_O2,
  FOOD_KCAL_PER_CREW_DAY,
  GREENHOUSE_FOOD_KG_PER_M2_DAY,
  SOURCES,
  WATER_KG_PER_CREW_DAY,
} from './data'

describe('data.ts provenance', () => {
  it('gives every exported constant a Source: or ASSUMPTION: comment', () => {
    const lines = dataSource.split('\n')
    const missing: string[] = []
    lines.forEach((line, i) => {
      const name = /^export const (\w+)/.exec(line)?.[1]
      if (!name) return
      let j = i - 1
      const comments: string[] = []
      while (j >= 0 && lines[j].startsWith('//')) comments.push(lines[j--])
      if (!comments.some((c) => /\/\/ (Source|ASSUMPTION):/.test(c))) missing.push(name)
    })
    expect(missing).toEqual([])
  })

  it('lists unique source URLs', () => {
    const urls = SOURCES.map((s) => s.url)
    expect(new Set(urls).size).toBe(urls.length)
  })
})

describe('data.ts values', () => {
  it('matches BVAD Rev2 Early Planetary Base total water (Table 4-20)', () => {
    expect(WATER_KG_PER_CREW_DAY).toBeCloseTo(4.48, 5)
    expect(CREW_NEEDS_KG_PER_CREW_DAY.water).toBe(WATER_KG_PER_CREW_DAY)
  })

  it('converts 12.778 MJ to kcal', () => {
    expect(FOOD_KCAL_PER_CREW_DAY).toBe(Math.round(12_778 / 4.184))
  })

  it('needs 18/16 kg water per kg O₂ for electrolysis', () => {
    expect(ELECTROLYSIS_WATER_KG_PER_KG_O2).toBeCloseTo(1.126, 3)
  })

  it('feeds one crew member from 50 m² of greenhouse', () => {
    expect(GREENHOUSE_FOOD_KG_PER_M2_DAY * 50).toBeCloseTo(CREW_NEEDS_KG_PER_CREW_DAY.food, 9)
  })

  it('has a positive spec for every component', () => {
    for (const key of COMPONENT_KEYS) {
      const c = COMPONENTS[key]
      expect(c.mtbfDays).toBeGreaterThan(0)
      expect(c.spareMassKg).toBeGreaterThan(0)
      expect(c.repairDays).toBeGreaterThan(0)
    }
  })

  it('ranks the water recycler as the least reliable ISS system (drives the demo story)', () => {
    const { waterRecycler, o2Generator, co2Scrubber } = COMPONENTS
    expect(waterRecycler.mtbfDays).toBeLessThan(o2Generator.mtbfDays)
    expect(waterRecycler.mtbfDays).toBeLessThan(co2Scrubber.mtbfDays)
  })
})
