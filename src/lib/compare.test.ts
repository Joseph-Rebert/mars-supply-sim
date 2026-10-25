import { beforeAll, describe, expect, it } from 'vitest'
import { comparePlans, massByCategory, type SavedRun } from './compare'
import { equipmentMassKg, totalLaunchMassKg } from './manifest'
import { presetById } from './presets'
import { DEFAULT_RUN_OPTIONS, runMission } from './sim'
import type { CargoFlight, MissionPlan } from './types'

const flight: CargoFlight = {
  id: 'f1',
  label: 'Lander',
  launchDate: '2028-12-11',
  consumablesKg: { o2: 100, water: 1000, food: 196 },
  spares: { waterRecycler: 2, o2Generator: 1, co2Scrubber: 0, greenhouse: 0 },
}

describe('massByCategory', () => {
  it('splits launch mass into consumables with containers and spares', () => {
    const plan = { ...presetById('draft').plan(), flights: [flight] }
    // O₂ 100 × 2.45; water 1000 × 1.1; food 196 × (1 + 0.43/1.96) = 239; spares 2 × 46.2 + 70.2.
    const m = massByCategory(plan)
    expect(m.o2).toBeCloseTo(245, 6)
    expect(m.water).toBeCloseTo(1100, 6)
    expect(m.food).toBeCloseTo(239, 6)
    expect(m.spares).toBeCloseTo(162.6, 6)
  })

  it('adds up to the plan’s total launch mass, less the base-building equipment', () => {
    const plan = presetById('draft').plan()
    const m = massByCategory(plan)
    const equipment = plan.flights.reduce((s, f) => s + equipmentMassKg(f), 0)
    // Habitat 1,413 kg + 10 kW reactor 1,538.5 kg + rover 210 kg.
    expect(equipment).toBeCloseTo(1413 + 10_000 / 6.5 + 210, 6)
    expect(m.o2 + m.water + m.food + m.spares + m.fuel).toBeCloseTo(
      totalLaunchMassKg(plan) - equipment,
      6,
    )
  })
})

describe('comparePlans', () => {
  const SLOW = 30_000
  const saved = (name: string, plan: MissionPlan): SavedRun => ({
    name,
    plan,
    result: runMission(plan, DEFAULT_RUN_OPTIONS),
  })
  let draft: SavedRun
  let revised: SavedRun
  let moon: SavedRun

  beforeAll(() => {
    draft = saved('Before', presetById('draft').plan())
    revised = saved('After', presetById('revised').plan())
    moon = saved('Moon', presetById('moon').plan())
  }, SLOW)

  it('shows the fix as +36 survival points for +139 kg of spares', () => {
    const c = comparePlans(draft, revised)
    // 57.2% → 93.2%.
    expect(c.survivalPts.delta).toBeCloseTo(36, 6)
    expect(c.survivalPts.tone).toBe('better')
    // 3 more recycler spares at 46.2 kg each; nothing else moves.
    expect(c.totalMassKg.delta).toBeCloseTo(138.6, 6)
    expect(c.totalMassKg.tone).toBe('worse')
    expect(c.massKg.spares.delta).toBeCloseTo(138.6, 6)
    expect(c.massKg.water.tone).toBe('same')
    expect(c.massKg.food.tone).toBe('same')
    expect(c.weakestLink.a).toMatch(/water recycler ran out of spare parts/)
  })

  it('reverses cleanly: A vs B is the mirror of B vs A', () => {
    const ab = comparePlans(draft, revised)
    const ba = comparePlans(revised, draft)
    expect(ba.survivalPts.delta).toBeCloseTo(-ab.survivalPts.delta, 9)
    expect(ba.survivalPts.tone).toBe('worse')
    expect(ba.totalMassKg.tone).toBe('better')
  })

  it('compares Mars with the Moon: same mass, +21 points', () => {
    const c = comparePlans(draft, moon)
    // 57.2% → 78.4% with identical cargo.
    expect(c.survivalPts.delta).toBeCloseTo(21.2, 6)
    expect(c.survivalPts.tone).toBe('better')
    expect(c.totalMassKg.tone).toBe('same')
  })
})
