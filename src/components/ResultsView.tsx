import { useMemo } from 'react'
import { missionMonth, type WeakestLink } from '../lib/analysis'
import { DAYS_PER_MONTH } from '../lib/plan'
import type { MissionPlan, SimResult } from '../lib/types'
import { Panel } from './Panel'
import { ResourceTimeline, type TimelineHighlight } from './ResourceTimeline'
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

/** The Overview tab: the resource timeline full width, then the weakest link and suggested fix. */
export function ResultsView({
  result,
  plan,
  link,
  fix,
  applyBlockedReason,
  applying,
  onApplyFix,
}: Props) {
  const highlight = useMemo(
    () => failureMonthBand(link, result.durationDays),
    [link, result.durationDays],
  )
  return (
    <div className="overview">
      <Panel title="Resource timeline · median, P10–P90">
        <ResourceTimeline result={result} plan={plan} highlight={highlight} />
      </Panel>
      <section className="overview-risk" aria-label="Weakest link and suggested fix">
        <WeakestLinkCallout
          link={link}
          fix={fix}
          applyBlockedReason={applyBlockedReason}
          applying={applying}
          onApply={onApplyFix}
        />
      </section>
    </div>
  )
}
