import type { MissionPlan, SimResult } from '../lib/types'
import { fmt, survivalTone, TONE_LABEL } from './format'
import { Panel } from './Panel'
import { ResourceTimeline } from './ResourceTimeline'
import { StatTile } from './StatTile'

type Props = {
  result: SimResult
  /** The plan that produced `result` (not necessarily the one being edited). */
  plan: MissionPlan
}

/** The verdict screen: survival %, key stats, and the resource timeline. */
export function ResultsView({ result, plan }: Props) {
  const tone = survivalTone(result.survivalRate)
  return (
    <>
      <Panel title="Probability of crew survival">
        <div className="verdict">
          <div className="verdict-row">
            <span className={`verdict-value is-${tone}`}>
              {(result.survivalRate * 100).toFixed(1)}
              <span className="verdict-unit">%</span>
            </span>
            <span className={`status-tag is-${tone}`}>{TONE_LABEL[tone]}</span>
          </div>
          <p className="verdict-caption">chance the crew survives</p>
        </div>
        <div className="stat-row">
          <StatTile label="Launch mass" value={fmt(result.totalLaunchMassKg)} unit="kg" />
          <StatTile label="Duration" value={`${result.durationDays}`} unit="d" />
          <StatTile label="Runs" value={fmt(result.runs)} />
        </div>
      </Panel>
      <Panel title="Resource timeline · median, P10–P90">
        <ResourceTimeline result={result} plan={plan} />
      </Panel>
    </>
  )
}
