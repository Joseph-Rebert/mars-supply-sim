import { DESTINATION_PROFILES } from '../lib/data'
import { planCost } from '../lib/optimize'
import { daysToMonths } from '../lib/plan'
import type { MissionPlan, SimResult } from '../lib/types'
import { commsDelayLabel, fmt, survivalTone, TONE_LABEL } from './format'
import { StatTile } from './StatTile'
import { useCountUp } from './useCountUp'

type Props = {
  result: SimResult
  /** The plan that produced `result`. */
  plan: MissionPlan
}

/** Always-visible key numbers along the bottom, on every tab. Survival counts up on change. */
export function StatsStrip({ result, plan }: Props) {
  const shown = useCountUp(result.survivalRate)
  const tone = survivalTone(shown)
  const cost = planCost(plan)
  return (
    <footer className="stats-strip" aria-label="Mission summary">
      <div className={`strip-survival is-${tone}`}>
        <span className="strip-survival-value mono" aria-live="polite">
          {(shown * 100).toFixed(1)}
          <span className="verdict-unit">%</span>
        </span>
        <span className="strip-survival-label">
          chance the crew survives
          <span className={`status-tag is-${tone}`}>{TONE_LABEL[tone]}</span>
        </span>
      </div>
      <div className="strip-stats">
        <StatTile label="Launch mass" value={fmt(cost.launchMassKg)} unit="kg" />
        <StatTile label="Launches" value={`${cost.launches}`} />
        <StatTile label="Launch cost" value={`$${fmt(cost.costUsd / 1e6)}`} unit="M" />
        <StatTile label="Destination" value={DESTINATION_PROFILES[plan.destination].label} />
        <StatTile label="Comms delay" value={commsDelayLabel(plan.destination)} />
        <StatTile label="Duration" value={`${daysToMonths(result.durationDays)}`} unit="mo" />
        <StatTile label="Runs" value={fmt(result.runs)} />
      </div>
    </footer>
  )
}
