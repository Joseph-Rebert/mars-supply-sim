import { useState } from 'react'
import type { FixKind, WeakestLink } from '../lib/analysis'
import {
  runsOutDay,
  supplyCosts,
  type CostSummary,
  type ExceptionTarget,
  type PipelineRow,
  type SupplyException,
} from '../lib/supplyChain'
import type { MissionPlan, ResourceKey, SimResult } from '../lib/types'
import { fmt, survivalTone } from './format'
import { SupplyCharts } from './SupplyStoryChart'
import { RESOURCE_LABELS } from './themeColors'
import type { FixState } from './WeakestLinkCallout'

// Survival the plan aims for; the same target the fix search uses (DEFAULT_FIX_OPTIONS).
const TARGET_SURVIVAL = 0.9
// Problems shown before "Show all": enough for the story, few enough to read at a glance.
const PROBLEMS_SHOWN = 3
const pct = (x: number) => `${Math.round(x * 100)}%`
/** Like pct, but keeps a decimal near the top so 99.5% doesn't read as a promise of 100%. */
const pctFine = (x: number) => (x > 0.99 && x < 1 ? `${(x * 100).toFixed(1)}%` : pct(x))

const PILL = {
  nominal: 'Safe enough',
  caution: 'Not safe enough yet',
  critical: 'At risk',
} as const

/** One line saying what a fix does; the full description sits behind "What changes?". */
const FIX_GIST: Record<FixKind, string> = {
  moveSpares: 'Send the spare parts on an earlier rocket',
  addSpares: 'Pack more spare parts',
  emergencyFlight: 'Book an extra rocket',
  addConsumables: 'Send more supplies',
  exercise: 'Have the crew exercise more',
  supplement: 'Give the crew a daily vitamin C tablet',
}

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
  cost: CostSummary
  exceptions: SupplyException[]
  onException: (target: ExceptionTarget) => void
  /** The supply the caption under the charts follows: whatever runs out first. */
  resource: ResourceKey
}

/**
 * The Overview tab: only what someone needs at a glance. The verdict and its fix, two numbers, the
 * top problems, and one simple chart. Everything else is a tab or a click away.
 */
export function SupplyOverview(props: Props) {
  const { plan, result, cost, exceptions } = props
  const [showAll, setShowAll] = useState(false)
  const shown = showAll ? exceptions : exceptions.slice(0, PROBLEMS_SHOWN)
  const equipmentUsd = supplyCosts(plan).reduce((s, c) => s + (c.buyUsd ?? 0), 0)
  const missionUsd = cost.costUsd + equipmentUsd
  return (
    <div className="overview sc-overview">
      <Verdict {...props} />

      <div className="sc-kpis is-two">
        <Kpi
          label="Crew survives"
          value={pct(result.survivalRate)}
          note={`Goal: ${pct(TARGET_SURVIVAL)}`}
          tone={survivalTone(result.survivalRate)}
        />
        <Kpi
          label="Mission cost"
          value={`$${fmt(missionUsd / 1e6)}M`}
          note={`${cost.launches} rockets $${fmt(cost.costUsd / 1e6)}M · equipment $${fmt(equipmentUsd / 1e6)}M`}
        />
      </div>

      <div className="sc-split">
        <section className="sc-panel" aria-labelledby="sc-exceptions-title">
          <h2 id="sc-exceptions-title" className="sc-h2">
            To fix
          </h2>
          {exceptions.length === 0 ? (
            <p className="sc-muted">Nothing needs fixing.</p>
          ) : (
            <>
              <ul className="sc-exceptions">
                {shown.map((e) => (
                  <li key={e.id}>
                    <button
                      type="button"
                      className={`sc-exception is-${e.severity}`}
                      onClick={() => props.onException(e.target)}
                    >
                      <span className="sc-exception-title">{e.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {exceptions.length > PROBLEMS_SHOWN && (
                <button type="button" className="sc-link" onClick={() => setShowAll((s) => !s)}>
                  {showAll ? 'Show fewer' : `Show all ${exceptions.length}`}
                </button>
              )}
            </>
          )}
        </section>

        <section id="supplies" className="sc-panel" aria-labelledby="sc-timeline-title">
          <h2 id="sc-timeline-title" className="sc-h2">
            Supplies left at the base
          </h2>
          <SupplyCharts plan={plan} result={result} rows={props.rows} />
          <p className="sc-caption">{storyCaption(plan, result, props.rows, props.resource)}</p>
        </section>
      </div>
    </div>
  )
}

/** One sentence under the chart saying what it shows, in this plan's own numbers. */
function storyCaption(
  plan: MissionPlan,
  result: SimResult,
  rows: PipelineRow[],
  resource: ResourceKey,
): string {
  const name = RESOURCE_LABELS[resource].toLowerCase()
  const out = runsOutDay(result, resource)
  if (out === null) {
    return `Even in an unlucky mission (the worst 1 in 10), there is always some ${name} left.`
  }
  const next = rows
    .filter((r) => r.arrivalDay > out && r.arrivalDay < plan.durationDays)
    .sort((a, b) => a.arrivalDay - b.arrivalDay)[0]
  const outMonth = Math.floor(out / 30.4375) + 1
  return next
    ? `In an unlucky mission (the worst 1 in 10), the ${name} is gone by month ${outMonth}, before ${next.flight.label} lands in month ${Math.floor(next.arrivalDay / 30.4375) + 1}.`
    : `In an unlucky mission (the worst 1 in 10), the ${name} is gone by month ${outMonth}, and no more arrives.`
}

function Verdict(props: Props) {
  const { link, fix, applying, applyBlockedReason, onApplyFix } = props
  if (link.status === 'allClear') {
    return (
      <section className="sc-verdict tone-nominal" aria-label="Verdict">
        <div className="sc-verdict-text">
          <span className="sc-pill tone-nominal">Looks good</span>
          <p className="sc-verdict-head">{link.sentence}</p>
        </div>
      </section>
    )
  }
  const tone = survivalTone(link.survivalRate)
  const { top } = link
  const headline = top.resource
    ? `The crew runs out of ${RESOURCE_LABELS[top.resource].toLowerCase()} around month ${top.month}`
    : `${top.label.split(': ')[0]} around month ${top.month}`
  const why = top.sentence.split(' because ')[1]
  return (
    <section className={`sc-verdict tone-${tone}`} aria-label="Verdict">
      <div className="sc-verdict-text">
        <span className={`sc-pill tone-${tone}`}>{PILL[tone]}</span>
        <p className="sc-verdict-head">
          {headline} in {Math.round(top.share * 100)} out of 100 missions
        </p>
        {why && <p className="sc-muted">The {why.replace(/^the /, '')}.</p>}
      </div>
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
            {applyBlockedReason ? (
              <p className="sc-caption">{applyBlockedReason}</p>
            ) : (
              <>
                <p className="sc-caption">
                  {fix.steps && fix.steps.length > 1
                    ? `${fix.steps.length} changes to the cargo, all at once.`
                    : `${FIX_GIST[fix.kind]}.`}{' '}
                  {fix.massDeltaKg > 0 ? `Adds ${fmt(fix.massDeltaKg)} kg.` : ''}
                </p>
                <details className="sc-more">
                  <summary>What changes</summary>
                  <ol className="sc-steps">
                    {(fix.steps ?? [fix.description]).map((step) => (
                      <li key={step} className="sc-caption">
                        {step}.
                      </li>
                    ))}
                  </ol>
                </details>
              </>
            )}
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
