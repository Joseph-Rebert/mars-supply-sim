import { useId, type ReactNode } from 'react'
import {
  DESTINATION_PROFILES,
  O2_SOURCE_READINESS,
  WATER_RECOVERY_RATE_ISS_2023,
  WATER_RECOVERY_RATE_ISS_PRE_BPA,
} from '../lib/data'
import {
  CREW_MAX,
  CREW_MIN,
  DAYS_PER_MONTH,
  daysToMonths,
  monthsToDays,
  resupplyCadenceDays,
  withCrewSize,
  withDestination,
} from '../lib/plan'
import type { Destination, MissionPlan, O2Source, ReadinessTier } from '../lib/types'
import { Readout } from './Readout'

type Props = {
  plan: MissionPlan
  onChange: (plan: MissionPlan) => void
  /** Omitted until the Monte Carlo runner exists (GEA-22); the button then shows why it's disabled. */
  onRun?: () => void
  /** Why the plan can't run as configured (e.g. a flight over capacity); disables the button. */
  runBlockedReason?: string
}

const DURATION_MONTHS = { min: 6, max: 36 }
const RECOVERY_PCT = { min: 70, max: 98 }
const GREENHOUSE_M2 = { min: 0, max: 200, step: 5 }

const READINESS_LABEL: Record<ReadinessTier, string> = {
  flightProven: 'flight-proven',
  demonstrated: 'demonstrated',
  concept: 'concept',
}

function commsDelayLabel(destination: Destination): string {
  const { min, max } = DESTINATION_PROFILES[destination].commsDelaySeconds
  if (max < 60) return `${min.toFixed(1)} s`
  return `${Math.round(min / 60)}–${Math.round(max / 60)} min`
}

function resupplyLabel(destination: Destination): string {
  const days = resupplyCadenceDays(destination)
  return days === null ? 'any day' : `every ~${Math.round(days / DAYS_PER_MONTH)} mo`
}

function o2SourceHint(source: O2Source, destination: Destination): string {
  if (source === 'isru') {
    const { isruLabel, isruReadiness } = DESTINATION_PROFILES[destination]
    return `${isruLabel} · ${READINESS_LABEL[isruReadiness]}`
  }
  const what = source === 'electrolysis' ? 'Splits recycled water' : 'Shipped from Earth'
  return `${what} · ${READINESS_LABEL[O2_SOURCE_READINESS[source]]}`
}

type Option<T extends string> = { value: T; label: string }

/** Radio group styled as a segmented switch; arrow keys move between options. */
function Segmented<T extends string>(props: {
  legend: string
  name: string
  value: T
  options: Option<T>[]
  onChange: (value: T) => void
}) {
  return (
    <fieldset className="field segmented-field">
      <legend className="field-label">{props.legend}</legend>
      <div className="segmented">
        {props.options.map((o) => (
          <label key={o.value} className="segmented-option">
            <input
              type="radio"
              name={props.name}
              value={o.value}
              checked={props.value === o.value}
              onChange={() => props.onChange(o.value)}
            />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

function Slider(props: {
  label: string
  display: string
  value: number
  min: number
  max: number
  step?: number
  disabled?: boolean
  hint?: ReactNode
  onChange: (value: number) => void
}) {
  const id = useId()
  return (
    <div className="field">
      <div className="field-row">
        <label className="field-label" htmlFor={id}>
          {props.label}
        </label>
        <output className="field-value" htmlFor={id}>
          {props.display}
        </output>
      </div>
      <input
        id={id}
        className="slider"
        type="range"
        min={props.min}
        max={props.max}
        step={props.step ?? 1}
        value={props.value}
        disabled={props.disabled}
        aria-valuetext={props.display}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
      {props.hint && <p className="hint">{props.hint}</p>}
    </div>
  )
}

export function MissionSetupForm({ plan, onChange, onRun, runBlockedReason }: Props) {
  const { lifeSupport } = plan
  const months = daysToMonths(plan.durationDays)
  const recoveryPct = Math.round(lifeSupport.waterRecoveryRate * 100)
  const setLifeSupport = (patch: Partial<MissionPlan['lifeSupport']>) =>
    onChange({ ...plan, lifeSupport: { ...lifeSupport, ...patch } })

  return (
    <form
      className="setup-form"
      onSubmit={(e) => {
        e.preventDefault()
        if (!runBlockedReason) onRun?.()
      }}
    >
      <Segmented<Destination>
        legend="Destination"
        name="destination"
        value={plan.destination}
        options={[
          { value: 'mars', label: 'Mars' },
          { value: 'moon', label: 'Moon' },
        ]}
        onChange={(destination) => onChange(withDestination(plan, destination))}
      />
      <div className="readouts">
        <Readout label="Comms delay" value={commsDelayLabel(plan.destination)} />
        <Readout label="Resupply" value={resupplyLabel(plan.destination)} />
      </div>

      <Slider
        label="Crew"
        display={String(plan.crew.length).padStart(2, '0')}
        value={plan.crew.length}
        min={CREW_MIN}
        max={CREW_MAX}
        onChange={(n) => onChange(withCrewSize(plan, n))}
      />
      <Slider
        label="Duration"
        display={`${months} mo · ${plan.durationDays} d`}
        value={months}
        min={DURATION_MONTHS.min}
        max={DURATION_MONTHS.max}
        onChange={(m) => onChange({ ...plan, durationDays: monthsToDays(m) })}
      />
      <Slider
        label="Water recovery"
        display={`${recoveryPct} %`}
        value={recoveryPct}
        min={RECOVERY_PCT.min}
        max={RECOVERY_PCT.max}
        hint={`ISS: ${Math.round(WATER_RECOVERY_RATE_ISS_PRE_BPA * 100)} % → ${Math.round(
          WATER_RECOVERY_RATE_ISS_2023 * 100,
        )} % (2023)`}
        onChange={(pct) => setLifeSupport({ waterRecoveryRate: pct / 100 })}
      />

      <div className="field">
        <Segmented<O2Source>
          legend="O₂ source"
          name="o2Source"
          value={lifeSupport.o2Source}
          options={[
            { value: 'electrolysis', label: 'Electrolysis' },
            { value: 'isru', label: 'ISRU' },
            { value: 'tanks', label: 'Tanks' },
          ]}
          onChange={(o2Source) => setLifeSupport({ o2Source })}
        />
        <p className="hint">{o2SourceHint(lifeSupport.o2Source, plan.destination)}</p>
      </div>

      <div className="field">
        <label className="switch-row">
          <span className="field-label">Greenhouse</span>
          <input
            className="switch"
            type="checkbox"
            checked={lifeSupport.greenhouse.enabled}
            onChange={(e) =>
              setLifeSupport({
                greenhouse: { ...lifeSupport.greenhouse, enabled: e.target.checked },
              })
            }
          />
        </label>
        <Slider
          label="Growing area"
          display={`${lifeSupport.greenhouse.areaM2} m²`}
          value={lifeSupport.greenhouse.areaM2}
          min={GREENHOUSE_M2.min}
          max={GREENHOUSE_M2.max}
          step={GREENHOUSE_M2.step}
          disabled={!lifeSupport.greenhouse.enabled}
          onChange={(areaM2) =>
            setLifeSupport({ greenhouse: { ...lifeSupport.greenhouse, areaM2 } })
          }
        />
      </div>

      <button
        className="btn btn-primary btn-block"
        type="submit"
        disabled={!onRun || runBlockedReason !== undefined}
      >
        Run mission
      </button>
      {runBlockedReason ? (
        <p className="hint is-critical" role="alert">
          {runBlockedReason}
        </p>
      ) : (
        !onRun && <p className="hint">Runs once the Monte Carlo runner lands (GEA-22).</p>
      )}
    </form>
  )
}
