import { describe, expect, it } from 'vitest'
import { suggestFix, weakestLink } from './analysis'
import { runBlockedReason } from './launchDates'
import { totalLaunchMassKg } from './manifest'
import { presetById, PRESETS } from './presets'
import { DEFAULT_RUN_OPTIONS, runMission } from './sim'

// The pitch script quotes these numbers. If a model change moves them, update the slides too.
const SLIDE_NUMBERS = { draft: 0.572, revised: 0.932, moon: 0.784 }
const SLOW = 30_000

describe('demo presets', () => {
  it(
    'each loads a runnable plan with the slide survival %, every time',
    () => {
      for (const preset of PRESETS) {
        const plan = preset.plan()
        expect(runBlockedReason(plan)).toBeUndefined()
        const a = runMission(plan, DEFAULT_RUN_OPTIONS)
        const b = runMission(preset.plan(), DEFAULT_RUN_OPTIONS)
        expect(a.survivalRate).toBe(SLIDE_NUMBERS[preset.id])
        expect(b.survivalRate).toBe(a.survivalRate)
      }
    },
    SLOW,
  )

  it(
    'Draft fails mainly on water recycler spares',
    () => {
      const link = weakestLink(runMission(presetById('draft').plan(), DEFAULT_RUN_OPTIONS))
      if (link.status !== 'atRisk') throw new Error('expected atRisk')
      expect(link.top.key).toBe('water/waterRecycler')
    },
    SLOW,
  )

  it(
    'the suggested fix on the Draft is exactly the Revised preset',
    () => {
      const draft = presetById('draft').plan()
      const fix = suggestFix(draft, runMission(draft, DEFAULT_RUN_OPTIONS))
      if (fix.status !== 'fix') throw new Error(fix.sentence)
      expect(fix.plan.flights).toEqual(presetById('revised').plan().flights)
      expect(fix.survivalAfter).toBe(SLIDE_NUMBERS.revised)
    },
    SLOW,
  )

  it('Moon ships the same cargo and launch mass as the Draft, just more often', () => {
    const draft = presetById('draft').plan()
    const moon = presetById('moon').plan()
    expect(moon.destination).toBe('moon')
    expect(totalLaunchMassKg(moon)).toBeCloseTo(totalLaunchMassKg(draft), 6)
    // 900 days at a 180-day cadence: resupplies land on days 180, 360, 540, 720.
    expect(moon.flights.map((f) => f.label)).toEqual([
      'Cargo lander 1',
      'Cargo lander 2',
      'Resupply 1',
      'Resupply 2',
      'Resupply 3',
      'Resupply 4',
    ])
    const spares = (p: typeof draft) =>
      p.flights.reduce((n, f) => n + Object.values(f.spares).reduce((a, b) => a + b, 0), 0)
    expect(spares(moon)).toBe(spares(draft))
  })
})
