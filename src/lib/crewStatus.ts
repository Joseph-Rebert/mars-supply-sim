// How each crew member fares across the Monte Carlo runs, for the roster card's color and caption.

import type { SimResult } from './types'

// UI thresholds for "unfit in many runs" (not real-world numbers): amber from 5% of runs, red from 20%.
export const CREW_CAUTION_UNFIT_SHARE = 0.05
export const CREW_CRITICAL_UNFIT_SHARE = 0.2

export type CrewTone = 'nominal' | 'caution' | 'critical'

export type CrewStatus = {
  /** Share of all runs where this person became medically unfit, 0–1. */
  unfitShare: number
  tone: CrewTone
  /** Most common reason they became unfit, in words; undefined if they never did. */
  driver?: string
}

const DRIVER_TEXT: Record<string, string> = {
  boneLoss: 'bone loss',
  scurvy: 'scurvy (vitamin C)',
  bodyMass: 'body mass loss',
}

export function crewStatus(result: SimResult, crewId: string): CrewStatus {
  const drivers = new Map<string, number>()
  let unfit = 0
  for (const f of result.failures) {
    if (f.kind !== 'crewUnfit' || f.crewId !== crewId) continue
    unfit++
    if (f.driver) drivers.set(f.driver, (drivers.get(f.driver) ?? 0) + 1)
  }
  const unfitShare = unfit / result.runs
  const tone: CrewTone =
    unfitShare >= CREW_CRITICAL_UNFIT_SHARE
      ? 'critical'
      : unfitShare >= CREW_CAUTION_UNFIT_SHARE
        ? 'caution'
        : 'nominal'
  const top = [...drivers].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0]
  return { unfitShare, tone, driver: top && (DRIVER_TEXT[top] ?? top) }
}
