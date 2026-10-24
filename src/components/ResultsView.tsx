import { useMemo } from 'react'
import { missionMonth, type WeakestLink } from '../lib/analysis'
import { DAYS_PER_MONTH } from '../lib/plan'
import type { MissionPlan, SimResult } from '../lib/types'
import { fmt, survivalTone, TONE_LABEL } from './format'
import { Panel } from './Panel'
import { ResourceTimeline, type TimelineHighlight } from './ResourceTimeline'
import { StatTile } from './StatTile'
import { useCountUp } from './useCountUp'
import { WeakestLinkCallout, type FixState } from './WeakestLinkCallout'

type Props = {
  result: SimResult
  /** The plan that produced `result` (not necessarily the one being edited). */
  plan: MissionPlan
  link: WeakestLink
  fix: FixState
  applyBlockedReason?: string
  applying: boolean
  onApplyFix: () => void
}

/** The failure month of the weakest link, as a band on the timeline. */
function failureMonthBand(link: WeakestLink, durationDays: number): TimelineHighlight | undefined {
  if (link.status !== 'atRisk') return undefined
  const month = missionMonth(link.top.medianDay)
  const startDay = Math.floor((month - 1) * DAYS_PER_MONTH)
  return {
    startDay,
    endDay: Math.min(durationDays - 1, Math.ceil(month * DAYS_PER_MONTH)),
    label: `▲ Month ${month}`,
  }
}

/** The verdict screen: survival % (animated), weakest link + fix, key stats, and the timeline. */
export function ResultsView({
  result,
  plan,
  link,
  fix,
  applyBlockedReason,
  applying,
  onApplyFix,
}: Props) {
  const shown = useCountUp(result.survivalRate)
  const tone = survivalTone(shown)
  const highlight = useMemo(
    () => failureMonthBand(link, result.durationDays),
    [link, result.durationDays],
  )
  return (
    <>
      <Panel title="Probability of crew survival">
        <div className="verdict-layout">
          <div className="verdict-main">
            <div className="verdict">
              <div className="verdict-row">
                <span className={`verdict-value is-${tone}`} aria-live="polite">
                  {(shown * 100).toFixed(1)}
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
          </div>
          <WeakestLinkCallout
            link={link}
            fix={fix}
            applyBlockedReason={applyBlockedReason}
            applying={applying}
            onApply={onApplyFix}
          />
        </div>
      </Panel>
      <Panel title="Resource timeline · median, P10–P90">
        <ResourceTimeline result={result} plan={plan} highlight={highlight} />
      </Panel>
    </>
  )
}
