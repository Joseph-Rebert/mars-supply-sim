import { COMPONENTS, SHIPPING_OVERHEAD_KG_PER_KG } from '../lib/data'
import { clampLaunchDate, withFlightLaunchDate } from '../lib/launchDates'
import {
  flightCapacity,
  massStatus,
  totalLaunchMassKg,
  withFlightAdded,
  withFlightRemoved,
  withFlightUpdated,
  type FlightCapacity,
  type MassStatus,
} from '../lib/manifest'
import {
  COMPONENT_KEYS,
  CONSUMABLE_KEYS,
  type CargoFlight,
  type ConsumableKey,
  type MissionPlan,
} from '../lib/types'
import { fmt } from './format'
import { LaunchDatePicker } from './LaunchDatePicker'
import type { Tone } from './StatTile'
import { RESOURCE_LABELS } from './themeColors'

type Props = {
  plan: MissionPlan
  onChange: (update: (plan: MissionPlan) => MissionPlan) => void
}

const CONSUMABLE_STEP_KG = 50

const STATUS_TONE: Record<MassStatus, Tone> = {
  ok: 'nominal',
  caution: 'caution',
  over: 'critical',
}

const CONTAINER: Record<ConsumableKey, string> = { o2: 'tank', water: 'bags', food: 'packaging' }

const overheadHint = (key: ConsumableKey) =>
  `+${Math.round(SHIPPING_OVERHEAD_KG_PER_KG[key] * 100)}% ${CONTAINER[key]}`

function Stepper(props: {
  label: string
  value: number
  step: number
  onChange: (value: number) => void
}) {
  const set = (v: number) => props.onChange(Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0)
  return (
    <div className="stepper">
      <button
        type="button"
        className="stepper-btn"
        aria-label={`Decrease ${props.label}`}
        disabled={props.value <= 0}
        onClick={() => set(props.value - props.step)}
      >
        −
      </button>
      <input
        className="stepper-input"
        type="number"
        inputMode="numeric"
        min={0}
        step={props.step}
        value={props.value}
        aria-label={props.label}
        onChange={(e) => set(e.target.valueAsNumber)}
      />
      <button
        type="button"
        className="stepper-btn"
        aria-label={`Increase ${props.label}`}
        onClick={() => set(props.value + props.step)}
      >
        +
      </button>
    </div>
  )
}

function MassBar({ cap, label }: { cap: FlightCapacity; label: string }) {
  const { massKg, capacityKg } = cap
  const pct = capacityKg > 0 ? (massKg / capacityKg) * 100 : massKg > 0 ? Infinity : 0
  return (
    <div className={`mass-bar is-${STATUS_TONE[massStatus(cap)]}`}>
      <div
        className="mass-bar-track"
        role="meter"
        aria-label={`${label} launch mass`}
        aria-valuemin={0}
        aria-valuemax={Math.round(capacityKg)}
        aria-valuenow={Math.round(Math.min(massKg, capacityKg))}
        aria-valuetext={`${fmt(massKg)} of ${fmt(capacityKg)} kg`}
      >
        <div className="mass-bar-fill" style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <div className="mass-bar-text">
        <span>
          {fmt(massKg)} / {fmt(capacityKg)} kg
        </span>
        <span>{Number.isFinite(pct) ? `${Math.round(pct)}%` : '—'}</span>
      </div>
    </div>
  )
}

function FlightItems({
  flight,
  onChange,
}: {
  flight: CargoFlight
  onChange: (update: (flight: CargoFlight) => CargoFlight) => void
}) {
  return (
    <div className="line-items">
      {CONSUMABLE_KEYS.map((key) => (
        <div key={key} className="line-item">
          <span className="line-item-label">
            {RESOURCE_LABELS[key]} kg
            <span className="line-item-hint">{overheadHint(key)}</span>
          </span>
          <Stepper
            label={`${RESOURCE_LABELS[key]} kg on ${flight.label}`}
            value={flight.consumablesKg[key]}
            step={CONSUMABLE_STEP_KG}
            onChange={(kg) =>
              onChange((f) => ({ ...f, consumablesKg: { ...f.consumablesKg, [key]: kg } }))
            }
          />
        </div>
      ))}
      {COMPONENT_KEYS.map((key) => (
        <div key={key} className="line-item">
          <span className="line-item-label">
            {COMPONENTS[key].label} spares
            <span className="line-item-hint">{COMPONENTS[key].spareMassKg} kg each</span>
          </span>
          <Stepper
            label={`${COMPONENTS[key].label} spares on ${flight.label}`}
            value={flight.spares[key]}
            step={1}
            onChange={(n) => onChange((f) => ({ ...f, spares: { ...f.spares, [key]: n } }))}
          />
        </div>
      ))}
    </div>
  )
}

/** One block per cargo flight: launch date (GEA-41), line items, and mass vs. its date's capacity. */
export function CargoManifest({ plan, onChange }: Props) {
  return (
    <div className="manifest">
      <div className="manifest-summary">
        <div className="stat-cell">
          <span className="stat-label">Total launch mass</span>
          <span className="stat-value">
            {fmt(totalLaunchMassKg(plan))}
            <span className="stat-unit">kg</span>
          </span>
        </div>
        <button type="button" className="btn btn-small" onClick={() => onChange(withFlightAdded)}>
          + Add flight
        </button>
      </div>

      {plan.flights.map((f) => (
        <section key={f.id} className="flight-block" aria-label={f.label}>
          <LaunchDatePicker
            plan={plan}
            flight={f}
            onChange={(date) => onChange((p) => withFlightLaunchDate(p, f.id, date))}
          />
          <FlightItems
            flight={f}
            onChange={(update) => onChange((p) => withFlightUpdated(p, f.id, update))}
          />
          <div className="flight-footer">
            <MassBar
              cap={flightCapacity(plan, {
                ...f,
                launchDate: clampLaunchDate(plan.destination, f.launchDate),
              })}
              label={f.label}
            />
            {plan.flights.length > 1 && (
              <button
                type="button"
                className="btn btn-small btn-quiet"
                aria-label={`Remove ${f.label}`}
                onClick={() => onChange((p) => withFlightRemoved(p, f.id))}
              >
                Remove
              </button>
            )}
          </div>
        </section>
      ))}
    </div>
  )
}
