import { useEffect, useRef } from 'react'
import { LAUNCH_COST_USD } from '../lib/data'
import { DEFAULT_RUN_OPTIONS } from '../lib/sim'
import type { MissionPlan } from '../lib/types'
import { fmt } from './format'

const DAYS_PER_MONTH = 30.4375

type Props = {
  plan: MissionPlan
  leadDays: number
  safetyDays: number
  onLead: (days: number) => void
  onSafety: (days: number) => void
  onClose: () => void
}

/**
 * The supply-chain knobs, out of the way of the results: order lead time (assumed), safety stock (a
 * policy), and the key sourced numbers behind the costs. Esc or the scrim closes it.
 */
export function AssumptionsDrawer({
  plan,
  leadDays,
  safetyDays,
  onLead,
  onSafety,
  onClose,
}: Props) {
  const first = useRef<HTMLInputElement>(null)
  useEffect(() => {
    first.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const months = Math.round(leadDays / DAYS_PER_MONTH)
  return (
    <div className="sc-scrim" onClick={onClose}>
      <aside
        className="sc-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sc-drawer-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sc-drawer-head">
          <h2 id="sc-drawer-title" className="sc-h2">
            Settings and sources
          </h2>
          <button type="button" className="sc-btn" onClick={onClose}>
            Close
          </button>
        </div>

        <label className="sc-setting" htmlFor="sc-lead">
          <span className="sc-setting-row">
            <span>Time to prepare a shipment</span>
            <span className="num">{months} months</span>
          </span>
          <input
            ref={first}
            id="sc-lead"
            type="range"
            min={6}
            max={36}
            step={1}
            value={months}
            onChange={(e) => onLead(Math.round(Number(e.target.value) * DAYS_PER_MONTH))}
          />
          <span className="sc-source is-assumed">
            Our estimate of how long it takes from ordering supplies to having them ready to launch.
            We haven't found an official number yet.
          </span>
        </label>

        <label className="sc-setting" htmlFor="sc-safety">
          <span className="sc-setting-row">
            <span>Safety buffer</span>
            <span className="num">{safetyDays} days</span>
          </span>
          <input
            id="sc-safety"
            type="range"
            min={30}
            max={180}
            step={10}
            value={safetyDays}
            onChange={(e) => onSafety(Number(e.target.value))}
          />
          <span className="sc-source">Days of extra supplies you always want on hand.</span>
        </label>

        <dl className="sc-facts">
          <div>
            <dt>Cost of one rocket</dt>
            <dd className="num">${fmt(LAUNCH_COST_USD / 1e6)}M </dd>
            <dd className="sc-source">
              What NASA paid for a Falcon Heavy launch in 2021 (Europa Clipper). We use it for every
              rocket.
            </dd>
          </div>
          <div>
            <dt>Most a rocket can carry</dt>
            <dd className="num">{(plan.baseVehiclePayloadKg / 1000).toFixed(1)} t</dd>
            <dd className="sc-source">
              At the best launch date, from NASA's published Falcon Heavy numbers.
            </dd>
          </div>
          <div>
            <dt>Simulated missions</dt>
            <dd className="num">{fmt(DEFAULT_RUN_OPTIONS.runs)} per plan</dd>
            <dd className="sc-source">
              Same random seed every time, so the numbers don't jump around.
            </dd>
          </div>
        </dl>
        <p className="sc-caption">
          Every number in the app has its source listed in the project's data file
          (src/lib/data.ts).
        </p>
      </aside>
    </div>
  )
}
