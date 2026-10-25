import { useState } from 'react'
import { missionMonth } from '../lib/analysis'
import { EQUIPMENT } from '../lib/data'
import { daysBetween } from '../lib/dates'
import { clampLaunchDate, withFlightLaunchDate } from '../lib/launchDates'
import {
  flightCapacity,
  flightContents,
  withEquipmentOn,
  withFlightAdded,
  withFlightRemoved,
  withFlightUpdated,
  type CargoLine,
} from '../lib/manifest'
import type { OrderSlot, OrderSlotStatus } from '../lib/supplyChain'
import { monthLabel } from '../lib/timeline'
import { EQUIPMENT_KEYS, type CargoFlight, type MissionPlan } from '../lib/types'
import { FlightItems, MassBar } from './CargoManifest'
import { LaunchDatePicker } from './LaunchDatePicker'

/** A short tag when the arrival is a problem; the full reason shows on hover. */
const ARRIVAL_NOTE: Partial<Record<OrderSlotStatus, { tag: string; why: string; tone: string }>> = {
  thin: {
    tag: 'Cutting it close',
    why: 'Supplies dip below the safety buffer before it lands.',
    tone: 'caution',
  },
  late: {
    tag: 'Lands too late',
    why: 'In unlucky missions, supplies run out before it lands.',
    tone: 'critical',
  },
}

const kg = (n: number) => `${Math.round(n).toLocaleString('en-US')} kg`
const tonnes = (n: number) => `${(n / 1000).toFixed(1)} t`

type Props = {
  /** The plan being edited: contents, weights and dates follow edits at once. */
  plan: MissionPlan
  /** The last run's order slots: in-time verdicts (which need the sim) and unused launch windows. */
  runSlots: OrderSlot[]
  onChange: (update: (plan: MissionPlan) => MissionPlan) => void
}

/** "f4" when the plan has f1–f3: the id withFlightAdded gives the next rocket. */
function nextFlightId(flights: readonly CargoFlight[]): string {
  const n = flights.reduce((max, f) => Math.max(max, Number(f.id.replace(/\D/g, '')) || 0), 0)
  return `f${n + 1}`
}

/**
 * What's being shipped: one card per rocket with its dates, a bar showing what takes up the room,
 * what's on it, and a short tag when it lands too late or is too heavy.
 */
export function ShipmentsView({ plan, runSlots, onChange }: Props) {
  const [open, setOpen] = useState<string | null>(null)

  const flights = [...plan.flights].sort((a, b) => a.launchDate.localeCompare(b.launchDate))
  const openWindows = runSlots.filter((s) => s.flights.length === 0)
  const book = (launchDate: string) => {
    const id = nextFlightId(plan.flights)
    onChange((p) => withFlightLaunchDate(withFlightAdded(p), id, launchDate))
    setOpen(id)
  }
  const unpacked = EQUIPMENT_KEYS.filter((k) => !plan.flights.some((f) => f.equipment?.includes(k)))

  return (
    <div className="sc-ship">
      <div className="sc-ship-cards">
        {flights.map((f) => (
          <RocketCard
            key={f.id}
            plan={plan}
            flight={f}
            status={
              runSlots.find((s) =>
                s.flights.some((x) => x.id === f.id && x.launchDate === f.launchDate),
              )?.status
            }
            open={open === f.id}
            onToggle={() => setOpen(open === f.id ? null : f.id)}
            onChange={onChange}
            onRemoved={() => setOpen(null)}
          />
        ))}
        {openWindows.map((s) => (
          <article key={s.launchDate} className="sc-rocket is-empty">
            <h3 className="sc-rocket-name">Free launch slot</h3>
            <p className="sc-muted">
              A rocket could leave in {monthLabel(s.launchDate)} and land in month{' '}
              {missionMonth(s.arrivalDay)}. Nothing is booked on it yet; cargo would need ordering
              by {monthLabel(s.orderBy)}.
            </p>
            <button type="button" className="sc-link" onClick={() => book(s.launchDate)}>
              Book a rocket for this slot
            </button>
          </article>
        ))}
      </div>
      <div className="sc-ship-foot">
        <button
          type="button"
          className="sc-btn"
          onClick={() => {
            setOpen(nextFlightId(plan.flights))
            onChange(withFlightAdded)
          }}
        >
          + Add rocket
        </button>
        {unpacked.length > 0 && (
          <p className="sc-muted tone-caution">
            Not on any rocket yet: {unpacked.map((k) => EQUIPMENT[k].label).join(', ')}.
          </p>
        )}
      </div>
    </div>
  )
}

function RocketCard(props: {
  plan: MissionPlan
  flight: CargoFlight
  status?: OrderSlotStatus
  open: boolean
  onToggle: () => void
  onChange: (update: (plan: MissionPlan) => MissionPlan) => void
  onRemoved: () => void
}) {
  const { plan, flight, status } = props
  const launchDate = clampLaunchDate(plan.destination, flight.launchDate)
  const cap = flightCapacity(plan, { ...flight, launchDate })
  const arrivalDay = daysBetween(plan.startDate, cap.transfer.arrivalDate)
  const lines = flightContents(flight)
  const note = cap.overCapacity
    ? {
        tag: 'Too heavy',
        why: `${kg(cap.massKg - cap.capacityKg)} more than it can carry on this date.`,
        tone: 'critical',
      }
    : status
      ? ARRIVAL_NOTE[status]
      : undefined
  return (
    <article className="sc-rocket" aria-label={flight.label}>
      <div className="sc-rocket-head">
        <h3 className="sc-rocket-name">{flight.label}</h3>
        <span
          className="sc-rocket-full num"
          title={`${tonnes(cap.massKg)} of ${tonnes(cap.capacityKg)}`}
        >
          {Math.round((cap.massKg / cap.capacityKg) * 100)}% full
        </span>
      </div>
      <p className="sc-rocket-when">
        <span className="num">
          {monthLabel(launchDate)} → {monthLabel(cap.transfer.arrivalDate)}
        </span>
        {arrivalDay > 0 && <span> · month {missionMonth(arrivalDay)}</span>}
        {note && (
          <span className={`sc-tag tone-${note.tone}`} title={note.why}>
            {note.tag}
          </span>
        )}
      </p>

      <RoomBar lines={lines} capacityKg={cap.capacityKg} label={flight.label} />

      {lines.length === 0 ? (
        <p className="sc-muted">Nothing packed yet.</p>
      ) : (
        <ul className="sc-manifest">
          {lines.map((l) => (
            <li key={l.label} title={l.detail}>
              <span className={`sc-swatch is-${l.group}`} aria-hidden="true" />
              <span className="sc-manifest-label">{l.label}</span>
              <span className="num sc-manifest-amount">{l.amount}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="sc-rocket-foot">
        <button
          type="button"
          className="sc-link"
          aria-expanded={props.open}
          onClick={props.onToggle}
        >
          {props.open ? 'Done' : 'Change cargo'}
        </button>
      </div>

      {props.open && (
        <RocketEditor
          plan={plan}
          flight={flight}
          onChange={props.onChange}
          onRemoved={props.onRemoved}
        />
      )}
    </article>
  )
}

/** How the rocket's room is used: one segment per manifest line, empty space left plain. */
function RoomBar({
  lines,
  capacityKg,
  label,
}: {
  lines: CargoLine[]
  capacityKg: number
  label: string
}) {
  return (
    <div className="sc-room" role="img" aria-label={`${label}: how its room is used`}>
      {lines.map((l) => (
        <span
          key={l.label}
          className={`sc-room-seg is-${l.group}`}
          style={{ width: `${Math.min(100, (l.launchKg / capacityKg) * 100)}%` }}
          title={`${l.label}: ${kg(l.launchKg)} with packaging`}
        />
      ))}
    </div>
  )
}

/** One rocket's cargo: its date, supplies and spare parts, equipment, and how full it is. */
function RocketEditor(props: {
  plan: MissionPlan
  flight: CargoFlight
  onChange: (update: (plan: MissionPlan) => MissionPlan) => void
  onRemoved: () => void
}) {
  const { plan, flight, onChange } = props
  const launchDate = clampLaunchDate(plan.destination, flight.launchDate)
  return (
    <div className="sc-editor">
      <LaunchDatePicker
        plan={plan}
        flight={flight}
        showChart={false}
        onChange={(date) => onChange((p) => withFlightLaunchDate(p, flight.id, date))}
      />
      <div className="sc-editor-cols">
        <FlightItems
          flight={flight}
          onChange={(update) => onChange((p) => withFlightUpdated(p, flight.id, update))}
        />
        <fieldset className="sc-equipment">
          <legend>Equipment</legend>
          {EQUIPMENT_KEYS.map((k) => {
            const here = flight.equipment?.includes(k) ?? false
            const elsewhere = plan.flights.find(
              (f) => f.id !== flight.id && f.equipment?.includes(k),
            )
            return (
              <label key={k} className="sc-check">
                <input
                  type="checkbox"
                  checked={here}
                  onChange={(e) =>
                    onChange((p) => withEquipmentOn(p, k, e.target.checked ? flight.id : null))
                  }
                />
                <span>
                  {EQUIPMENT[k].label}{' '}
                  <span className="sc-caption">
                    {kg(EQUIPMENT[k].massKg)}
                    {elsewhere && !here ? ` · now on ${elsewhere.label}` : ''}
                  </span>
                </span>
              </label>
            )
          })}
        </fieldset>
      </div>
      <div className="sc-editor-foot">
        <MassBar cap={flightCapacity(plan, { ...flight, launchDate })} label={flight.label} />
        {plan.flights.length > 1 && (
          <button
            type="button"
            className="sc-link"
            onClick={() => {
              props.onRemoved()
              onChange((p) => withFlightRemoved(p, flight.id))
            }}
          >
            Remove this rocket
          </button>
        )}
      </div>
    </div>
  )
}
