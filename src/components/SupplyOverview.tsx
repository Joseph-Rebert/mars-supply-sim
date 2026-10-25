import type { ReactNode } from 'react'
import type { WeakestLink } from '../lib/analysis'
import type { PipelineRow } from '../lib/supplyChain'
import type { MissionPlan, ResourceKey, SimResult } from '../lib/types'
import { SupplyCharts } from './SupplyStoryChart'
import { RESOURCE_LABELS } from './themeColors'
import type { FixState } from './WeakestLinkCallout'

const pct = (x: number) => `${Math.round(x * 100)}%`
/** Like pct, but keeps a decimal near the top so 99.5% doesn't read as a promise of 100%. */
const pctFine = (x: number) => (x > 0.99 && x < 1 ? `${(x * 100).toFixed(1)}%` : pct(x))

type Props = {
  /** The plan that produced `result`. */
  plan: MissionPlan
  result: SimResult
  link: WeakestLink
  fix: FixState
  applyBlockedReason?: string
  applying: boolean
  onApplyFix: () => void
  rows: PipelineRow[]
  /** The trip view: the centerpiece, right under the Fix button. */
  trip?: ReactNode
}

/**
 * The top of the page: the best fix, the trip, and the supplies over time. The key numbers sit in
 * the strip along the bottom.
 */
export function SupplyOverview(props: Props) {
  const { plan, result } = props
  return (
    <div className="overview sc-overview">
      <Verdict {...props} />

      {props.trip}

      <section id="supplies" className="sc-panel" aria-labelledby="sc-timeline-title">
        <h2 id="sc-timeline-title" className="sc-h2">
          Supplies left at the base
        </h2>
        <SupplyCharts plan={plan} result={result} rows={props.rows} />
      </section>
    </div>
  )
}

function Verdict(props: Props) {
  const { link, fix, applying, applyBlockedReason, onApplyFix } = props
  if (link.status === 'allClear') return null
  return (
    <section className="sc-verdict" aria-label="Best fix">
      <div className="sc-verdict-action">
        {fix === 'searching' ? (
          <p className="sc-muted">Looking for the best fix… this takes a few seconds.</p>
        ) : fix.status === 'fix' ? (
          <>
            <button
              type="button"
              className="sc-btn is-primary"
              disabled={applying || applyBlockedReason !== undefined}
              title={applyBlockedReason}
              onClick={onApplyFix}
            >
              {applying
                ? 'Fixing…'
                : `Fix it: ${pct(fix.survivalBefore)} → ${pctFine(fix.survivalAfter)} survive`}
            </button>
            {applyBlockedReason && <p className="sc-caption">{applyBlockedReason}</p>}
          </>
        ) : (
          <p className="sc-muted">{fix.sentence}</p>
        )}
      </div>
    </section>
  )
}

export function Kpi(props: { label: string; value: string; note?: string; tone?: string }) {
  return (
    <div className={props.tone ? `sc-kpi tone-${props.tone}` : 'sc-kpi'}>
      <span className="sc-kpi-label">{props.label}</span>
      <span className="sc-kpi-value num">{props.value}</span>
      {props.note && <span className="sc-kpi-note">{props.note}</span>}
    </div>
  )
}

export function ResourcePicker(props: {
  resources: ResourceKey[]
  value: ResourceKey
  onChange: (k: ResourceKey) => void
}) {
  return (
    <div className="sc-seg" role="radiogroup" aria-label="Resource">
      {props.resources.map((k) => (
        <button
          key={k}
          type="button"
          role="radio"
          aria-checked={k === props.value}
          className={k === props.value ? 'is-on' : undefined}
          onClick={() => props.onChange(k)}
        >
          {RESOURCE_LABELS[k]}
        </button>
      ))}
    </div>
  )
}
