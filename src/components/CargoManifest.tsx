import { COMPONENTS, SHIPPING_OVERHEAD_KG_PER_KG } from '../lib/data'
import {
  flightBudget,
  planLaunchMassKg,
  withFlightAdded,
  withFlightRemoved,
  withFlightUpdated,
  type BudgetStatus,
  type FlightBudget,
} from '../lib/manifest'
import {
  COMPONENT_KEYS,
  CONSUMABLE_KEYS,
  type CargoFlight,
  type ComponentKey,
  type ConsumableKey,
  type MissionPlan,
} from '../lib/types'
import { fmt } from './format'
import type { Tone } from './StatTile'
import { RESOURCE_LABELS } from './themeColors'

type Props = {
  plan: MissionPlan
  onChange: (plan: MissionPlan) => void
}

const CONSUMABLE_STEP_KG = 50

const STATUS_TONE: Record<BudgetStatus, Tone> = {
  ok: 'nominal',
  caution: 'caution',
  over: 'critical',
}

function Stepper(props: {
  label: string
  value: number
  step: number
  onChange: (value: number) => void
}) {
  const set = (v: number) => props.onChange(Math.max(0, Number.isFinite(v) ? v : 0))
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
        onChange={(e) => set(Math.round(e.target.valueAsNumber))}
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

function MassBar({ budget, label }: { budget: FlightBudget; label: string }) {
  const { massKg, limitKg, status } = budget
  const pct = limitKg > 0 ? (massKg / limitKg) * 100 : massKg > 0 ? Infinity : 0
  return (
    <div className={`mass-bar is-${STATUS_TONE[status]}`}>
      <div
        className="mass-bar-track"
        role="meter"
        aria-label={`${label} launch mass`}
        aria-valuemin={0}
        aria-valuemax={Math.round(limitKg)}
        aria-valuenow={Math.round(Math.min(massKg, limitKg))}
        aria-valuetext={`${fmt(massKg)} of ${fmt(limitKg)} kg`}
      >
        <div className="mass-bar-fill" style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <div className="mass-bar-text">
        <span>
          {fmt(massKg)} / {fmt(limitKg)} kg
        </span>
        <span>{Number.isFinite(pct) ? `${Math.round(pct)}%` : '—'}</span>
      </div>
    </div>
  )
}

const CONTAINER: Record<ConsumableKey, string> = { o2: 'tank', water: 'bags', food: 'packaging' }

const overheadHint = (key: ConsumableKey) =>
  `+${Math.round(SHIPPING_OVERHEAD_KG_PER_KG[key] * 100)}% ${CONTAINER[key]}`

/** Rows are line items, columns are cargo flights; every cell edits the plan through lib/manifest. */
export function CargoManifest({ plan, onChange }: Props) {
  const budgets = plan.flights.map((f) => flightBudget(plan, f))
  const update = (flight: CargoFlight, patch: (f: CargoFlight) => CargoFlight) =>
    onChange(withFlightUpdated(plan, flight.id, patch))

  const setConsumable = (flight: CargoFlight, key: ConsumableKey, kg: number) =>
    update(flight, (f) => ({ ...f, consumablesKg: { ...f.consumablesKg, [key]: kg } }))
  const setSpares = (flight: CargoFlight, key: ComponentKey, count: number) =>
    update(flight, (f) => ({ ...f, spares: { ...f.spares, [key]: count } }))

  return (
    <div className="manifest">
      <div className="manifest-summary">
        <div className="stat-cell">
          <span className="stat-label">Total launch mass</span>
          <span className="stat-value">
            {fmt(planLaunchMassKg(plan))}
            <span className="stat-unit">kg</span>
          </span>
        </div>
        <button type="button" className="btn" onClick={() => onChange(withFlightAdded(plan))}>
          + Add flight
        </button>
      </div>

      <div className="manifest-scroll">
        <table className="manifest-table">
          <thead>
            <tr>
              <th scope="col" className="manifest-item">
                <span className="visually-hidden">Line item</span>
              </th>
              {plan.flights.map((f, i) => (
                <th key={f.id} scope="col" className="manifest-flight">
                  <div className="manifest-flight-head">
                    <span className="manifest-flight-label">{f.label}</span>
                    {i > 0 && (
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={`Remove ${f.label}`}
                        onClick={() => onChange(withFlightRemoved(plan, f.id))}
                      >
                        ×
                      </button>
                    )}
                  </div>
                  <span className="manifest-flight-date">L {f.launchDate}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CONSUMABLE_KEYS.map((key) => (
              <tr key={key}>
                <th scope="row" className="manifest-item">
                  {RESOURCE_LABELS[key]} kg
                  <span className="manifest-item-hint">{overheadHint(key)}</span>
                </th>
                {plan.flights.map((f) => (
                  <td key={f.id}>
                    <Stepper
                      label={`${RESOURCE_LABELS[key]} kg on ${f.label}`}
                      value={f.consumablesKg[key]}
                      step={CONSUMABLE_STEP_KG}
                      onChange={(kg) => setConsumable(f, key, kg)}
                    />
                  </td>
                ))}
              </tr>
            ))}
            {COMPONENT_KEYS.map((key) => (
              <tr key={key}>
                <th scope="row" className="manifest-item">
                  {COMPONENTS[key].label} spares
                  <span className="manifest-item-hint">{COMPONENTS[key].spareMassKg} kg each</span>
                </th>
                {plan.flights.map((f) => (
                  <td key={f.id}>
                    <Stepper
                      label={`${COMPONENTS[key].label} spares on ${f.label}`}
                      value={f.spares[key]}
                      step={1}
                      onChange={(n) => setSpares(f, key, n)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" className="manifest-item">
                Mass vs. limit
              </th>
              {plan.flights.map((f, i) => (
                <td key={f.id}>
                  <MassBar budget={budgets[i]} label={f.label} />
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
