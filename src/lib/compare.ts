// Before vs. after: two saved runs side by side, with which way each difference cuts.

import { weakestLink } from './analysis'
import { COMPONENTS, SHIPPING_OVERHEAD_KG_PER_KG } from './data'
import {
  COMPONENT_KEYS,
  CONSUMABLE_KEYS,
  RESOURCE_KEYS,
  type MissionPlan,
  type ResourceKey,
  type SimResult,
} from './types'

/** A plan and the run it produced, kept in memory under a name ("Before", "A", …). */
export type SavedRun = { name: string; plan: MissionPlan; result: SimResult }

/** Launch mass per category: consumables with their containers, and all spare parts. */
export function massByCategory(plan: MissionPlan): Record<ResourceKey, number> {
  const out: Record<ResourceKey, number> = { o2: 0, water: 0, food: 0, spares: 0 }
  for (const f of plan.flights) {
    for (const r of CONSUMABLE_KEYS) {
      out[r] += f.consumablesKg[r] * (1 + SHIPPING_OVERHEAD_KG_PER_KG[r])
    }
    for (const c of COMPONENT_KEYS) out.spares += f.spares[c] * COMPONENTS[c].spareMassKg
  }
  return out
}

export type Tone = 'better' | 'worse' | 'same'

export type Delta = { a: number; b: number; delta: number; tone: Tone }

/** Differences smaller than this read as "same": 0.1 survival points, 1 kg. */
const SAME_SURVIVAL_PTS = 0.05
const SAME_KG = 0.5

function delta(a: number, b: number, higherIsBetter: boolean, same: number): Delta {
  const d = b - a
  const tone: Tone = Math.abs(d) < same ? 'same' : d > 0 === higherIsBetter ? 'better' : 'worse'
  return { a, b, delta: d, tone }
}

export type Comparison = {
  /** Survival in percentage points (0–100), so delta reads as "+36.0 pts". */
  survivalPts: Delta
  /** Less launch mass is better: every kilogram costs a launch. */
  totalMassKg: Delta
  massKg: Record<ResourceKey, Delta>
  weakestLink: { a: string; b: string }
}

/** B relative to A: positive deltas mean B has more. */
export function comparePlans(a: SavedRun, b: SavedRun): Comparison {
  const massA = massByCategory(a.plan)
  const massB = massByCategory(b.plan)
  const massKg = {} as Record<ResourceKey, Delta>
  for (const k of RESOURCE_KEYS) massKg[k] = delta(massA[k], massB[k], false, SAME_KG)
  return {
    survivalPts: delta(
      a.result.survivalRate * 100,
      b.result.survivalRate * 100,
      true,
      SAME_SURVIVAL_PTS,
    ),
    totalMassKg: delta(a.result.totalLaunchMassKg, b.result.totalLaunchMassKg, false, SAME_KG),
    massKg,
    weakestLink: { a: weakestLink(a.result).sentence, b: weakestLink(b.result).sentence },
  }
}
